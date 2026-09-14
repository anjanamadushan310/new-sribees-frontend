/**
 * Order Types for SRIBEESonline Admin Dashboard
 */

// Order Status
export type OrderStatus = 
    | 'pending'
    | 'confirmed'
    | 'processing'
    | 'packed'
    | 'shipped'
    | 'out_for_delivery'
    | 'delivered'
    | 'cancelled'
    | 'refunded';

export type PaymentStatus = 
    | 'pending'
    | 'paid'
    | 'failed'
    | 'refunded'
    | 'partially_refunded';

export type PaymentMethod = 
    | 'card'
    | 'upi'
    | 'wallet'
    | 'cash_on_delivery'
    | 'net_banking';

// Order Item
export interface OrderItem {
    order_item_id: string;
    product_id: string;
    variant_id?: string;
    product_name: string;
    variant_name?: string;
    sku: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    image_url?: string;
}

// Order Address
export interface OrderAddress {
    address_id: string;
    full_name: string;
    phone: string;
    address_line1: string;
    address_line2?: string;
    postal_city: string;
    district: string;
    postal_code: string;
    province: string;
    landmark?: string;
}

// Order Timeline Event
export interface OrderTimelineEvent {
    event_id: string;
    status: OrderStatus;
    message: string;
    created_at: string;
    created_by?: string;
}

// Main Order Type
export interface Order {
    order_id: string;
    order_number: string;
    user_id: string;
    branch_id: string;
    branch_name?: string;
    
    // Customer Info
    customer_name: string;
    customer_email: string;
    customer_phone?: string;
    
    // Order Details
    items: OrderItem[];
    item_count: number;
    
    // Pricing
    subtotal: number;
    tax_amount: number;
    shipping_amount: number;
    discount_amount: number;
    total_amount: number;
    
    // Status
    status: OrderStatus;
    payment_status: PaymentStatus;
    payment_method: PaymentMethod;
    
    // Delivery
    delivery_address: OrderAddress;
    delivery_date?: string;
    delivery_time_slot?: string;
    
    // Tracking
    tracking_number?: string;
    shipping_carrier?: string;
    
    // Notes
    customer_notes?: string;
    admin_notes?: string;
    
    // Timeline
    timeline?: OrderTimelineEvent[];
    
    // Timestamps
    created_at: string;
    updated_at: string;
    confirmed_at?: string;
    shipped_at?: string;
    delivered_at?: string;
    cancelled_at?: string;
}

// Order Filters
export interface OrderFilters {
    search?: string;
    status?: OrderStatus;
    payment_status?: PaymentStatus;
    payment_method?: PaymentMethod;
    branch_id?: string;
    date_from?: string;
    date_to?: string;
    min_amount?: number;
    max_amount?: number;
    sort_by?: 'created_at' | 'total_amount' | 'status';
    sort_order?: 'asc' | 'desc';
    page?: number;
    limit?: number;
}

// Order Update
export interface OrderStatusUpdate {
    status: OrderStatus;
    notes?: string;
    tracking_number?: string;
    shipping_carrier?: string;
}

// Order API Responses
export interface OrderListResponse {
    success: boolean;
    data: {
        orders: Order[];
        pagination: {
            total: number;
            page: number;
            limit: number;
            total_pages: number;
        };
        summary?: {
            total_orders: number;
            total_revenue: number;
            pending_count: number;
            processing_count: number;
        };
    };
}

export interface OrderDetailResponse {
    success: boolean;
    data: Order;
}

// Order Stats (Dashboard)
export interface OrderStats {
    today_orders: number;
    today_revenue: number;
    pending_orders: number;
    processing_orders: number;
    shipped_orders: number;
    delivered_orders: number;
    cancelled_orders: number;
    average_order_value: number;
}

// Status Display Config
export const ORDER_STATUS_CONFIG: Record<OrderStatus, { label: string; color: string; bgColor: string }> = {
    pending: { label: 'Pending', color: '#d97706', bgColor: '#fef3c7' },
    confirmed: { label: 'Confirmed', color: '#2563eb', bgColor: '#dbeafe' },
    processing: { label: 'Processing', color: '#7c3aed', bgColor: '#ede9fe' },
    packed: { label: 'Packed', color: '#0891b2', bgColor: '#cffafe' },
    shipped: { label: 'Shipped', color: '#0d9488', bgColor: '#ccfbf1' },
    out_for_delivery: { label: 'Out for Delivery', color: '#059669', bgColor: '#d1fae5' },
    delivered: { label: 'Delivered', color: '#16a34a', bgColor: '#dcfce7' },
    cancelled: { label: 'Cancelled', color: '#dc2626', bgColor: '#fee2e2' },
    refunded: { label: 'Refunded', color: '#9333ea', bgColor: '#f3e8ff' },
};

export const PAYMENT_STATUS_CONFIG: Record<PaymentStatus, { label: string; color: string }> = {
    pending: { label: 'Pending', color: '#d97706' },
    paid: { label: 'Paid', color: '#16a34a' },
    failed: { label: 'Failed', color: '#dc2626' },
    refunded: { label: 'Refunded', color: '#9333ea' },
    partially_refunded: { label: 'Partial Refund', color: '#7c3aed' },
};
