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
    /** This branch's override (null = inherit). */
    cashback_percentage: number | null;
    /** The product-wide rate set by a Super Admin (null = platform default). */
    global_cashback_percentage: number | null;
    /** What a customer in this branch actually earns, after the fallback. */
    effective_cashback: number;
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
    cashback_percentage?: number | null;
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

// ============================================================================
// Marketing Dashboard
// ============================================================================

/**
 * The dashboard payload is deliberately full of nullable numbers. `null` never
 * means zero here — it means "this cannot honestly be computed yet":
 * a branch with no delivery runs configured, a banner with too few impressions
 * for a CTR to mean anything, a branch with no completed orders in the window.
 * Render those as a setup prompt or "collecting data", never as 0.
 */
export interface DashboardQuickSaleItem {
    productId: string;
    name: string;
    isPerishable: boolean;
    globalPrice: number;
    effectivePrice: number;
    effectiveDiscount: number | null;
    effectiveDiscountPrice: number | null;
    stockQuantity: number;
}

export interface DashboardBannerItem {
    bannerId: string;
    title: string;
    subtitle: string | null;
    imageUrl: string | null;
    linkType: string | null;
    isPlatformWide: boolean;
    impressions: number;
    clicks: number;
    /** null until the banner has enough impressions for the rate to mean anything. */
    ctr: number | null;
}

export interface DashboardNextDeliveryRun {
    label: string;
    dispatchAt: string;
    cutoffAt: string;
    /** Negative would mean the cut-off has passed; the server rolls over instead. */
    minutesToCutoff: number;
    isTomorrow: boolean;
}

export interface MarketingDashboard {
    branch: { branchId: string; branchName: string };
    quickSale: {
        liveCount: number;
        perishableCount: number;
        items: DashboardQuickSaleItem[];
    };
    banners: {
        activeCount: number;
        totalCount: number;
        averageCtr: number | null;
        windowDays: number;
        items: DashboardBannerItem[];
    };
    coupons: {
        activeCount: number;
        nearLimitCount: number;
        nearLimit: { code: string; usedCount: number; usageLimit: number }[];
    };
    /** null when this branch has not configured its delivery rounds yet. */
    nextDeliveryRun: DashboardNextDeliveryRun | null;
    returningCustomers: {
        /** null when the branch had no completed orders in the window. */
        rate: number | null;
        /** Percentage-POINT change vs the previous week; null if either week was empty. */
        trend: number | null;
        windowDays: number;
        trendWindowDays: number;
        totalCustomers: number;
        repeatCustomers: number;
    };
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
            cashbackPercentage: number | null;
            globalCashbackPercentage: number | null;
            effectiveCashback: number;
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
                cashback_percentage: p.cashbackPercentage,
                global_cashback_percentage: p.globalCashbackPercentage,
                effective_cashback: p.effectiveCashback,
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

    /**
     * The whole Marketing Dashboard in one request.
     *
     * Replaces the four parallel calls the page used to make (quick-sale +
     * banners + coupons + products): those could not produce a branch-scoped
     * coupon count or a real CTR at all, and each one rendered its own error
     * state, so a single failure left the page half-filled with plausible
     * zeros. Throws on failure — callers show a real error state.
     */
    getDashboard: async (branchId?: string): Promise<MarketingDashboard> => {
        const res = await apiClient.get<{ data: MarketingDashboard }>(
            '/admin/marketing/dashboard',
            { params: branchId ? { branch_id: branchId } : undefined },
        );
        return res.data.data;
    },
};
