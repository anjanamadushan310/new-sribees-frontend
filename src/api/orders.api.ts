/**
 * Admin Order API (/api/v1/admin/orders) — branch-scoped on the server.
 * Responses are snake_case dicts, matching the types below.
 */
import apiClient from './client';

export type OrderStatus =
    | 'pending'
    | 'confirmed'
    | 'processing'
    | 'packing'
    | 'packed'
    | 'handed_to_courier'
    | 'shipped'
    | 'out_for_delivery'
    | 'delivered'
    | 'delivery_failed'
    | 'rto_initiated'
    | 'cancelled'
    | 'return_requested'
    | 'return_approved'
    | 'refunded';

/** One contextual action button from GET /admin/orders/{id}/next-statuses (B1 §3). */
export interface OrderStatusAction {
    status: OrderStatus;
    label: string;
    kind: 'primary' | 'danger';
}

export interface OrderNextStatuses {
    status: OrderStatus;
    actions: OrderStatusAction[];
    can_override: boolean;
    all_statuses: OrderStatus[];
}

export interface OrderListItem {
    order_id: string;
    order_number: string;
    user_id: string;
    customer_name: string | null;
    customer_email: string | null;
    branch_id: string | null;
    branch_name: string | null;
    status: OrderStatus;
    payment_status: string;
    total_amount: number;
    item_count: number;
    created_at: string | null;
}

export interface OrderItem {
    order_item_id: string;
    product_id: string;
    product_name: string;
    product_sku: string | null;
    product_image: string | null;
    quantity: number;
    unit_price: number;
    subtotal: number;
}

export interface OrderPricing {
    subtotal: number;
    tax_amount: number;
    shipping_amount: number;
    discount_amount: number;
    wallet_deduction: number;
    cashback_earned: number;
    total_amount: number;
}

export interface OrderCustomer {
    user_id: string;
    full_name: string;
    email: string;
    phone: string | null;
}

export interface OrderDeliveryAddress {
    address_line1: string;
    address_line2: string | null;
    post_office: string;
    district: string;
    province: string;
    postal_code: string;
}

export interface OrderReturnItem {
    order_item_id: string;
    quantity: number;
}

export interface OrderStatusHistoryItem {
    history_id: string;
    old_status: OrderStatus | string | null;
    new_status: OrderStatus | string;
    changed_by: string;
    notes: string | null;
    created_at: string | null;
}

export interface OrderDetail {
    order_id: string;
    order_number: string;
    status: OrderStatus;
    payment_status: string;
    payment_method: string | null;
    branch_id: string | null;
    branch_name: string | null;
    created_at: string | null;
    packed_at: string | null;
    handed_to_courier_at: string | null;
    shipped_at: string | null;
    delivered_at: string | null;
    delivery_failed_at: string | null;
    delivery_slot_date: string | null;
    delivery_slot_time: string | null;
    notes: string | null;
    // Returns & refunds (Module 5.5)
    return_reason: string | null;
    return_comments: string | null;
    return_items: OrderReturnItem[] | null;
    return_requested_at: string | null;
    refund_amount: number | null;
    customer: OrderCustomer | null;
    delivery_address: OrderDeliveryAddress | null;
    items: OrderItem[];
    pricing: OrderPricing;
    history?: OrderStatusHistoryItem[];
}

export interface OrderScope {
    is_super_admin: boolean;
    branch_id: string | null;
}

export interface OrderListParams {
    page?: number;
    limit?: number;
    order_status?: OrderStatus;
    /** Comma-joined statuses — used by the B2 order tabs/pills. */
    order_statuses?: string;
    search?: string;
    branch_id?: string; // super admin only
    from_date?: string;
    to_date?: string;
}

