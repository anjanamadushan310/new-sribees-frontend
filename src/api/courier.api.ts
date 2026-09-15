/**
 * SribeesExpress account operations (/api/v1/admin/courier).
 *
 * None of this is branch-scoped: it configures the courier ACCOUNT — where
 * riders collect from across the whole estate, the secret every inbound status
 * update is verified against, and the COD ledger. The writes are Super Admin
 * only on the server; the two reads open one role wider so a Branch Manager
 * can ask what SribeesExpress still owes us.
 *
 * The COD balance and remittance payloads are passed through from
 * SribeesExpress unchanged and their exact field names are not in the contract
 * we hold, so they are typed loosely on purpose and rendered from whatever
 * arrives rather than from a schema we would be guessing at.
 */
import apiClient from './client';

/** One branch's outcome from the outlet registration sweep. */
export interface OutletSyncResult {
    branch_code: string;
    branch_name: string;
    /** The SribeesExpress outlet whose postal city is the pickup origin for this branch. */
    outlet_id: number | null;
    /**
     * created | updated | recovered | own_account | skipped | failed.
     * `own_account`: the branch books with its own key, so it is collected at
     * the address its SribeesExpress client registered with and needs no outlet.
     */
    action: string;
    detail: string | null;
}

export interface OutletSyncResponse {
    synced: number;
    failed: number;
    results: OutletSyncResult[];
}

/** A directory row the postal city sync switched off that something still names. */
export interface CoverageOrphan {
    postal_city: string;
    district: string;
    /** Saved customer addresses still pointing at it — each one a checkout that will now be refused. */
    addresses: number;
}

/** A postal city SribeesExpress reported under a district other than ours. */
export interface CoverageSkipped {
    postal_city: string;
    district: string;
    held_by_district: string;
}

export interface CoverageSyncResponse {
    fetched: number;
    created: number;
    updated: number;
    reactivated: number;
    deactivated: number;
    /** Saved addresses re-linked to a SribeesExpress postal city id. */
    addresses_matched: number;
    /** Districts SribeesExpress reported on — only these are reconciled. */
    districts_covered: string[];
    orphaned: CoverageOrphan[];
    skipped: CoverageSkipped[];
}

export interface CourierSweepResponse {
    seen: number;
    applied: number;
    /** Distinct SribeesExpress accounts (branch keys) swept. */
    accounts: number;
}

/**
 * The secret SribeesExpress mints is stored encrypted server-side and never
 * returned — registration only reports that it was stored.
 */
export interface WebhookRegistration {
    endpoint_id: number | null;
    url: string;
    environment: 'test' | 'live';
    key_source: 'branch' | 'account';
    secret_stored: boolean;
}

/** One environment's account-wide setup, described without its secret. */
export interface CourierEnvironmentConfig {
    environment: 'test' | 'live';
    /** Origin only — the /api/v1/ecommerce path is appended by the backend. */
    base_url: string | null;
    /**
     * False when the stored URL already carries the /api/v1/ecommerce prefix,
     * which doubles the path and 404s every call.
     */
    base_url_ok: boolean;
    api_key_set: boolean;
    api_key_masked: string | null;
    /**
     * The environment the key's own prefix claims. A mismatch with
     * `environment` means a live key is sitting in the sandbox slot.
     */
    api_key_environment: 'test' | 'live' | 'unknown' | null;
    /** A key IS stored but will not decrypt — the master key changed. Re-enter it. */
    api_key_unreadable: boolean;
    usable: boolean;
    webhook_secret_stored: boolean;
}

/** One branch's own credentials and which environment it books in. */
export interface CourierBranchKeyStatus {
    branch_id: string;
    branch_code: string;
    branch_name: string;
    /** Null when the branch follows the account default. */
    environment_override: 'test' | 'live' | null;
    effective_environment: 'test' | 'live';
    test_key_set: boolean;
    test_key_masked: string | null;
    live_key_set: boolean;
    live_key_masked: string | null;
    key_unreadable: boolean;
    /** branch | account — where the key it actually books with comes from. */
    key_source: 'branch' | 'account';
    set_at: string | null;
    set_by: string | null;
    outlet_id: number | null;
    webhook_secret_stored: boolean;
}

export interface CourierCredentials {
    /** The environment branches book in unless they override it. */
    environment: 'test' | 'live';
    environments: CourierEnvironmentConfig[];
    branches: CourierBranchKeyStatus[];
    /**
     * False means every webhook SribeesExpress sends is rejected, and orders
     * only move when the reconciliation sweep runs.
     */
    webhook_secret_configured: boolean;
    any_key_unreadable: boolean;
    /**
     * dedicated — CREDENTIAL_ENCRYPTION_KEY is set. derived — it comes from
     * JWT_SECRET_KEY, which works but means rotating that secret would make
     * every stored key unreadable.
     */
    credential_encryption: 'dedicated' | 'derived';
}

export interface CourierKeyTestResult {
    ok: boolean;
    environment: 'test' | 'live' | null;
    key_source: 'branch' | 'account' | null;
    detail: string;
    postal_cities: number | null;
}

export type CodBalance = Record<string, unknown>;
export type Remittance = Record<string, unknown>;

