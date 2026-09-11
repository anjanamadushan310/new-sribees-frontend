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

export type CodBalance = Record<string, unknown>;
export type Remittance = Record<string, unknown>;

export const courierApi = {
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
