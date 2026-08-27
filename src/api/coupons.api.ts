/**
 * Admin Coupons API (/api/v1/admin/coupons) — Super Admin + Marketing Manager.
 * Responses are snake_case dicts. Dates are ISO strings.
 */
import apiClient from './client';

export type DiscountType = 'percentage' | 'fixed';

export interface Coupon {
    coupon_id: string;
    code: string;
    description: string | null;
    discount_type: DiscountType;
    discount_value: number;
    min_order_value: number;
    usage_limit: number | null;
    used_count: number;
    valid_from: string;
    valid_until: string;
    is_active: boolean;
    created_at: string | null;
}

export interface CouponPayload {
    code: string;
    description?: string | null;
    discount_type: DiscountType;
    discount_value: number;
    min_order_value?: number;
    usage_limit?: number | null;
    valid_from: string; // ISO
    valid_until: string; // ISO
    is_active?: boolean;
}

export interface CouponListParams {
    page?: number;
    limit?: number;
    search?: string;
    is_active?: boolean;
}

export interface CouponListResult {
    coupons: Coupon[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
}

interface CouponListWire {
    success: boolean;
    data: {
        coupons: Coupon[];
        pagination: { total: number; page: number; limit: number; total_pages: number };
    };
}

interface CouponMutationWire {
    success: boolean;
    data: Coupon;
    message: string;
}

export const couponsApi = {
    list: async (params?: CouponListParams): Promise<CouponListResult> => {
        const clean: Record<string, unknown> = {};
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null && v !== '') clean[k] = v;
            });
        }
        const res = await apiClient.get<CouponListWire>('/admin/coupons', { params: clean });
        return { coupons: res.data.data.coupons, ...res.data.data.pagination };
    },

    create: async (payload: CouponPayload): Promise<Coupon> => {
        const res = await apiClient.post<CouponMutationWire>('/admin/coupons', payload);
        return res.data.data;
    },

    update: async (id: string, payload: Partial<CouponPayload>): Promise<Coupon> => {
        const res = await apiClient.put<CouponMutationWire>(`/admin/coupons/${id}`, payload);
        return res.data.data;
    },

    /** Soft delete — deactivates the coupon on the server. */
    deactivate: async (id: string): Promise<void> => {
        await apiClient.delete(`/admin/coupons/${id}`);
    },

    /** Hard delete — permanently removes the coupon code from the database. */
    delete: async (id: string): Promise<void> => {
        await apiClient.delete(`/admin/coupons/${id}`, { params: { hard: true } });
    },
};
