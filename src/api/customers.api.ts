/**
 * Admin Customer API (/api/v1/admin/customers) — operates on the customer
 * `users` table.
 *
 * Reads (list / profile / orders) need `customers:read` and are branch-isolated
 * server-side: a scoped admin (Branch Manager + their staff, Marketing/Inventory
 * Manager) only sees customers with an order in their branch, and only that
 * branch's orders/stats. Super Admin and Customer Support see everyone.
 * Writes (edit / block / unblock / status) are super_admin + customer_support;
 * delete is super_admin only.
 * Responses are snake_case dicts.
 */
import apiClient from './client';

/**
 * Behavioural segment, derived server-side from order history at read time.
 *
 * 'at_risk' deliberately outranks 'returning': a customer with seven orders who
 * has bought nothing in a month is the most valuable person to win back, and
 * labelling them "Returning" buries them.
 */
export type CustomerSegment = 'returning' | 'new' | 'at_risk';

/** Purchasing history for one customer. Net spend counts DELIVERED orders only. */
export interface CustomerPurchaseStats {
    completed_orders: number;
    /**
     * Lifetime spend, DELIVERED orders only. Refunded money is not revenue —
     * this used to include it, inflating some customers by nearly 50%.
     */
    net_spent: number;
    refunded_amount: number;
    has_refund: boolean;
    last_order_at: string | null;
    segment: CustomerSegment;
}

export interface Customer extends CustomerPurchaseStats, CustomerClosure {
    user_id: string;
    email: string;
    full_name: string | null;
    phone: string | null;
    /** The NIC the customer is identified by. Write-once for them; support
     *  can correct it from the edit form below. */
    nic: string | null;
    alternate_phone: string | null;
    role: string;
    is_active: boolean;
    is_blocked?: boolean;
    blocked_reason?: string | null;
    is_verified: boolean;
    created_at: string | null;
    last_login: string | null;
}

/**
 * Whether the customer closed the account. A closed account keeps its row,
 * NIC and orders; its phone and email are released (NULL) so the person can
 * sign up again, and what it held is kept in deleted_phone / deleted_email.
 */
export interface CustomerClosure {
    is_deleted: boolean;
    deleted_at: string | null;
    deletion_reason: string | null;
    deleted_phone: string | null;
    deleted_email: string | null;
}

/** The same person's other account, found through the NIC. */
export interface LinkedAccount extends CustomerClosure {
    user_id: string;
    full_name: string | null;
    created_at: string | null;
}

export interface CustomerAddress {
    address_id: string;
    address_line1: string;
    address_line2: string | null;
    postal_city: string;
    district: string;
    postal_code: string;
    province: string;
    is_default: boolean;
}

export interface CustomerStats extends CustomerPurchaseStats {
    /**
     * Kept under the original names for existing callers. Both now mean
     * DELIVERED-only and are aliases of completed_orders / net_spent — the
     * profile drawer previously summed every order that was not literally
     * 'cancelled', so a refunded order counted as money the customer spent.
     */
    total_orders: number;
    total_spent: number;
}

export interface CustomerProfile extends CustomerClosure {
    user_id: string;
    email: string | null;
    full_name: string | null;
    phone: string | null;
    nic: string | null;
    alternate_phone: string | null;
    is_active: boolean;
    is_blocked: boolean;
    blocked_reason: string | null;
    is_verified: boolean;
    created_at: string | null;
    last_login: string | null;
    linked_accounts: LinkedAccount[];
    addresses: CustomerAddress[];
    stats: CustomerStats;
}

export interface CustomerOrderItemPreview {
    product_name: string;
    product_image: string | null;
    quantity: number;
    total_items_count: number;
    extra_items_count: number;
}

export interface CustomerOrderAnalytics {
    total_orders: number;
    delivered_count: number;
    cancelled_count: number;
    returned_count: number;
    return_rate: number;
    is_high_return_risk: boolean;
}

export interface CustomerOrder {
    order_id: string;
    order_number: string;
    total_amount: number;
    status: string;
    payment_status: string;
    created_at: string | null;
    items_preview?: CustomerOrderItemPreview;
}

