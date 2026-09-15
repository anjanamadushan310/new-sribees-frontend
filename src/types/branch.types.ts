/**
 * Branch Types for SRIBEESonline Admin Dashboard
 */

// Branch Status
export type BranchStatus = 'active' | 'inactive' | 'maintenance';

// Branch
export interface Branch {
    branch_id: string;
    name: string;
    code: string;
    address: string;
    postal_city: string;
    district: string;
    province: string;
    phone?: string;
    email?: string;
    manager_id?: string;
    manager_name?: string;
    is_active: boolean;
    status: BranchStatus;
    operating_hours?: BranchOperatingHours;
    settings?: BranchSettings;
    stats?: BranchStats;
    created_at: string;
    updated_at: string;
}

// Branch Operating Hours
export interface BranchOperatingHours {
    monday: { open: string; close: string; is_closed: boolean };
    tuesday: { open: string; close: string; is_closed: boolean };
    wednesday: { open: string; close: string; is_closed: boolean };
    thursday: { open: string; close: string; is_closed: boolean };
    friday: { open: string; close: string; is_closed: boolean };
    saturday: { open: string; close: string; is_closed: boolean };
    sunday: { open: string; close: string; is_closed: boolean };
}

// Branch Settings
export interface BranchSettings {
    low_stock_threshold: number;
    auto_reorder_enabled: boolean;
    delivery_radius_km: number;
    min_order_amount: number;
}

// Branch Stats (Dashboard)
export interface BranchStats {
    total_orders: number;
    total_revenue: number;
    pending_orders: number;
    total_products: number;
    low_stock_count: number;
    out_of_stock_count: number;
    staff_count: number;
}

// Branch Inventory Item
export interface BranchInventoryItem {
    inventory_id: string;
    branch_id: string;
    branch_name?: string;
    product_id: string;
    product_name: string;
    product_sku: string;
    variant_id?: string;
    variant_name?: string;
    stock_quantity: number;
    reserved_quantity: number;
    available_quantity: number;
    low_stock_threshold: number;
    reorder_point: number;
    max_stock_level: number;
    is_low_stock: boolean;
    is_out_of_stock: boolean;
    last_restocked?: string;
    last_sold?: string;
    created_at: string;
    updated_at: string;
}

// Stock Transfer
export type TransferStatus = 'pending' | 'approved' | 'in_transit' | 'completed' | 'cancelled';

export interface StockTransfer {
    transfer_id: string;
    from_branch_id: string;
    from_branch_name: string;
    to_branch_id: string;
    to_branch_name: string;
    product_id: string;
    product_name: string;
    variant_id?: string;
    variant_name?: string;
    quantity: number;
    status: TransferStatus;
    requested_by_id: string;
    requested_by_name: string;
    approved_by_id?: string;
    approved_by_name?: string;
    notes?: string;
    requested_at: string;
    approved_at?: string;
    completed_at?: string;
}

// Stock Transfer Form
export interface StockTransferForm {
    from_branch_id: string;
    to_branch_id: string;
    product_id: string;
    variant_id?: string;
    quantity: number;
    notes?: string;
}

// Branch Inventory Filters
export interface BranchInventoryFilters {
    search?: string;
    branch_id?: string;
    low_stock_only?: boolean;
    out_of_stock_only?: boolean;
    category_id?: string;
    sort_by?: 'product_name' | 'stock_quantity' | 'last_sold' | 'updated_at';
    sort_order?: 'asc' | 'desc';
    page?: number;
    limit?: number;
}

// Stock Transfer Filters
export interface StockTransferFilters {
    from_branch_id?: string;
    to_branch_id?: string;
    status?: TransferStatus;
    date_from?: string;
    date_to?: string;
    page?: number;
    limit?: number;
}

// API Responses
export interface BranchListResponse {
    success: boolean;
    data: {
        branches: Branch[];
        total: number;
    };
}

export interface BranchInventoryResponse {
    success: boolean;
    data: {
        inventory: BranchInventoryItem[];
        pagination: {
            total: number;
            page: number;
            limit: number;
            total_pages: number;
        };
        summary?: {
            total_items: number;
            low_stock_count: number;
            out_of_stock_count: number;
        };
    };
}

export interface StockTransferResponse {
    success: boolean;
    data: {
        transfers: StockTransfer[];
        pagination: {
            total: number;
            page: number;
            limit: number;
            total_pages: number;
        };
    };
}

// Low Stock Alert
export interface LowStockAlert {
    inventory_id: string;
    branch_id: string;
    branch_name: string;
    product_id: string;
    product_name: string;
    product_sku: string;
    variant_name?: string;
    current_stock: number;
    threshold: number;
    severity: 'warning' | 'critical';
    last_sold?: string;
}

// Transfer Status Display Config
export const TRANSFER_STATUS_CONFIG: Record<TransferStatus, { label: string; color: string; bgColor: string }> = {
    pending: { label: 'Pending', color: '#d97706', bgColor: '#fef3c7' },
    approved: { label: 'Approved', color: '#2563eb', bgColor: '#dbeafe' },
    in_transit: { label: 'In Transit', color: '#7c3aed', bgColor: '#ede9fe' },
    completed: { label: 'Completed', color: '#16a34a', bgColor: '#dcfce7' },
    cancelled: { label: 'Cancelled', color: '#dc2626', bgColor: '#fee2e2' },
};
