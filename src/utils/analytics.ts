/**
 * View-model helpers for the analytics screens.
 *
 * Kept out of the component files so those export components only — anything
 * else in a component module breaks React Fast Refresh, which silently turns
 * every save into a full reload while you are working on a chart.
 */
import type { SalesPoint } from '../api/analytics.api';

export const PERIOD_OPTIONS = [
    { label: '7 days', value: 7 },
    { label: '30 days', value: 30 },
    { label: '90 days', value: 90 },
    { label: '12 months', value: 365 },
];

/** One row of a trend chart: this period's point plus its aligned predecessor. */
export interface TrendRow {
    date: string;
    revenue: number;
    orders: number;
    prevDate?: string;
    prevRevenue?: number;
    prevOrders?: number;
    [key: string]: string | number | undefined;
}

/**
 * Zip the current series with the previous one BY POSITION, not by date.
 *
 * Position is the only alignment that makes the comparison readable: the two
 * windows cover different calendar dates, so day 1 must sit above day 1. The
 * API guarantees both series are the same length and zero-filled.
 */
export const mergeSeries = (series: SalesPoint[], previous?: SalesPoint[]): TrendRow[] =>
    series.map((p, i) => ({
        date: p.date,
        revenue: p.revenue,
        orders: p.orders,
        prevDate: previous?.[i]?.date,
        prevRevenue: previous?.[i]?.revenue,
        prevOrders: previous?.[i]?.orders,
    }));

/** Shape Recharts hands to a custom `content` component. */
export interface ChartTooltipProps<T> {
    active?: boolean;
    payload?: { payload: T }[];
    label?: string | number;
}

interface AxiosLikeError {
    response?: { data?: { detail?: unknown } };
    message?: string;
}

/**
 * Pull a human-readable message out of whatever react-query caught.
 *
 * FastAPI puts the useful text in `response.data.detail`, but a network failure
 * never gets that far and only has `message` — showing "undefined" in an alert
 * is the failure mode this exists to prevent.
 */
export const apiErrorMessage = (error: unknown): string => {
    const e = error as AxiosLikeError | null | undefined;
    const detail = e?.response?.data?.detail;
    if (typeof detail === 'string' && detail) return detail;
    if (e?.message) return e.message;
    return 'Please try again.';
};
