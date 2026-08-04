/**
 * Admin Branch Inventory API (Module 7.5)
 * Targets /api/v1/admin/inventory — branch-scoped on the server via
 * inject_branch_filter (Branch Managers see only their branch).
 *
 * Responses are snake_case (hand-built dicts), matching the types below.
 */
import apiClient from './client';

export interface InventoryItem {
    inventory_id: string;
    product_id: string;
    product_name: string;
    sku: string | null;
    branch_id: string;
    branch_name: string;
    // Pricing: the local override (null = not set), the global fallback, and
    // the merged value a customer in this branch actually pays.
    branch_price: number | null;
    global_price: number;
    effective_price: number;
    discount_percentage: number | null;
    global_discount_percentage: number | null;
    effective_discount: number | null;
    is_on_sale: boolean;
    stock_quantity: number;
    reserved_quantity: number;
    available_quantity: number;
    low_stock_threshold: number;
    is_low_stock: boolean;
    is_active: boolean;
}

export interface InventoryScope {
    is_super_admin: boolean;
    branch_id: string | null;
}

export interface InventoryListParams {
    page?: number;
    limit?: number;
    search?: string;
    low_stock_only?: boolean;
    branch_id?: string; // super admin only
}

export interface InventoryListResult {
    items: InventoryItem[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
    scope: InventoryScope;
}

export interface InventoryUpdatePayload {
    // null clears the local override → the product reverts to global_price.
    branch_price?: number | null;
    stock_quantity?: number;
    reserved_quantity?: number;
    low_stock_threshold?: number;
    discount_percentage?: number | null;
    is_on_sale?: boolean;
    is_active?: boolean;
}

/** A global-catalog product this branch does not stock yet. */
export interface StockableProduct {
    product_id: string;
    name: string;
    sku: string | null;
    global_price: number;
    global_stock_quantity: number;
    category_name: string | null;
}

export interface StockableListResult {
    products: StockableProduct[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
}

/** Pull a global product into a branch, optionally with local overrides. */
export interface BranchOverridePayload {
    product_id: string;
    branch_id?: string; // super admin only; ignored for scoped admins
    branch_price?: number | null;
    stock_quantity?: number;
    low_stock_threshold?: number;
    discount_percentage?: number | null;
    is_on_sale?: boolean;
    is_active?: boolean;
}

interface InventoryListWire {
    success: boolean;
    data: {
        items: InventoryItem[];
        pagination: { total: number; page: number; limit: number; total_pages: number };
        scope: InventoryScope;
    };
}

interface StockableListWire {
    success: boolean;
    data: {
        products: StockableProduct[];
        pagination: { total: number; page: number; limit: number; total_pages: number };
        branch_id: string;
    };
}

interface InventoryUpdateWire {
    success: boolean;
    data: InventoryItem;
    message: string;
}

export const inventoryApi = {
    list: async (params?: InventoryListParams): Promise<InventoryListResult> => {
        const clean: Record<string, unknown> = {};
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null && v !== '') clean[k] = v;
            });
        }
        const res = await apiClient.get<InventoryListWire>('/admin/inventory', { params: clean });
        return {
            items: res.data.data.items,
            scope: res.data.data.scope,
            ...res.data.data.pagination,
        };
    },

    update: async (inventoryId: string, payload: InventoryUpdatePayload): Promise<InventoryItem> => {
        // Sent as-is: an explicit `branch_price: null` is the "clear the local
        // override" instruction, so nulls must survive to the server.
        const res = await apiClient.put<InventoryUpdateWire>(
            `/admin/inventory/${inventoryId}`,
            payload
        );
        return res.data.data;
    },

    /** Global-catalog products the branch doesn't carry yet (the "add" picker). */
    stockable: async (params?: {
        page?: number;
        limit?: number;
        search?: string;
        branch_id?: string;
    }): Promise<StockableListResult> => {
        const clean: Record<string, unknown> = {};
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null && v !== '') clean[k] = v;
            });
        }
        const res = await apiClient.get<StockableListWire>('/admin/inventory/catalog', {
            params: clean,
        });
        return {
            products: res.data.data.products,
            ...res.data.data.pagination,
        };
    },

    /** Stock a global product in a branch (creates the branch_inventory row). */
    stockProduct: async (payload: BranchOverridePayload): Promise<InventoryItem> => {
        const res = await apiClient.post<InventoryUpdateWire>('/admin/inventory', payload);
        return res.data.data;
    },
};
