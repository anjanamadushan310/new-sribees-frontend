/**
 * Marketing Manager API — Quick Sale management
 * Targets /api/v1/admin/marketing — branch-scoped on the server. Scoped
 * admins (Branch/Marketing Managers) always act on their own branch; Super
 * Admins must pass `branch_id` explicitly.
 */
import apiClient from './client';

export interface MarketingProduct {
    inventory_id: string;
    product_id: string;
    name: string;
    sku: string | null;
    global_price: number;
    branch_price: number | null;
    effective_price: number;
    discount_percentage: number | null;
    global_discount_percentage: number | null;
    effective_discount: number | null;
    is_on_sale: boolean;
    is_active: boolean;
    stock_quantity: number;
}

export interface MarketingProductListParams {
    page?: number;
    limit?: number;
    search?: string;
    branch_id?: string; // super admin only
}

export interface MarketingProductListResult {
    products: MarketingProduct[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    branchId: string;
}

export interface MarketingInventoryUpdatePayload {
    // null clears the local override -> falls back to the product's global value.
    discount_percentage?: number | null;
    is_on_sale?: boolean;
}

export interface QuickSaleItem {
    productId: string;
    name: string;
    slug: string;
    globalPrice: number;
    effectivePrice: number;
    branchPrice: number | null;
    effectiveDiscount: number;
    effectiveDiscountPrice: number | null;
    stockQuantity: number;
    isOnSale: boolean;
    isActive: boolean;
    category: { categoryId: string; name: string } | null;
    images: { imageUrl: string; isPrimary: boolean }[];
}

interface ProductListWire {
    success: boolean;
    data: {
        products: Array<{
            inventoryId: string;
            productId: string;
            name: string;
            sku: string | null;
            globalPrice: number;
            branchPrice: number | null;
            effectivePrice: number;
            discountPercentage: number | null;
            globalDiscountPercentage: number | null;
            effectiveDiscount: number | null;
            isOnSale: boolean;
            isActive: boolean;
            stockQuantity: number;
        }>;
        pagination: { total: number; page: number; limit: number; totalPages: number };
        branchId: string;
    };
}

interface QuickSaleWire {
    success: boolean;
    data: {
        products: QuickSaleItem[];
        total: number;
        branchId: string;
    };
}

export const marketingApi = {
    listProducts: async (params?: MarketingProductListParams): Promise<MarketingProductListResult> => {
        const clean: Record<string, unknown> = {};
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null && v !== '') clean[k] = v;
            });
        }
        const res = await apiClient.get<ProductListWire>('/admin/marketing/products', { params: clean });
        return {
            products: res.data.data.products.map((p) => ({
                inventory_id: p.inventoryId,
                product_id: p.productId,
                name: p.name,
                sku: p.sku,
                global_price: p.globalPrice,
                branch_price: p.branchPrice,
                effective_price: p.effectivePrice,
                discount_percentage: p.discountPercentage,
                global_discount_percentage: p.globalDiscountPercentage,
                effective_discount: p.effectiveDiscount,
                is_on_sale: p.isOnSale,
                is_active: p.isActive,
                stock_quantity: p.stockQuantity,
            })),
            ...res.data.data.pagination,
            branchId: res.data.data.branchId,
        };
    },

    updateInventory: async (
        productId: string,
        payload: MarketingInventoryUpdatePayload,
        branchId?: string
    ): Promise<void> => {
        await apiClient.patch(`/admin/marketing/inventory/${productId}`, payload, {
            params: branchId ? { branch_id: branchId } : undefined,
        });
    },

    previewQuickSale: async (branchId?: string): Promise<QuickSaleItem[]> => {
        const res = await apiClient.get<QuickSaleWire>('/admin/marketing/quick-sale', {
            params: branchId ? { branch_id: branchId } : undefined,
        });
        return res.data.data.products;
    },
};
