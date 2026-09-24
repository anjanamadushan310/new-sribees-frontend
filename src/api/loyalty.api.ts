/**
 * Admin Loyalty API (/api/v1/admin/loyalty).
 *
 * Levels are read by marketing managers (members-only coupons) and changed
 * only by a Super Admin. A customer's level is never stored: the server reads
 * it from their lifetime points against these thresholds on every request.
 */
import apiClient from './client';

export type RewardDiscountType = 'percentage' | 'fixed';

export interface LoyaltyTier {
    tier_id: string;
    name: string;
    name_si: string | null;
    name_ta: string | null;
    min_points: number;
    color: string | null;
    is_active: boolean;
    reward_discount_type: RewardDiscountType | null;
    reward_discount_value: number | null;
    reward_min_order_value: number | null;
    reward_max_discount: number | null;
    reward_valid_days: number | null;
    /** Customers whose points currently put them on this level. */
    members: number;
    /** Members-only coupons that require this level. */
    coupons: number;
}

export type LoyaltyTierPayload = Omit<LoyaltyTier, 'tier_id' | 'members' | 'coupons'>;

interface Wire<T> {
    success: boolean;
    data: T;
}

export const loyaltyApi = {
    listTiers: async (): Promise<LoyaltyTier[]> => {
        const res = await apiClient.get<Wire<LoyaltyTier[]>>('/admin/loyalty/tiers');
        return res.data.data;
    },
    createTier: async (payload: LoyaltyTierPayload): Promise<LoyaltyTier> => {
        const res = await apiClient.post<Wire<LoyaltyTier>>('/admin/loyalty/tiers', payload);
        return res.data.data;
    },
    updateTier: async (id: string, payload: Partial<LoyaltyTierPayload>): Promise<LoyaltyTier> => {
        const res = await apiClient.put<Wire<LoyaltyTier>>(`/admin/loyalty/tiers/${id}`, payload);
        return res.data.data;
    },
    deleteTier: async (id: string): Promise<void> => {
        await apiClient.delete(`/admin/loyalty/tiers/${id}`);
    },
};
