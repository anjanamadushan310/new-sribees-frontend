/**
 * Revenue over time, with the previous equal-length period drawn alongside.
 *
 * Revenue and order count live on SEPARATE charts rather than sharing a plot
 * with two y-axes: the alignment of two independent scales is arbitrary, so a
 * dual-axis chart invents a correlation that is not in the data.
 *
 * The two series are index-aligned day-for-day by the API, so day 1 of this
 * period sits above day 1 of the last one — which is the only way the
 * comparison means anything when the periods have different calendar dates.
 */
import React from 'react';
import { Empty, Skeleton, Typography } from 'antd';
import {
    Area,
    AreaChart,
    CartesianGrid,
    Legend,
    Line,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from 'recharts';
import dayjs from 'dayjs';
import { compactLKR, formatLKR, formatNumber } from '../../utils/format';
import { COMPARISON, PRIMARY, axisProps, gridProps } from '../../utils/chartTheme';
import type { ChartTooltipProps, TrendRow } from '../../utils/analytics';

const { Text } = Typography;

type Metric = 'revenue' | 'orders';

const TrendTooltip: React.FC<ChartTooltipProps<TrendRow> & { metric: Metric }> = ({
    active,
    payload,
    metric,
}) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
    const fmt = metric === 'revenue' ? formatLKR : formatNumber;
    const current = metric === 'revenue' ? row.revenue : row.orders;
    const prior = metric === 'revenue' ? row.prevRevenue : row.prevOrders;

    return (
        <div
            style={{
                background: 'rgba(0,0,0,0.82)',
                color: '#fff',
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: 12,
                lineHeight: 1.6,
            }}
        >
            <div style={{ fontWeight: 600, marginBottom: 2 }}>
                {dayjs(row.date).format('ddd, MMM D YYYY')}
            </div>
            <div>
                <span style={{ color: PRIMARY }}>●</span> This period: {fmt(current)}
                {row.isPartial && ' (in progress — today isn’t over yet)'}
            </div>
            {prior !== undefined && (
                <div>
                    <span style={{ color: COMPARISON }}>●</span> {dayjs(row.prevDate).format('MMM D')}
                    : {fmt(prior)}
                </div>
            )}
        </div>
    );
};

interface Props {
    rows: TrendRow[];
    loading?: boolean;
    /** Which measure to plot. Each gets its own chart — never one plot with two axes. */
    metric: Metric;
    height?: number;
    showComparison?: boolean;
}

export const RevenueTrendChart: React.FC<Props> = ({
    rows,
    loading = false,
    metric,
    height = 300,
    showComparison = true,
}) => {
    if (loading) return <Skeleton active paragraph={{ rows: 6 }} />;
    if (rows.length === 0) return <Empty description="No data for this period" />;

    const key = metric === 'revenue' ? 'revenue' : 'orders';
    const prevKey = metric === 'revenue' ? 'prevRevenue' : 'prevOrders';
    const hasComparison = showComparison && rows.some((r) => r[prevKey] !== undefined);
    const tickFormatter = metric === 'revenue' ? compactLKR : (v: number) => formatNumber(v);
    const gradientId = `fill-${metric}`;

    // Today's bucket is still filling up, not a real drop — draw it as a
    // dashed tail off the solid series instead of letting the last point read
    // as a crash. Only the trailing point ever qualifies (see is_partial on
    // the /sales endpoint), so anything else is ignored defensively.
    //
    // `solidKey`/`partialKey` exist only for the chart to split its line on —
    // `row.revenue` / `row.orders` stay untouched so the tooltip still shows
    // today's real (partial) figure instead of a blank.
    const solidKey = `${key}Solid`;
    const partialKey = `${key}Partial`;
    const partialIndex = rows.findIndex((r) => r.isPartial);
    const hasPartial = partialIndex === rows.length - 1 && partialIndex > 0;
    const chartRows = rows.map((r, i) => {
        const value = r[key];
        if (hasPartial && i === partialIndex) {
            return { ...r, [solidKey]: undefined, [partialKey]: value };
        }
        if (hasPartial && i === partialIndex - 1) {
            return { ...r, [solidKey]: value, [partialKey]: value };
        }
        return { ...r, [solidKey]: value };
    });

    return (
        <>
            <ResponsiveContainer width="100%" height={height}>
                <AreaChart data={chartRows} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={PRIMARY} stopOpacity={0.28} />
                            <stop offset="95%" stopColor={PRIMARY} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid {...gridProps} />
                    <XAxis
                        dataKey="date"
                        tickFormatter={(d) => dayjs(d).format('MMM D')}
                        interval="preserveStartEnd"
                        minTickGap={32}
                        {...axisProps}
                    />
                    <YAxis
                        tickFormatter={(v) => tickFormatter(Number(v))}
                        width={68}
                        {...axisProps}
                    />
                    <Tooltip
                        content={<TrendTooltip metric={metric} />}
                        cursor={{ stroke: PRIMARY, strokeWidth: 1 }}
                    />
                    {/* A legend is only meaningful once there are two series to
                        tell apart; with one, the card title already names it. */}
                    {hasComparison && <Legend verticalAlign="top" height={28} iconType="plainline" />}
                    {hasComparison && (
                        <Line
                            type="monotone"
                            dataKey={prevKey}
                            name="Previous period"
                            stroke={COMPARISON}
                            strokeWidth={2}
                            dot={false}
                            activeDot={false}
                        />
                    )}
                    <Area
                        type="monotone"
                        dataKey={solidKey}
                        name="This period"
                        stroke={PRIMARY}
                        strokeWidth={2}
                        fill={`url(#${gradientId})`}
                        activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                        connectNulls={false}
                    />
                    {hasPartial && (
                        <Line
                            type="monotone"
                            dataKey={partialKey}
                            name="Today (in progress)"
                            stroke={PRIMARY}
                            strokeWidth={2}
                            strokeDasharray="4 4"
                            dot={false}
                            activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }}
                            legendType="none"
                        />
                    )}
                </AreaChart>
            </ResponsiveContainer>
            {(hasComparison || hasPartial) && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {hasComparison &&
                        'Days are aligned by position, so day 1 of this period sits above day 1 of the previous one. '}
                    {hasPartial && "Today's bar is still filling up — shown dashed until the day ends."}
                </Text>
            )}
        </>
    );
};

export default RevenueTrendChart;
