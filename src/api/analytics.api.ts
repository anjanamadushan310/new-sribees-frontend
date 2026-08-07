/**
 * Admin Analytics API (/api/v1/admin/analytics) — branch-scoped on the server.
 * Restricted to super_admin + branch_manager. Responses are snake_case dicts.
 *
 * Branch scoping is enforced server-side, not here: passing a `branchId` as a
 * Branch Manager is silently ignored rather than honoured, so the UI can send
 * the same request shape for every role.
 *
 * Revenue counts orders that were paid and not cancelled or refunded — the same
 * definition across every endpoint, so no two numbers on screen disagree.
 */
import apiClient from './client';

export interface AnalyticsScope {
    is_super_admin: boolean;
    branch_id: string | null;
}

export interface AnalyticsRange {
    days: number;
    start_date: string;
    end_date: string;
    previous_start_date: string;
    previous_end_date: string;
}

/** Common query shape: every endpoint takes a window and an optional branch. */
export interface AnalyticsQuery {
    days?: number;
    branchId?: string;
}

export interface PeriodTotals {
    revenue: number;
    orders: number;
    paid_orders: number;
    customers: number;
    items_sold: number;
    avg_order_value: number;
}

/** null means "no baseline to compare against", not 0% — render it as "new". */
export type Delta = number | null;

export interface AnalyticsSummary {
    /** Lifetime-to-date figures, for the headline KPI cards. */
    total_revenue: number;
    total_orders: number;
    active_customers: number;
    low_stock_alerts: number;
    /** Windowed figures + the equal-length window before it. */
    range: AnalyticsRange;
    current: PeriodTotals;
    previous: PeriodTotals;
    new_customers: number;
    deltas: {
        revenue: Delta;
        orders: Delta;
        customers: Delta;
        items_sold: Delta;
        avg_order_value: Delta;
    };
    scope: AnalyticsScope;
}

export interface SalesPoint {
    date: string; // ISO date (YYYY-MM-DD)
    revenue: number;
    orders: number;
}

export interface SalesSeries {
    series: SalesPoint[];
    /** Only present when the request asked to compare; index-aligned to `series`. */
    previous_series?: SalesPoint[];
    days: number;
    range: AnalyticsRange;
    scope: AnalyticsScope;
}

export interface BranchPerformance {
    branch_id: string;
    name: string;
    code: string;
    district: string | null;
    province: string;
    is_active: boolean;
    revenue: number;
    orders: number;
    paid_orders: number;
    customers: number;
    items_sold: number;
    avg_order_value: number;
    previous_revenue: number;
    revenue_change: Delta;
    /** Percentage of network revenue in this window. */
    revenue_share: number;
    skus_stocked: number;
    units_on_hand: number;
    low_stock_alerts: number;
}

export interface BranchBreakdown {
    branches: BranchPerformance[];
    total_revenue: number;
    total_orders: number;
    /** Orders placed before branch routing existed. Super Admin only, null when none. */
    unassigned: { revenue: number; orders: number } | null;
    range: AnalyticsRange;
    scope: AnalyticsScope;
}

export interface TopProduct {
    product_id: string;
    name: string;
    sku: string | null;
    category: string | null;
    units_sold: number;
    revenue: number;
    orders: number;
}

export interface TopCustomer {
    user_id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    revenue: number;
    orders: number;
    last_order_at: string | null;
}

export interface CategorySplit {
    category_id: string;
    name: string;
    revenue: number;
    units_sold: number;
    share: number;
}

export interface OrderStatusBreakdown {
    statuses: { status: string; orders: number; revenue: number }[];
    payments: { status: string; orders: number }[];
    total_orders: number;
    fulfilment_rate: number;
    cancellation_rate: number;
    range: AnalyticsRange;
    scope: AnalyticsScope;
}

interface Wire<T> {
    success: boolean;
    data: T;
}

/** Build the query string every endpoint shares. */
const params = (q: AnalyticsQuery = {}, extra: Record<string, unknown> = {}) => {
    const out: Record<string, unknown> = { days: q.days ?? 30, ...extra };
    if (q.branchId) out.branch_id = q.branchId;
    return out;
};

async function get<T>(path: string, query: Record<string, unknown>): Promise<T> {
    const res = await apiClient.get<Wire<T>>(`/admin/analytics${path}`, { params: query });
    return res.data.data;
}

export const analyticsApi = {
    summary: (q: AnalyticsQuery = {}) => get<AnalyticsSummary>('/summary', params(q)),

    sales: (q: AnalyticsQuery = {}, compare = false) =>
        get<SalesSeries>('/sales', params(q, compare ? { compare: true } : {})),

    /**
     * Per-branch breakdown. Super Admins get every branch; Branch Managers get
     * exactly one row — their own — so the caller never has to branch on role.
     */
    branches: (days = 30) => get<BranchBreakdown>('/branches', { days }),

    topProducts: (q: AnalyticsQuery = {}, limit = 10) =>
        get<{ products: TopProduct[]; range: AnalyticsRange }>(
            '/top-products',
            params(q, { limit })
        ).then((d) => d.products),

    topCustomers: (q: AnalyticsQuery = {}, limit = 10) =>
        get<{ customers: TopCustomer[]; range: AnalyticsRange }>(
            '/top-customers',
            params(q, { limit })
        ).then((d) => d.customers),

    categories: (q: AnalyticsQuery = {}) =>
        get<{ categories: CategorySplit[]; total_revenue: number }>('/categories', params(q)),

    orderStatus: (q: AnalyticsQuery = {}) =>
        get<OrderStatusBreakdown>('/order-status', params(q)),
};
