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
    /**
     * Enough courier state to spot a parcel that needs a human without opening
     * every order. `failed` here is the one that matters: the order sits at
     * Packed looking normal while no rider has ever been asked to collect it.
     */
    courier_booking_status: string | null;
    courier_waybill: string | null;
    courier_tracking_status: string | null;
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

/** Fulfilment & logistics contacts card (B4 Module A). */
export interface FulfilmentContacts {
    branch: {
        name: string;
        code: string;
        phone: string | null;
        manager_name: string | null;
        manager_email: string | null;
    } | null;
    rider: {
        state: 'pending' | 'assigned';
        name: string | null;
        phone: string | null;
        vehicle: string | null;
        waybill: string | null;
        tracking_status: string | null;
        courier_booking_status: string | null;
    };
}

export type EscalationCategory =
    | 'cancel_request'
    | 'address_correction'
    | 'hold_shipment'
    | 'customer_complaint'
    | 'other';
export type EscalationStatus = 'open' | 'acknowledged' | 'resolved';

/** Internal support → branch ticket (B4 Module B). */
export interface OrderEscalation {
    escalation_id: string;
    order_id: string;
    category: EscalationCategory;
    message: string;
    status: EscalationStatus;
    resolution_note: string | null;
    raised_by_name: string;
    handled_by_name: string | null;
    created_at: string | null;
    acknowledged_at: string | null;
    resolved_at: string | null;
}

export type ReturnResolution = 'returnless_refund' | 'reverse_pickup';

/**
 * The SribeesExpress shipment behind an order, from GET /admin/orders/{id}.
 *
 * Booking happens automatically when the order is confirmed, so for most
 * orders this arrives already populated. The flags exist for the ones it
 * does not cover: a booking that failed during a courier outage, an address
 * corrected after the fact, or an order older than the integration.
 */
export interface OrderCourier {
    /** SribeesExpress waybill. Null until booked — the whole panel keys off this. */
    shipment_id: string | null;
    waybill: string | null;
    /** Our side: pending | booked | failed. */
    booking_status: string | null;
    /** Their side: booked, picked_up, out_for_delivery, delivered, failed, returned… */
    tracking_status: string | null;
    tracking_url: string | null;
    tracking_updated_at: string | null;
    /** Where the rider was told to collect, snapshotted at booking time. */
    pickup_location_name: string | null;
    handover_required: boolean;
    handover_verified: boolean | null;
    /** COD only: `delivered` alone does NOT mean the cash was collected. */
    cod_collected: boolean;
    cod_collected_amount: number | null;
    /** The remittance run that paid this order's COD out to us. Null until settled. */
    remittance_id: number | null;
    /** Rider free text on a failed parcel. Never branch logic on its wording. */
    failure_note: string | null;
    /** Only meaningful while tracking_status is `failed`. */
    will_retry: boolean | null;
    can_request_pickup: boolean;
    can_refresh_tracking: boolean;
    /**
     * Whether the fulfilling branch is registered as a pickup location.
     * False is a warning, not a blocker: the booking still succeeds, but the
     * rider is sent to the account default address instead of this branch.
     */
    branch_pickup_registered: boolean;
}

/**
 * The rows a shipping label needs, from GET /admin/orders/{id}/courier/label.
 *
 * Mirrors SribeesExpress's own `ShippingLabelOut` field for field. Their label
 * builder lives on a staff-authenticated endpoint a merchant key cannot reach,
 * and returns data rather than a rendered label anyway — the barcode is meant
 * to be drawn client-side from `waybill_id`.
 */
export interface CourierLabel {
    waybill_id: string;
    order_number: string;
    booked_at: string | null;
    sender_name: string | null;
    sender_phone: string | null;
    origin_branch: string | null;
    recipient_name: string;
    recipient_phone: string;
    recipient_address: string;
    destination_city: string | null;
    destination_district: string | null;
    postal_code: string | null;
    weight_kg: string;
    cod_amount: string;
    is_cod: boolean;
    delivery_charge: string;
    item_count: number;
    status_name: string | null;
    requires_handover_code: boolean;
    tracking_url: string | null;
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
    return_resolution: ReturnResolution | null;
    return_resolution_note: string | null;
    customer: OrderCustomer | null;
    delivery_address: OrderDeliveryAddress | null;
    items: OrderItem[];
    pricing: OrderPricing;
    history?: OrderStatusHistoryItem[];
    fulfilment_contacts?: FulfilmentContacts;
    escalations?: OrderEscalation[];
    courier?: OrderCourier;
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

