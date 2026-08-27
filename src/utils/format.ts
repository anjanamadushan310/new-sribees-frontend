/**
 * Display formatting shared by the Dashboard and the Analytics report.
 *
 * Kept in one place on purpose: the two screens show the same figures, and the
 * fastest way to make a dashboard look wrong is for one card to say "Rs 1.2M"
 * while the chart beside it says "1200000".
 */

const lkr = new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    maximumFractionDigits: 0,
});

const lkrPrecise = new Intl.NumberFormat('en-LK', {
    style: 'currency',
    currency: 'LKR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

/** Rs 1,234,567 — for KPI values and table cells. */
export const formatLKR = (value: number | null | undefined): string => lkr.format(value ?? 0);

/** Rs 1,234.56 — for per-order figures where the cents matter. */
export const formatLKRPrecise = (value: number | null | undefined): string =>
    lkrPrecise.format(value ?? 0);

/**
 * LKR 12k / LKR 1.2M — for axis ticks, where a full figure would collide with
 * its neighbour. Never use it for a value the reader has to act on.
 */
export const compactLKR = (value: number | null | undefined): string => {
    const v = value ?? 0;
    if (Math.abs(v) >= 1_000_000) return `LKR ${(v / 1_000_000).toFixed(1)}M`;
    if (Math.abs(v) >= 1_000) return `LKR ${Math.round(v / 1_000)}k`;
    return `LKR ${Math.round(v)}`;
};

export const formatNumber = (value: number | null | undefined): string =>
    (value ?? 0).toLocaleString('en-LK');

/** 12.5% — percentages arrive from the API already rounded to one decimal. */
export const formatPercent = (value: number | null | undefined, digits = 1): string =>
    `${(value ?? 0).toFixed(digits)}%`;

/** Turn an order/payment status slug into a label: "out_for_delivery" → "Out For Delivery". */
export const titleCase = (slug: string): string =>
    slug
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
