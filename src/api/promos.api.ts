/**
 * Customer Promos API (/api/v1/admin/customers/{id}/promo)
 *
 * The 1-to-1 retention workflow: issue a private coupon to one named customer
 * from their profile drawer.
 *
 * This is deliberately not the same thing as creating a coupon on the Coupons
 * page. A campaign code handed to one person leaks — the moment it reaches a
 * group chat it is an uncapped discount for everybody. A coupon issued here
 * carries `target_user_id`, so the database itself refuses it for anyone else.
 */
import apiClient from './client';

export type PromoPresetKey = 'winback' | 'freedel' | 'apology';

export interface PromoPreset {
    key: PromoPresetKey;
    label: string;
    code_prefix: string;
    discount_type: 'percentage' | 'fixed';
    discount_value: number;
    min_order_value: number;
    valid_days: number;
}

/** Every field except `preset` overrides that preset's default. */
export interface AssignPromoPayload {
    preset: PromoPresetKey;
    code?: string;
    discount_type?: 'percentage' | 'fixed';
    discount_value?: number;
    min_order_value?: number;
    valid_days?: number;
}

export interface AssignedPromo {
    coupon_id: string;
    code: string;
    discount_type: 'percentage' | 'fixed';
    discount_value: number;
    min_order_value: number;
    valid_until: string;
    target_user_id: string;
    /**
     * Whether delivery actually happened. Reported rather than assumed: the
     * coupon exists either way, and a manager needs to know whether to tell
     * the customer about it themselves.
     */
    auto_collected: boolean;
    push_sent: boolean;
}

export const promosApi = {
    /**
     * The preset offers the dialog shows. Served from the backend so every
     * branch offers the same terms and changing them is not a frontend release.
     */
    presets: async (): Promise<PromoPreset[]> => {
        const res = await apiClient.get<{ data: { presets: PromoPreset[] } }>(
            '/admin/customers/promo-presets',
        );
        return res.data.data.presets;
    },

    assign: async (userId: string, payload: AssignPromoPayload): Promise<AssignedPromo> => {
        const res = await apiClient.post<{ data: AssignedPromo }>(
            `/admin/customers/${userId}/promo`,
            payload,
        );
        return res.data.data;
    },
};