export const courierApi = {
    // --- Merchant credentials (Super Admin only) ---

    /**
     * Which SribeesExpress account and environment each branch books against.
     * Masks only — there is no endpoint that reads a key back, just ones that
     * replace it.
     */
    getCredentials: async (): Promise<CourierCredentials> => {
        const res = await apiClient.get<CourierCredentials>('/admin/courier/credentials');
        return res.data;
    },

    /**
     * Set the account-wide key for one environment. Both are held at once, so
     * going live later is a switch rather than a re-entry. An empty value
     * clears the slot. Stored encrypted.
     */
    setAccountKey: async (
        environment: 'test' | 'live',
        apiKey: string,
    ): Promise<CourierCredentials> => {
        const res = await apiClient.put<CourierCredentials>('/admin/courier/credentials/key', {
            environment,
            api_key: apiKey,
        });
        return res.data;
    },

    /** Set the SribeesExpress host for one environment. Origin only. */
    setBaseUrl: async (
        environment: 'test' | 'live',
        baseUrl: string,
    ): Promise<CourierCredentials> => {
        const res = await apiClient.put<CourierCredentials>(
            '/admin/courier/credentials/base-url',
            { environment, base_url: baseUrl },
        );
        return res.data;
    },

    /**
     * Switch every branch without an override between sandbox and live.
     * This is go-live. The server refuses it unless that environment is
     * actually usable.
     */
    setEnvironment: async (environment: 'test' | 'live'): Promise<CourierCredentials> => {
        const res = await apiClient.put<CourierCredentials>(
            '/admin/courier/credentials/environment',
            { environment },
        );
        return res.data;
    },

    /**
     * Give one branch its own SribeesExpress account for an environment.
     * After setting one, re-run the outlet sync: the branch's outlet
     * exists in the old account, not the new one.
     */
    setBranchKey: async (
        branchId: string,
        environment: 'test' | 'live',
        apiKey: string,
    ): Promise<CourierCredentials> => {
        const res = await apiClient.put<CourierCredentials>(
            `/admin/courier/credentials/branches/${branchId}/key`,
            { environment, api_key: apiKey },
        );
        return res.data;
    },

    /** Pin one branch to an environment, or (null) return it to following the account. */
    setBranchEnvironment: async (
        branchId: string,
        environment: 'test' | 'live' | null,
    ): Promise<CourierCredentials> => {
        const res = await apiClient.put<CourierCredentials>(
            `/admin/courier/credentials/branches/${branchId}/environment`,
            { environment },
        );
        return res.data;
    },

    /** Make a real, side-effect-free call with whichever credentials serve this scope. */
    testKey: async (branchId?: string): Promise<CourierKeyTestResult> => {
        const res = await apiClient.post<CourierKeyTestResult>(
            '/admin/courier/credentials/test',
            null,
            { params: branchId ? { branch_id: branchId } : {} },
        );
        return res.data;
    },

    /**
     * Rebuild the postal city directory from SribeesExpress's GET /postal-cities
     * and re-link saved addresses to their postal city ids. Their matching is
     * by id, so an unmatched name reaches the customer as "not serviceable".
     */
    syncPostalCities: async (): Promise<CoverageSyncResponse> => {
        const res = await apiClient.post<CoverageSyncResponse>('/admin/courier/postal-cities/sync');
        return res.data;
    },

    /**
     * Register branches that share the account key as SribeesExpress outlets,
     * so each is priced and collected from its own postal city. Branches with
     * their own key are reported as `own_account` and left alone.
     */
    syncOutlets: async (): Promise<OutletSyncResponse> => {
        const res = await apiClient.post<OutletSyncResponse>('/admin/courier/outlets/sync');
        return res.data;
    },

    /**
     * Run the shipment reconciliation sweep now, across every branch account.
     * SribeesExpress does not retry webhooks, so this poll is the real source
     * of truth; an external cron calls it on a schedule.
     */
    runSweep: async (): Promise<CourierSweepResponse> => {
        const res = await apiClient.post<CourierSweepResponse>('/admin/courier/sync');
        return res.data;
    },

    /**
     * Register our webhook URL with the account serving `branchId` (or the
     * account default). The minted secret is stored encrypted by the backend
     * and never shown; registering the same URL again rotates it.
     */
    registerWebhook: async (
        url: string,
        description = '',
        branchId?: string,
    ): Promise<WebhookRegistration> => {
        const res = await apiClient.post<WebhookRegistration>('/admin/courier/webhook-endpoint', {
            url,
            description,
            branch_id: branchId ?? null,
        });
        return res.data;
    },

    /** Cash SribeesExpress has collected from our customers and not yet paid out. */
    getCodBalance: async (branchId?: string): Promise<CodBalance> => {
        const res = await apiClient.get<{ success: boolean; data: CodBalance }>(
            '/admin/courier/cod-balance',
            { params: branchId ? { branch_id: branchId } : {} },
        );
        return res.data.data;
    },

    /** COD payout history. Read-only — their ops generates and settles the runs. */
    listRemittances: async (limit = 50, offset = 0, branchId?: string): Promise<Remittance[]> => {
        const res = await apiClient.get<{ success: boolean; data: Remittance[] }>(
            '/admin/courier/remittances',
            { params: { limit, offset, ...(branchId ? { branch_id: branchId } : {}) } },
        );
        return res.data.data ?? [];
    },

    /**
     * Which shipments a payout covered, joined back to our order numbers.
     * Reading it also backfills the remittance id onto those orders — being
     * remitted is not a shipment status change, so no webhook ever says so.
     */
    getRemittanceShipments: async (
        remittanceId: number,
    ): Promise<{ rows: Remittance[]; ordersUpdated: number }> => {
        const res = await apiClient.get<{
            success: boolean;
            data: Remittance[];
            orders_updated: number;
        }>(`/admin/courier/remittances/${remittanceId}/shipments`);
        return { rows: res.data.data ?? [], ordersUpdated: res.data.orders_updated ?? 0 };
    },
};
