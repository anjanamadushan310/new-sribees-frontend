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

export interface Customer {
    user_id: string;
    email: string;
    full_name: string | null;
    phone: string | null;
    role: string;
    is_active: boolean;
    is_blocked?: boolean;
    blocked_reason?: string | null;
    is_verified: boolean;
    created_at: string | null;
    last_login: string | null;
}

export interface CustomerAddress {
    address_id: string;
    address_line1: string;
    address_line2: string | null;
    post_office: string;
    district: string;
    postal_code: string;
    province: string;
    is_default: boolean;
}

export interface CustomerStats {
    total_orders: number;
    total_spent: number;
}

export interface CustomerProfile {
    user_id: string;
    email: string | null;
    full_name: string | null;
    phone: string | null;
    is_active: boolean;
    is_blocked: boolean;
    blocked_reason: string | null;
    is_verified: boolean;
    created_at: string | null;
    last_login: string | null;
    addresses: CustomerAddress[];
    stats: CustomerStats;
}

export interface CustomerOrder {
    order_id: string;
    order_number: string;
    total_amount: number;
    status: string;
    payment_status: string;
    created_at: string | null;
}

export interface CustomerOrdersResult {
    orders: CustomerOrder[];
    total: number;
    page: number;
    limit: number;
    pages: number;
}

export interface CustomerListParams {
    page?: number;
    limit?: number;
    search?: string;
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

    getOrders: async (userId: string, page = 1, limit = 10): Promise<CustomerOrdersResult> => {
        const res = await apiClient.get<{ success: boolean; data: { orders: CustomerOrder[]; pagination: { total: number; page: number; limit: number; pages: number } } }>(
            `/admin/customers/${userId}/orders`,
            { params: { page, limit } }
        );
        return { orders: res.data.data.orders, ...res.data.data.pagination };
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
