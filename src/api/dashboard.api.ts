/**
 * Dashboard API
 * API functions for dashboard data - supports multi-branch RBAC
 */

import apiClient from './client';

export interface DashboardStats {
    totalRevenue: number;
    totalOrders: number;
    totalCustomers: number;
    pendingOrders?: number;
    revenueGrowth: number;
    ordersGrowth: number;
    lowStockAlerts?: number;
    watchlistItems?: number;
}

/**
 * GET /admin/dashboard/stats — the generic (today: staff-role) dashboard.
 * Each optional section is present only if the caller holds the specific
 * permission it represents; `granted` says which ones to expect, so the
 * page can render an honest "no permission" placeholder instead of
 * inferring absence from a zero.
 */
export interface StaffDashboardStats {
    // `revenue` gates every money figure — analytics:read, NOT orders:read (B6).
    granted: { orders: boolean; customers: boolean; products: boolean; revenue: boolean };
    totalRevenue?: number;
    totalOrders?: number;
    pendingOrders?: number;
    revenueGrowth?: number;
    ordersGrowth?: number;
    revenueTrend?: { date: string; revenue: number; orders: number }[];
    ordersTrend?: { date: string; orders: number }[];
    orderStatusDistribution?: { status: string; orders: number }[];
    recentOrders?: RecentOrder[];
    totalCustomers?: number;
    topSellingProducts?: { productId: string; name: string; unitsSold: number; revenue?: number }[];
}

export interface BranchDashboardStats {
    todayRevenue: number;
    todayOrders: number;
    pendingOrders: number;
    lowStockCount: number;
    activeStaff: number;
    inventoryValue: number;
    revenueGrowth: number;
}

export interface RecentOrder {
    order_id: string;
    order_number: string;
    customer_name: string;
    total_amount: number;
    status: string;
    created_at: string;
}

export interface SalesData {
    date: string;
    revenue: number;
    orders: number;
}

export interface TopWatchedProduct {
    product_id: string;
    product_name: string;
    variant_name?: string;
    thumbnail_url?: string;
    watch_count: number;
    conversion_count: number;
    conversion_rate: number;
}

export interface WatchlistTrend {
    date: string;
    new_watches: number;
    removals: number;
    net_change: number;
}

export interface BranchPerformance {
    branch_id: string;
    branch_name: string;
    revenue: number;
    orders: number;
    average_order_value: number;
    growth_percentage: number;
    pending_orders: number;
    low_stock_count: number;
}

interface StaffDashboardStatsWire {
    granted: { orders: boolean; customers: boolean; products: boolean; revenue: boolean };
    total_revenue?: number;
    total_orders?: number;
    pending_orders?: number;
    revenue_growth?: number;
    orders_growth?: number;
    revenue_trend?: { date: string; revenue: number; orders: number }[];
    orders_trend?: { date: string; orders: number }[];
    order_status_distribution?: { status: string; orders: number }[];
    recent_orders?: RecentOrder[];
    total_customers?: number;
    top_selling_products?: { product_id: string; name: string; units_sold: number; revenue?: number }[];
}

function mapDashboardStatsWire(w: StaffDashboardStatsWire): StaffDashboardStats {
    return {
        granted: w.granted,
        totalRevenue: w.total_revenue,
        totalOrders: w.total_orders,
        pendingOrders: w.pending_orders,
        revenueGrowth: w.revenue_growth,
        ordersGrowth: w.orders_growth,
        revenueTrend: w.revenue_trend,
        ordersTrend: w.orders_trend,
        orderStatusDistribution: w.order_status_distribution,
        recentOrders: w.recent_orders,
        totalCustomers: w.total_customers,
        topSellingProducts: w.top_selling_products?.map((p) => ({
            productId: p.product_id,
            name: p.name,
            unitsSold: p.units_sold,
            revenue: p.revenue,
        })),
    };
}