export interface OrderListResult {
    orders: OrderListItem[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
    scope: OrderScope;
    /** {status: count} across the current date/branch/search context (B2). */
    statusCounts: Record<string, number>;
}

interface OrderListWire {
    success: boolean;
    data: {
        orders: OrderListItem[];
        pagination: { total: number; page: number; limit: number; total_pages: number };
        status_counts?: Record<string, number>;
        scope: OrderScope;
    };
}

/**
 * Two-tier order lifecycle tabs (QA spec B2). Tier 1 = main tab, tier 2 =
 * sub-status pills. `statuses` is the set of backend status values a
 * tab/pill filters to; an empty `subPills` means the tab has no pills.
 */
export interface OrderSubPill {
    key: string;
    label: string;
    statuses: OrderStatus[];
}
export interface OrderTab {
    key: string;
    label: string;
    statuses: OrderStatus[]; // empty = "all orders"
    subPills: OrderSubPill[];
}

export const ORDER_TABS: OrderTab[] = [
    { key: 'all', label: 'All Orders', statuses: [], subPills: [] },
    {
        key: 'new',
        label: 'New Orders',
        statuses: ['pending', 'confirmed'],
        subPills: [
            { key: 'pending', label: 'Pending', statuses: ['pending'] },
            { key: 'confirmed', label: 'Confirmed', statuses: ['confirmed'] },
        ],
    },
    {
        key: 'warehouse',
        label: 'Warehouse',
        statuses: ['processing', 'packing', 'packed'],
        subPills: [
            { key: 'packing', label: 'Packing', statuses: ['processing', 'packing'] },
            { key: 'packed', label: 'Packed (Ready)', statuses: ['packed'] },
        ],
    },
    {
        key: 'logistics',
        label: 'Logistics',
        statuses: ['handed_to_courier', 'shipped', 'out_for_delivery'],
        subPills: [
            { key: 'handed', label: 'Handed to Courier', statuses: ['handed_to_courier'] },
            { key: 'shipped', label: 'Shipped', statuses: ['shipped'] },
            { key: 'ofd', label: 'Out for Delivery', statuses: ['out_for_delivery'] },
        ],
    },
    { key: 'delivered', label: 'Delivered', statuses: ['delivered'], subPills: [] },
    {
        key: 'returns',
        label: 'Returns & Refunds',
        statuses: ['return_requested', 'return_approved', 'refunded'],
        subPills: [
            { key: 'requested', label: 'Return Requested', statuses: ['return_requested'] },
            { key: 'qc', label: 'QC Pending', statuses: ['return_approved'] },
            { key: 'refunded', label: 'Refunded', statuses: ['refunded'] },
        ],
    },
    {
        key: 'exceptions',
        label: 'Exceptions',
        statuses: ['cancelled', 'delivery_failed', 'rto_initiated'],
        subPills: [
            { key: 'cancelled', label: 'Cancelled', statuses: ['cancelled'] },
            { key: 'failed', label: 'Delivery Failed', statuses: ['delivery_failed'] },
            { key: 'rto', label: 'RTO', statuses: ['rto_initiated'] },
        ],
    },
];

/** Sum of the given statuses in a status_counts map. */
export const sumCounts = (counts: Record<string, number>, statuses: OrderStatus[]): number =>
    statuses.length === 0
        ? Object.values(counts).reduce((a, b) => a + b, 0)
        : statuses.reduce((a, s) => a + (counts[s] ?? 0), 0);

interface OrderDetailWire {
    success: boolean;
    data: OrderDetail;
}

// Presentation metadata for order statuses (label + Ant Design Tag color),
// in natural lifecycle order.
export const ORDER_STATUS_META: Record<OrderStatus, { label: string; color: string }> = {
    pending: { label: 'Pending', color: 'gold' },
    confirmed: { label: 'Confirmed', color: 'blue' },
    processing: { label: 'Processing', color: 'geekblue' },
    packing: { label: 'Packing', color: 'geekblue' },
    packed: { label: 'Packed', color: 'lime' },
    handed_to_courier: { label: 'Handed to Courier', color: 'cyan' },
    shipped: { label: 'Shipped', color: 'cyan' },
    out_for_delivery: { label: 'Out for Delivery', color: 'purple' },
    delivered: { label: 'Delivered', color: 'green' },
    delivery_failed: { label: 'Delivery Failed', color: 'volcano' },
    rto_initiated: { label: 'Returning to Store', color: 'orange' },
    cancelled: { label: 'Cancelled', color: 'red' },
    return_requested: { label: 'Return Requested', color: 'orange' },
    return_approved: { label: 'Return Approved', color: 'gold' },
    refunded: { label: 'Refunded', color: 'volcano' },
};

export const ORDER_STATUSES = Object.keys(ORDER_STATUS_META) as OrderStatus[];

export const ordersApi = {
    list: async (params?: OrderListParams): Promise<OrderListResult> => {
        const clean: Record<string, unknown> = {};
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null && v !== '') clean[k] = v;
            });
        }
        const res = await apiClient.get<OrderListWire>('/admin/orders', { params: clean });
        return {
            orders: res.data.data.orders,
            scope: res.data.data.scope,
            statusCounts: res.data.data.status_counts ?? {},
            ...res.data.data.pagination,
        };
    },

    getById: async (id: string): Promise<OrderDetail> => {
        const res = await apiClient.get<OrderDetailWire>(`/admin/orders/${id}`);
        return res.data.data;
    },

    /** Contextual status action buttons for this order + the caller's role (B1 §3). */
    nextStatuses: async (id: string): Promise<OrderNextStatuses> => {
        const res = await apiClient.get<{ success: boolean; data: OrderNextStatuses }>(
            `/admin/orders/${id}/next-statuses`,
        );
        return res.data.data;
    },

    /** Standard state-machine transition (super_admin / branch_manager only). */
    updateStatus: async (id: string, status: OrderStatus): Promise<OrderDetail> => {
        const res = await apiClient.patch<OrderDetailWire>(`/admin/orders/${id}/status`, { status });
        return res.data.data;
    },

    /** Super Admin emergency override — bypasses the state machine, reason >= 15 chars (B1 §4). */
    overrideStatus: async (id: string, status: OrderStatus, reason: string): Promise<OrderDetail> => {
        const res = await apiClient.post<OrderDetailWire>(`/admin/orders/${id}/status/override`, {
            status,
            reason,
        });
        return res.data.data;
    },

    approveReturn: async (id: string): Promise<OrderDetail> => {
        const res = await apiClient.post<OrderDetailWire>(`/admin/orders/${id}/return/approve`);
        return res.data.data;
    },

    rejectReturn: async (id: string): Promise<OrderDetail> => {
        const res = await apiClient.post<OrderDetailWire>(`/admin/orders/${id}/return/reject`);
        return res.data.data;
    },

    /** Fetch the order's PDF invoice as a Blob (for browser download). */
    downloadInvoice: async (id: string): Promise<Blob> => {
        const res = await apiClient.get(`/admin/orders/${id}/invoice`, {
            responseType: 'blob',
        });
        return res.data as Blob;
    },

    exportCSV: async (params?: {
        order_status?: OrderStatus;
        search?: string;
        branch_id?: string;
        from_date?: string;
        to_date?: string;
        order_ids?: string[];
    }): Promise<Blob> => {
        const clean: Record<string, unknown> = {};
        if (params) {
            if (params.order_status) clean.order_status = params.order_status;
            if (params.search) clean.search = params.search;
            if (params.branch_id) clean.branch_id = params.branch_id;
            if (params.from_date) clean.from_date = params.from_date;
            if (params.to_date) clean.to_date = params.to_date;
            if (params.order_ids && params.order_ids.length > 0)
                clean.order_ids = params.order_ids.join(',');
        }
        const res = await apiClient.get('/admin/orders/export/csv', {
            params: clean,
            responseType: 'blob',
        });
        return res.data as Blob;
    },

    exportPDF: async (params?: {
        order_status?: OrderStatus;
        search?: string;
        branch_id?: string;
        from_date?: string;
        to_date?: string;
        order_ids?: string[];
    }): Promise<Blob> => {
        const clean: Record<string, unknown> = {};
        if (params) {
            if (params.order_status) clean.order_status = params.order_status;
            if (params.search) clean.search = params.search;
            if (params.branch_id) clean.branch_id = params.branch_id;
            if (params.from_date) clean.from_date = params.from_date;
            if (params.to_date) clean.to_date = params.to_date;
            if (params.order_ids && params.order_ids.length > 0)
                clean.order_ids = params.order_ids.join(',');
        }
        const res = await apiClient.get('/admin/orders/export/pdf', {
            params: clean,
            responseType: 'blob',
        });
        return res.data as Blob;
    },
};
