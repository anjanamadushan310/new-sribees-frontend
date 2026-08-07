/**
 * Full per-branch breakdown — the Super Admin's network view.
 *
 * Every branch appears, including ones that sold nothing in the window: a
 * branch showing zero is exactly the row a Super Admin needs, and a table whose
 * rows appear and vanish between periods cannot be scanned.
 *
 * The chart beside it is one series in one colour, deliberately — colouring
 * each bar by its own size would double-encode the bar length as hue and burn
 * the only free channel on information the bar already shows.
 */
import React from 'react';
import { Card, Col, Empty, Progress, Row, Skeleton, Table, Tag, Tooltip, Typography } from 'antd';
import {
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    ResponsiveContainer,
    Tooltip as RTooltip,
    XAxis,
    YAxis,
} from 'recharts';
import type { ColumnsType } from 'antd/es/table';
import type { BranchPerformance } from '../../api/analytics.api';
import { compactLKR, formatLKR, formatNumber, formatPercent } from '../../utils/format';
import { CHROME, PRIMARY, STATUS, axisProps, gridProps } from '../../utils/chartTheme';
import type { ChartTooltipProps } from '../../utils/analytics';
import { DeltaTag } from './KpiCard';

const { Text } = Typography;

const ChartTooltip: React.FC<ChartTooltipProps<BranchPerformance>> = ({ active, payload }) => {
    if (!active || !payload?.length) return null;
    const row = payload[0].payload;
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
            <div style={{ fontWeight: 600 }}>{row.name}</div>
            <div>Revenue: {formatLKR(row.revenue)}</div>
            <div>Orders: {formatNumber(row.orders)}</div>
            <div>Share: {formatPercent(row.revenue_share)}</div>
        </div>
    );
};

interface Props {
    data: BranchPerformance[];
    loading?: boolean;
    days: number;
    /** Highlights one branch and dims the rest — used when a branch filter is on. */
    highlightBranchId?: string;
    /** Clicking a row drills the whole page into that branch. */
    onSelectBranch?: (branchId: string) => void;
    unassigned?: { revenue: number; orders: number } | null;
}