export interface CustomerOrdersParams {
    page?: number;
    limit?: number;
    status?: string;
    start_date?: string;
    end_date?: string;
}

export interface CustomerOrdersResult {
    orders: CustomerOrder[];
    analytics: CustomerOrderAnalytics;
    total: number;
    page: number;
    limit: number;
    pages: number;
}

export interface CustomerListParams {
    page?: number;
    limit?: number;
    search?: string;
    /** Behavioural filter tab. Derived server-side; see CustomerSegment. */
    segment?: CustomerSegment;
    /** The Active / Blocked tabs. */
    is_blocked?: boolean;
    /** The Deleted tab. Without it, closed accounts are left out. */
    deleted?: boolean;
}

export interface CustomerListResult {
    customers: Customer[];
    total: number;
    page: number;
    limit: number;
    pages: number;
}

interface CustomerListWire {
    success: boolean;
    data: {
        users: Customer[];
        pagination: { total: number; page: number; limit: number; pages: number };
    };
}

export const customersApi = {
    list: async (params?: CustomerListParams): Promise<CustomerListResult> => {
        const clean: Record<string, unknown> = {};
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null && v !== '') clean[k] = v;
            });
        }
        const res = await apiClient.get<CustomerListWire>('/admin/customers', { params: clean });
        return { customers: res.data.data.users, ...res.data.data.pagination };
    },

    /** Enable/disable a customer account. is_active is a query param on the API. */
    setStatus: async (userId: string, isActive: boolean): Promise<void> => {
        await apiClient.put(`/admin/customers/${userId}/status`, null, {
            params: { is_active: isActive },
        });
    },

    getProfile: async (userId: string): Promise<CustomerProfile> => {
        const res = await apiClient.get<{ success: boolean; data: CustomerProfile }>(`/admin/customers/${userId}/profile`);
        return res.data.data;
    },

    getOrders: async (
        userId: string,
        paramsOrPage: number | CustomerOrdersParams = 1,
        limit = 10
    ): Promise<CustomerOrdersResult> => {
        const params: Record<string, unknown> = {};
        if (typeof paramsOrPage === 'number') {
            params.page = paramsOrPage;
            params.limit = limit;
        } else {
            if (paramsOrPage.page) params.page = paramsOrPage.page;
            if (paramsOrPage.limit) params.limit = paramsOrPage.limit;
            if (paramsOrPage.status && paramsOrPage.status !== 'all') params.status = paramsOrPage.status;
            if (paramsOrPage.start_date) params.start_date = paramsOrPage.start_date;
            if (paramsOrPage.end_date) params.end_date = paramsOrPage.end_date;
        }

        const res = await apiClient.get<{
            success: boolean;
            data: {
                orders: CustomerOrder[];
                analytics?: CustomerOrderAnalytics;
                pagination: { total: number; page: number; limit: number; pages: number };
            };
        }>(`/admin/customers/${userId}/orders`, { params });

        const rawData = res.data.data;
        const fallbackAnalytics: CustomerOrderAnalytics = {
            total_orders: rawData.pagination.total,
            delivered_count: 0,
            cancelled_count: 0,
            returned_count: 0,
            return_rate: 0,
            is_high_return_risk: false,
        };

        return {
            orders: rawData.orders || [],
            analytics: rawData.analytics || fallbackAnalytics,
            ...rawData.pagination,
        };
    },

    update: async (userId: string, data: { full_name: string; email?: string | null; phone?: string | null }): Promise<void> => {
        await apiClient.put(`/admin/customers/${userId}`, data);
    },

    block: async (userId: string, reason: string): Promise<void> => {
        await apiClient.post(`/admin/customers/${userId}/block`, { reason });
    },

    unblock: async (userId: string): Promise<void> => {
        await apiClient.post(`/admin/customers/${userId}/unblock`);
    },

    delete: async (userId: string): Promise<{ success: boolean; message: string }> => {
        const res = await apiClient.delete<{ success: boolean; message: string }>(`/admin/customers/${userId}`);
        return res.data;
    },
};