export const dashboardApi = {
    /**
     * The generic dashboard's stats (today: the 'staff' role only — every
     * base role has its own dedicated dashboard). Each section in the
     * response is gated server-side on the specific permission it
     * represents; `granted` says which to expect. Throws on failure —
     * callers should show a real error state, not infer one from a shape.
     */
    getDashboardStats: async (): Promise<StaffDashboardStats> => {
        const response = await apiClient.get<{ data: StaffDashboardStatsWire }>('/admin/dashboard/stats');
        return mapDashboardStatsWire(response.data.data);
    },

    /**
     * Get branch-specific dashboard statistics (Manager/Staff)
     * Note: Returns null silently if endpoint not implemented (uses mock data fallback)
     */
    getBranchStats: async (branchId: string): Promise<BranchDashboardStats | null> => {
        try {
            const response = await apiClient.get(`/analytics/dashboard/branch/${branchId}/stats`);
            return response.data.data;
        } catch (error) {
            // Silently return null - dashboard uses mock data fallback
            return null;
        }
    },

    /**
     * Get branch performance comparison (Super Admin)
     */
    getBranchPerformance: async (period: 'today' | 'week' | 'month' | 'year' = 'month'): Promise<BranchPerformance[]> => {
        try {
            const response = await apiClient.get(`/analytics/branches/performance?period=${period}`);
            return response.data.data?.branches || [];
        } catch (error) {
            console.error('Failed to fetch branch performance:', error);
            return [];
        }
    },

    getSalesData: async (period: string = '7days'): Promise<SalesData[]> => {
        try {
            const response = await apiClient.get(`/analytics/sales?period=${period}`);
            return response.data.data || [];
        } catch (error) {
            console.error('Failed to fetch sales data:', error);
            return [];
        }
    },

    /**
     * Get watchlist analytics data
     */
    getWatchlistAnalytics: async (params?: {
        branchId?: string;
        startDate?: string;
        endDate?: string;
        limit?: number;
    }) => {
        try {
            const queryParams = new URLSearchParams();
            if (params?.branchId) queryParams.append('branchId', params.branchId);
            if (params?.startDate) queryParams.append('startDate', params.startDate);
            if (params?.endDate) queryParams.append('endDate', params.endDate);
            if (params?.limit) queryParams.append('limit', params.limit.toString());

            const response = await apiClient.get(`/analytics/watchlist?${queryParams.toString()}`);
            return response.data.data;
        } catch (error) {
            console.error('Failed to fetch watchlist analytics:', error);
            return null;
        }
    },

    /**
     * Get top watched products
     */
    getTopWatchedProducts: async (limit = 10, branchId?: string): Promise<TopWatchedProduct[]> => {
        try {
            const queryParams = new URLSearchParams({ limit: limit.toString() });
            if (branchId) queryParams.append('branchId', branchId);

            const response = await apiClient.get(`/analytics/watchlist/top-products?${queryParams.toString()}`);
            return response.data.data?.products || [];
        } catch (error) {
            console.error('Failed to fetch top watched products:', error);
            return [];
        }
    },

    /**
     * Get watchlist trends over time
     */
    getWatchlistTrends: async (days = 30, branchId?: string): Promise<WatchlistTrend[]> => {
        try {
            const queryParams = new URLSearchParams({ days: days.toString() });
            if (branchId) queryParams.append('branchId', branchId);

            const response = await apiClient.get(`/analytics/watchlist/trends?${queryParams.toString()}`);
            return response.data.data?.trends || [];
        } catch (error) {
            console.error('Failed to fetch watchlist trends:', error);
            return [];
        }
    },

    /**
     * Get order status distribution
     */
    getOrderStatusDistribution: async (branchId?: string): Promise<Array<{ status: string; count: number; percentage: number }>> => {
        try {
            const queryParams = new URLSearchParams();
            if (branchId) queryParams.append('branchId', branchId);

            const response = await apiClient.get(`/analytics/order-status?${queryParams.toString()}`);
            return response.data.data?.distribution || [];
        } catch (error) {
            console.error('Failed to fetch order status distribution:', error);
            return [];
        }
    },
};
