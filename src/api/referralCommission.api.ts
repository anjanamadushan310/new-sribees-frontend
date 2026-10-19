/**
 * Per-product referral commission rates.
 * Targets /api/v1/admin/referral-commission — role-gated on the server:
 * product defaults and programme settings are Super Admin only; a Branch
 * Manager sets their own branch's override, up to the cap.
 *
 * A rate only affects orders placed after it changes: checkout freezes the
 * rate onto each order line.
 */
import { isAxiosError } from 'axios';
import apiClient from './client';

export interface ReferralProgramSettings {
    /** Highest % a Branch Manager may set. Super Admins are not capped. */
    branch_max_percent: number;
    /** Fraction of a product's rate paid to the partner's upline (0.5 = half). */
    level2_share: number;
    /** The best rate on any product on sale right now. */
    highest_live_percent: number;
}

export interface RateResult {
    product_id: string;
    inventory_id?: string;
    branch_id?: string;
    /** The branch override, or null when the branch inherits. */
    referral_commission_percentage: number | null;
    /** The product default, or null when there is none (earns 0). */
    global_referral_commission_percentage: number | null;
    /** What an order placed now earns: override -> default -> 0. */
    effective_referral_commission: number;
}

export interface RateChange {
    branch_id: string | null;
    old_percentage: number | null;
    new_percentage: number | null;
    changed_by: string | null;
    changed_at: string | null;
}

const BASE = '/admin/referral-commission';

export const referralCommissionApi = {
    settings: async (): Promise<ReferralProgramSettings> => {
        const res = await apiClient.get<{ data: ReferralProgramSettings }>(`${BASE}/settings`);
        return res.data.data;
    },

    updateSettings: async (
        payload: Partial<Pick<ReferralProgramSettings, 'branch_max_percent' | 'level2_share'>>
    ): Promise<ReferralProgramSettings> => {
        const res = await apiClient.put<{ data: ReferralProgramSettings }>(`${BASE}/settings`, payload);
        return res.data.data;
    },

    /** Super Admin. `null` clears the default (the product then earns 0). */
    setProductRate: async (productId: string, percentage: number | null): Promise<RateResult> => {
        const res = await apiClient.put<{ data: RateResult }>(`${BASE}/products/${productId}`, {
            percentage,
        });
        return res.data.data;
    },

    /** Branch override. `null` clears it (the branch inherits the default). */
    setBranchRate: async (inventoryId: string, percentage: number | null): Promise<RateResult> => {
        const res = await apiClient.put<{ data: RateResult }>(`${BASE}/inventory/${inventoryId}`, {
            percentage,
        });
        return res.data.data;
    },

    history: async (productId: string): Promise<RateChange[]> => {
        const res = await apiClient.get<{ data: { changes: RateChange[] } }>(
            `${BASE}/products/${productId}/history`
        );
        return res.data.data.changes;
    },
};

type ErrorBody = { detail?: string | { error?: { message?: string } } };

/**
 * The server's message for a refused request, whichever shape it came in:
 * a plain FastAPI `detail` string, or this API's `{ error: { message } }`.
 */
export const apiDetailMessage = (err: unknown): string | null => {
    if (!isAxiosError<ErrorBody>(err)) return null;
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    return detail?.error?.message ?? null;
};

/** The server's reason for a refused rate change (cap, other branch, …). */
export const rateErrorMessage = (err: unknown): string =>
    apiDetailMessage(err) ?? 'Could not update the commission.';
