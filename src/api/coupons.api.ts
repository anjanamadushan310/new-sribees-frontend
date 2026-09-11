/**
 * Admin Coupons API (/api/v1/admin/coupons) — Super Admin + Marketing Manager.
 * Responses are snake_case dicts. Dates are ISO strings.
 */
import apiClient from './client';

export type DiscountType = 'percentage' | 'fixed';

export interface Coupon {
    coupon_id: string;
    code: string;
    /** Owning branch; null = network-wide (Super Admin only). */
    branch_id?: string | null;
    /** Convenience mirror of `branch_id === null`, sent by the server. */
    is_network_wide?: boolean;
    description: string | null;
    discount_type: DiscountType;
    discount_value: number;
    min_order_value: number;
    max_discount_amount?: number | null;
    usage_limit: number | null;
    used_count: number;
    /** Max redemptions per customer; null = unlimited. */
    per_user_limit: number | null;
    /** Listed in the mobile "Available Offers" feed (customers must collect it). */
    is_public: boolean;
    valid_from: string;
    valid_until: string;
    is_active: boolean;
    created_at: string | null;

    // ---- Financial protection -------------------------------------------
    /** Max total discount this campaign may give away. null = uncapped. */
    budget_cap: number | null;
    /** Discount given so far. */
    budget_spent: number;
    /** budget_spent / budget_cap as a percentage; null when uncapped. */
    budget_used_percent: number | null;
    auto_stop_on_budget: boolean;
    /** Clearance lines count toward neither the discount nor the minimum order. */
    exclude_quick_sale: boolean;

    // ---- Eligibility ------------------------------------------------------
    first_order_only: boolean;
    /** Issued to one named customer via Assign Promo; nobody else can redeem. */
    target_user_id: string | null;
    /** Empty = the whole catalog. */
    category_ids: string[];
    product_ids: string[];

    // ---- Reporting --------------------------------------------------------
    /**
     * Derived server-side from the budget, the dates and is_active — NOT a
     * stored column, so it is never stale. 'depleted' (the campaign spent its
     * allowance) is deliberately distinct from 'inactive' (a person switched it
     * off): only the first one means "this worked, consider funding it again".
     */
    status: CouponStatus;
    /** Gross sales this code brought in, over non-cancelled orders. */
    revenue_generated: number;
    orders_count: number;
}

export type CouponStatus = 'active' | 'scheduled' | 'expired' | 'inactive' | 'depleted';

export interface CouponPayload {
    code: string;
    description?: string | null;
    discount_type: DiscountType;
    discount_value: number;
    min_order_value?: number;
    max_discount_amount?: number | null;
    usage_limit?: number | null;
    per_user_limit?: number | null;
    is_public?: boolean;
    valid_from: string; // ISO
    valid_until: string; // ISO
    is_active?: boolean;

    budget_cap?: number | null;
    auto_stop_on_budget?: boolean;
    exclude_quick_sale?: boolean;
    first_order_only?: boolean;
    /**
     * Catalog eligibility. Omit to leave unchanged on an update; send an empty
     * array to clear a restriction and widen the coupon back to everything.
     */
    category_ids?: string[];
    product_ids?: string[];
}

export interface CouponListParams {
    page?: number;
    limit?: number;
    search?: string;
    is_active?: boolean;
    /** Filter tab. Derived server-side; see Coupon.status. */
    status?: CouponStatus;
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
