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

/** One branch's outcome from the pickup-location registration sweep. */
export interface PickupLocationSyncResult {
    branch_code: string;
    branch_name: string;
    pickup_location_id: number | null;
    /**
     * created | updated | recovered | skipped | failed.
     * `recovered` means SribeesExpress already held a location under this
     * branch's name and we re-linked its id — creating a duplicate is refused
     * by design, so this is the repair path, not an error.
     */
    action: string;
    detail: string | null;
}

export interface PickupLocationSyncResponse {
    synced: number;
    failed: number;
    results: PickupLocationSyncResult[];
}

/** A directory row the coverage sync switched off that something still names. */
export interface CoverageOrphan {
    post_office: string;
    district: string;
    /** Saved customer addresses still pointing at it — each one a checkout that will now be refused. */
    addresses: number;
}

export interface CoverageSyncResponse {
    fetched: number;
    created: number;
    updated: number;
    reactivated: number;
    deactivated: number;
    /** Districts SribeesExpress reported on — only these are reconciled. */
    districts_covered: string[];
    orphaned: CoverageOrphan[];
}

export interface CourierSweepResponse {
    seen: number;
    applied: number;
}

/** Shown exactly once, at registration. Never readable again — only rotatable. */
export interface WebhookRegistration {
    secret?: string;
    url?: string;
    [key: string]: unknown;
}

/**
 * One credential slot, described without ever revealing it.
 *
 * `masked` keeps the `sk_test_` / `sk_live_` prefix on purpose: which
 * environment a key books in is the most consequential thing about it, and
 * "did go-live actually happen?" should be answerable at a glance.
 *
 * `source` is where the key this scope ACTUALLY uses comes from, which is not
 * the same question as `is_set` — a branch with no key of its own still books
 * somewhere, and that is what an operator needs to see.
 */
export interface CourierKeyStatus {
    scope: 'account' | 'branch';
    branch_id: string | null;
    branch_code: string | null;
    branch_name: string | null;
    is_set: boolean;
    masked: string | null;
    environment: 'test' | 'live' | 'unknown' | null;
    source: 'branch' | 'account' | 'environment' | 'none';
    set_at: string | null;
    set_by: string | null;
}

export interface CourierCredentials {
    account: CourierKeyStatus;
    branches: CourierKeyStatus[];
}

export interface CourierKeyTestResult {
    ok: boolean;
    environment: 'test' | 'live' | 'unknown' | null;
    detail: string;
    post_offices: number | null;
}

export type CodBalance = Record<string, unknown>;
export type Remittance = Record<string, unknown>;

export const courierApi = {
    // --- Merchant credentials (Super Admin only) ---

    /**
     * Which SribeesExpress account each branch books against. Masks only —
     * there is no endpoint that reads a key back, just ones that replace it.
     */
    getCredentials: async (): Promise<CourierCredentials> => {
        const res = await apiClient.get<CourierCredentials>('/admin/courier/credentials');
        return res.data;
    },

    /**
     * Set the account-wide key — the one every branch without its own books
     * against, and the one the sandbox → live switch turns. An empty value
     * clears it back to the deployment's own COURIER_API_KEY.
     */
    setAccountKey: async (apiKey: string): Promise<CourierCredentials> => {
        const res = await apiClient.put<CourierCredentials>('/admin/courier/credentials', {
            api_key: apiKey,
        });
        return res.data;
    },

    /**
     * Give one branch its own SribeesExpress account, or take it back.
     * After setting one, re-run the pickup-location sync: the branch's pickup
     * address exists in the old account, not the new one.
     */
    setBranchKey: async (branchId: string, apiKey: string): Promise<CourierCredentials> => {
        const res = await apiClient.put<CourierCredentials>(
            `/admin/courier/credentials/branches/${branchId}`,
            { api_key: apiKey },
        );
        return res.data;
    },

    /** Make a real, side-effect-free call with whichever key serves this scope. */
    testKey: async (branchId?: string): Promise<CourierKeyTestResult> => {
        const res = await apiClient.post<CourierKeyTestResult>(
            '/admin/courier/credentials/test',
            null,
            { params: branchId ? { branch_id: branchId } : {} },
        );
        return res.data;
    },

    /**
     * Rebuild post_office_directory from GET /ecommerce/coverage.
     * Run this before the first live order: the directory was hand-seeded and
     * two of its three names do not match SribeesExpress's spelling, which
     * reaches the customer as "not serviceable".
     */
    syncCoverage: async (): Promise<CoverageSyncResponse> => {
        const res = await apiClient.post<CoverageSyncResponse>('/admin/courier/coverage/sync');
        return res.data;
    },

    /**
     * Register every active branch as a pickup location, or update the one
     * already registered. Safe to re-run — an existing registration is
     * PATCHed, never re-created, so ids stay stable and booked shipments keep
     * resolving.
     */
    syncPickupLocations: async (): Promise<PickupLocationSyncResponse> => {
        const res = await apiClient.post<PickupLocationSyncResponse>(
            '/admin/courier/pickup-locations/sync',
        );
        return res.data;
    },

    /**
     * Run the shipment reconciliation sweep now. SribeesExpress does not retry
     * webhooks, so this poll is the real source of truth; an external cron
     * calls it on a schedule and ops calls it by hand after an outage.
     */
    runSweep: async (): Promise<CourierSweepResponse> => {
        const res = await apiClient.post<CourierSweepResponse>('/admin/courier/sync');
        return res.data;
    },

    /**
     * Register our webhook URL. The secret in the response is shown ONCE —
     * it goes into COURIER_WEBHOOK_SECRET and the backend is redeployed, or
     * every inbound status update fails signature verification.
     */
    registerWebhook: async (url: string, description = ''): Promise<WebhookRegistration> => {
        const res = await apiClient.post<{ success: boolean; data: WebhookRegistration }>(
            '/admin/courier/webhook-endpoint',
            null,
            { params: { url, description } },
        );
        return res.data.data;
    },

    /** Cash SribeesExpress has collected from our customers and not yet paid out. */
    getCodBalance: async (): Promise<CodBalance> => {
        const res = await apiClient.get<{ success: boolean; data: CodBalance }>(
            '/admin/courier/cod-balance',
        );
        return res.data.data;
    },

    /** COD payout history. Read-only — their ops generates and settles the runs. */
    listRemittances: async (limit = 50, offset = 0): Promise<Remittance[]> => {
        const res = await apiClient.get<{ success: boolean; data: Remittance[] }>(
            '/admin/courier/remittances',
            { params: { limit, offset } },
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