    /** Branch Manager / Super Admin only. resolution: returnless refund vs reverse pickup (B4). */
    approveReturn: async (
        id: string,
        resolution: ReturnResolution = 'returnless_refund',
        note?: string,
    ): Promise<OrderDetail> => {
        const res = await apiClient.post<OrderDetailWire>(`/admin/orders/${id}/return/approve`, {
            resolution,
            note,
        });
        return res.data.data;
    },

    rejectReturn: async (id: string, note?: string): Promise<OrderDetail> => {
        const res = await apiClient.post<OrderDetailWire>(`/admin/orders/${id}/return/reject`, { note });
        return res.data.data;
    },

    /** Customer Support appends a proof/context note to an open return claim (B4). */
    addReturnNote: async (id: string, note: string): Promise<OrderDetail> => {
        const res = await apiClient.post<OrderDetailWire>(`/admin/orders/${id}/return/note`, { note });
        return res.data.data;
    },

    // --- Internal escalation tickets (B4 Module B) ---
    listEscalations: async (id: string): Promise<OrderEscalation[]> => {
        const res = await apiClient.get<{ success: boolean; data: { escalations: OrderEscalation[] } }>(
            `/admin/orders/${id}/escalations`,
        );
        return res.data.data.escalations;
    },
    raiseEscalation: async (
        id: string,
        category: EscalationCategory,
        message: string,
    ): Promise<OrderEscalation> => {
        const res = await apiClient.post<{ success: boolean; data: OrderEscalation }>(
            `/admin/orders/${id}/escalations`,
            { category, message },
        );
        return res.data.data;
    },
    updateEscalation: async (
        id: string,
        escalationId: string,
        status: EscalationStatus,
        resolutionNote?: string,
    ): Promise<OrderEscalation> => {
        const res = await apiClient.patch<{ success: boolean; data: OrderEscalation }>(
            `/admin/orders/${id}/escalations/${escalationId}`,
            { status, resolution_note: resolutionNote },
        );
        return res.data.data;
    },

    // --- SribeesExpress shipment (Branch Manager / Super Admin only) ---

    /**
     * Ask SribeesExpress to collect this parcel. Idempotent: an order that is
     * already booked comes back 200 with its existing waybill rather than a
     * second parcel, so a double-click is harmless.
     */
    requestPickup: async (id: string): Promise<{ order: OrderDetail; courier: OrderCourier; message: string }> => {
        const res = await apiClient.post<{
            success: boolean;
            data: { order: OrderDetail; courier: OrderCourier };
            message: string;
        }>(`/admin/orders/${id}/courier/request-pickup`);
        return { ...res.data.data, message: res.data.message };
    },

    /**
     * Re-read this one shipment from SribeesExpress. Their webhooks are not
     * retried, so a single missed push leaves the order on a stale status
     * until the next reconciliation sweep — this is that sweep for one order.
     */
    refreshCourier: async (id: string): Promise<{ order: OrderDetail; courier: OrderCourier; message: string }> => {
        const res = await apiClient.post<{
            success: boolean;
            data: { order: OrderDetail; courier: OrderCourier };
            message: string;
        }>(`/admin/orders/${id}/courier/refresh`);
        return { ...res.data.data, message: res.data.message };
    },

    /**
     * Label rows for a booked parcel. 404s until a pickup has been requested —
     * a label with no waybill routes nothing, and printing one is worse than
     * printing none.
     */
    courierLabel: async (id: string): Promise<CourierLabel> => {
        const res = await apiClient.get<{ success: boolean; data: CourierLabel }>(
            `/admin/orders/${id}/courier/label`,
        );
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
