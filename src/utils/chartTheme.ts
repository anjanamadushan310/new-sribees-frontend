/**
 * Chart palette and chrome for the admin analytics screens.
 *
 * The categorical slots are assigned in FIXED ORDER and never cycled — the
 * ordering is what keeps adjacent series distinguishable under colour-vision
 * deficiency, so slot 1 is always the first series on any chart, slot 2 always
 * the second, and a category keeps its colour when a filter removes its
 * neighbours. Past six classes, fold the tail into "Other" rather than inventing
 * a seventh hue; two of these steps sit below 3:1 against a white card, which is
 * why every chart using them also ships direct labels or the table beside it.
 *
 * Chrome is deliberately recessive: solid hairline gridlines (dashes read as
 * "threshold" when they are only a grid), muted tick labels, no axis clutter.
 */

export const SERIES = [
    '#D81B60', // 1 Sribees Magenta
    '#D39E4A', // 2 Warm Gold
    '#1baf7a', // 3 Aqua
    '#2a78d6', // 4 Blue
    '#e0457e', // 5 Magenta Light
    '#008300', // 6 Green
] as const;

export const MAX_SERIES = SERIES.length;

/** Primary series colour — one series on a chart always uses this (Sribees Magenta). */
export const PRIMARY = SERIES[0];
/** The comparison series (previous period) — warm golden amber. */
export const COMPARISON = SERIES[1];

/** Reserved state colours. Never reused as a "next series". */
export const STATUS = {
    good: '#0ca30c',
    warning: '#fab219',
    serious: '#ec835a',
    critical: '#d03b3b',
} as const;

export const CHROME = {
    grid: '#e1e0d9',
    axis: '#c3c2b7',
    muted: '#898781',
    surface: '#ffffff',
    textSecondary: '#52514e',
    /** Success/danger ink for deltas — text, not a series colour. */
    up: '#006300',
    down: '#d03b3b',
} as const;

/** Recharts axis props shared by every chart here. */
export const axisProps = {
    tick: { fontSize: 12, fill: CHROME.muted },
    tickLine: false,
    axisLine: { stroke: CHROME.axis },
} as const;

export const gridProps = {
    stroke: CHROME.grid,
    vertical: false,
} as const;