export const BranchPerformanceTable: React.FC<Props> = ({
    data,
    loading = false,
    days,
    highlightBranchId,
    onSelectBranch,
    unassigned,
}) => {
    const columns: ColumnsType<BranchPerformance> = [
        {
            title: 'Branch',
            dataIndex: 'name',
            key: 'name',
            fixed: 'left',
            width: 200,
            render: (name: string, row) => (
                <div>
                    <div style={{ fontWeight: 600 }}>{name}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {row.code}
                        {row.district ? ` · ${row.district}` : ''}
                    </Text>
                </div>
            ),
        },
        {
            title: 'Revenue',
            dataIndex: 'revenue',
            key: 'revenue',
            align: 'right',
            width: 150,
            sorter: (a, b) => a.revenue - b.revenue,
            defaultSortOrder: 'descend',
            render: (v: number) => <Text strong>{formatLKR(v)}</Text>,
        },
        {
            title: 'Share',
            dataIndex: 'revenue_share',
            key: 'revenue_share',
            width: 150,
            sorter: (a, b) => a.revenue_share - b.revenue_share,
            render: (v: number) => (
                <Progress
                    percent={v}
                    size="small"
                    strokeColor={PRIMARY}
                    format={() => formatPercent(v)}
                />
            ),
        },
        {
            title: <Tooltip title={`Revenue vs the previous ${days} days`}>Trend</Tooltip>,
            dataIndex: 'revenue_change',
            key: 'revenue_change',
            width: 130,
            sorter: (a, b) => (a.revenue_change ?? 0) - (b.revenue_change ?? 0),
            render: (_: unknown, row) => <DeltaTag value={row.revenue_change} />,
        },
        {
            title: 'Orders',
            dataIndex: 'orders',
            key: 'orders',
            align: 'right',
            width: 100,
            sorter: (a, b) => a.orders - b.orders,
            render: formatNumber,
        },
        {
            title: <Tooltip title="Average value of a paid order">AOV</Tooltip>,
            dataIndex: 'avg_order_value',
            key: 'avg_order_value',
            align: 'right',
            width: 130,
            sorter: (a, b) => a.avg_order_value - b.avg_order_value,
            render: (v: number) => formatLKR(v),
        },
        {
            title: 'Customers',
            dataIndex: 'customers',
            key: 'customers',
            align: 'right',
            width: 110,
            sorter: (a, b) => a.customers - b.customers,
            render: formatNumber,
        },
        {
            title: 'Items sold',
            dataIndex: 'items_sold',
            key: 'items_sold',
            align: 'right',
            width: 110,
            sorter: (a, b) => a.items_sold - b.items_sold,
            render: formatNumber,
        },
        {
            title: <Tooltip title="Units on hand across every stocked SKU">Stock</Tooltip>,
            dataIndex: 'units_on_hand',
            key: 'units_on_hand',
            align: 'right',
            width: 130,
            sorter: (a, b) => a.units_on_hand - b.units_on_hand,
            render: (v: number, row) => (
                <div>
                    <div>{formatNumber(v)}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {formatNumber(row.skus_stocked)} SKUs
                    </Text>
                </div>
            ),
        },
        {
            title: 'Low stock',
            dataIndex: 'low_stock_alerts',
            key: 'low_stock_alerts',
            align: 'right',
            width: 110,
            sorter: (a, b) => a.low_stock_alerts - b.low_stock_alerts,
            render: (v: number) =>
                v > 0 ? (
                    // Icon + label, never colour alone: the status palette is
                    // close enough to the series hues that colour cannot carry
                    // the meaning by itself.
                    <Tag color="warning">{formatNumber(v)} low</Tag>
                ) : (
                    <Text type="secondary">—</Text>
                ),
        },
        {
            title: 'Status',
            dataIndex: 'is_active',
            key: 'is_active',
            width: 100,
            render: (active: boolean) =>
                active ? <Tag color="success">Active</Tag> : <Tag>Inactive</Tag>,
        },
    ];

    if (loading) {
        return (
            <Card title="Branch performance">
                <Skeleton active paragraph={{ rows: 6 }} />
            </Card>
        );
    }

    const hasRevenue = data.some((b) => b.revenue > 0);

    return (
        <Card
            title="Branch performance"
            extra={
                <Text type="secondary" style={{ fontSize: 12 }}>
                    Last {days} days · every branch in the network
                </Text>
            }
        >
            {data.length === 0 ? (
                <Empty description="No branches configured yet" />
            ) : (
                <Row gutter={[16, 16]}>
                    <Col xs={24} xl={9}>
                        {hasRevenue ? (
                            <ResponsiveContainer width="100%" height={Math.max(220, data.length * 46)}>
                                <BarChart
                                    data={data}
                                    layout="vertical"
                                    margin={{ top: 4, right: 56, left: 4, bottom: 4 }}
                                    barCategoryGap="28%"
                                >
                                    <CartesianGrid {...gridProps} horizontal={false} vertical />
                                    <XAxis
                                        type="number"
                                        {...axisProps}
                                        tickFormatter={(v) => compactLKR(Number(v))}
                                    />
                                    <YAxis
                                        type="category"
                                        dataKey="code"
                                        width={52}
                                        {...axisProps}
                                    />
                                    <RTooltip
                                        content={<ChartTooltip />}
                                        cursor={{ fill: 'rgba(0,0,0,0.04)' }}
                                    />
                                    <Bar dataKey="revenue" radius={[0, 4, 4, 0]} maxBarSize={22}>
                                        {data.map((b) => (
                                            <Cell
                                                key={b.branch_id}
                                                fill={PRIMARY}
                                                // Emphasis, not identity: dimming
                                                // the rest keeps the filtered
                                                // branch in context instead of
                                                // hiding its peers.
                                                fillOpacity={
                                                    !highlightBranchId ||
                                                    highlightBranchId === b.branch_id
                                                        ? 1
                                                        : 0.28
                                                }
                                            />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <Empty description="No revenue in this period" />
                        )}
                    </Col>
                    <Col xs={24} xl={15}>
                        <Table<BranchPerformance>
                            columns={columns}
                            dataSource={data}
                            rowKey="branch_id"
                            size="small"
                            pagination={false}
                            scroll={{ x: 1200 }}
                            onRow={(row) => ({
                                onClick: () => onSelectBranch?.(row.branch_id),
                                style: onSelectBranch ? { cursor: 'pointer' } : undefined,
                            })}
                            rowClassName={(row) =>
                                highlightBranchId === row.branch_id ? 'ant-table-row-selected' : ''
                            }
                        />
                        {unassigned && (
                            <div style={{ marginTop: 12 }}>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    <span style={{ color: STATUS.warning }}>⚠</span>{' '}
                                    {formatNumber(unassigned.orders)} order(s) worth{' '}
                                    {formatLKR(unassigned.revenue)} are not assigned to any branch —
                                    their delivery post office has no branch coverage. Add coverage
                                    under Branches to bring them into these figures.
                                </Text>
                            </div>
                        )}
                        <div style={{ marginTop: 8 }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Revenue counts paid orders only, excluding cancelled and refunded
                                ones. Colour: {' '}
                                <span style={{ color: CHROME.textSecondary }}>
                                    all bars share one hue — length is the comparison.
                                </span>
                            </Text>
                        </div>
                    </Col>
                </Row>
            )}
        </Card>
    );
};

export default BranchPerformanceTable;
