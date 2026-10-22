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
import type { ColumnsType } from 'antd/es/table';
import type { BranchPerformance } from '../../api/analytics.api';
import { compactLKR, formatLKR, formatNumber, formatPercent } from '../../utils/format';
import { CHROME, PRIMARY, STATUS } from '../../utils/chartTheme';
import { DeltaTag } from './KpiCard';

const { Text } = Typography;


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
            width: 170,
            render: (name: string, row) => (
                <div>
                    <div style={{ fontWeight: 600 }}>
                        {name}
                        {!row.is_active && (
                            <Tag style={{ marginLeft: 6 }}>Inactive</Tag>
                        )}
                    </div>
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
            width: 130,
            sorter: (a, b) => a.revenue - b.revenue,
            defaultSortOrder: 'descend',
            render: (v: number) => <Text strong>{formatLKR(v)}</Text>,
        },
        {
            title: 'Share',
            dataIndex: 'revenue_share',
            key: 'revenue_share',
            width: 120,
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
            width: 110,
            sorter: (a, b) => (a.revenue_change ?? 0) - (b.revenue_change ?? 0),
            render: (_: unknown, row) => <DeltaTag value={row.revenue_change} />,
        },
        {
            title: 'Orders',
            dataIndex: 'orders',
            key: 'orders',
            align: 'right',
            width: 90,
            sorter: (a, b) => a.orders - b.orders,
            render: formatNumber,
        },
        {
            title: <Tooltip title="Average value of a paid order">AOV</Tooltip>,
            dataIndex: 'avg_order_value',
            key: 'avg_order_value',
            align: 'right',
            width: 115,
            sorter: (a, b) => a.avg_order_value - b.avg_order_value,
            render: (v: number) => formatLKR(v),
        },
        {
            title: <Tooltip title="Distinct customers who ordered in this period">Buyers</Tooltip>,
            dataIndex: 'customers',
            key: 'customers',
            align: 'right',
            width: 90,
            sorter: (a, b) => a.customers - b.customers,
            render: formatNumber,
        },
        {
            title: 'Items sold',
            dataIndex: 'items_sold',
            key: 'items_sold',
            align: 'right',
            width: 95,
            sorter: (a, b) => a.items_sold - b.items_sold,
            render: formatNumber,
        },
        {
            title: <Tooltip title="Units on hand across every stocked SKU">Stock</Tooltip>,
            dataIndex: 'units_on_hand',
            key: 'units_on_hand',
            align: 'right',
            width: 105,
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
            title: <Tooltip title="Share of this branch's orders that ended cancelled or refunded">Cancelled</Tooltip>,
            dataIndex: 'cancellation_rate',
            key: 'cancellation_rate',
            align: 'right',
            width: 110,
            sorter: (a, b) => a.cancellation_rate - b.cancellation_rate,
            render: (v: number, row) =>
                row.cancelled_orders > 0 ? (
                    <div>
                        <div>{formatPercent(v)}</div>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {formatNumber(row.cancelled_orders)} order(s)
                        </Text>
                    </div>
                ) : (
                    <Text type="secondary">—</Text>
                ),
        },
        {
            title: 'Low stock',
            dataIndex: 'low_stock_alerts',
            key: 'low_stock_alerts',
            align: 'right',
            width: 95,
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
    ];

    if (loading) {
        return (
            <Card title="Branch performance">
                <Skeleton active paragraph={{ rows: 6 }} />
            </Card>
        );
    }

    const sortedByRevenue = [...data].sort((a, b) => b.revenue - a.revenue);
    const topBranch = sortedByRevenue[0] ?? null;
    const maxRevenue = topBranch?.revenue ?? 1;

    return (
        <Card
            data-testid="branch-performance"
            style={{
                borderRadius: 20,
                border: '1px solid #ECEAF0',
                boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
            }}
            title={
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 18, fontWeight: 800, color: '#1A1A22' }}>
                            Branch Performance Intelligence Hub
                        </span>
                        <span
                            style={{
                                display: 'inline-block',
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: '#10B981',
                            }}
                        />
                    </div>
                    <Text type="secondary" style={{ fontSize: 12, fontWeight: 400 }}>
                        Last {days} days · comparative revenue & fulfillment telemetry across all network locations
                    </Text>
                </div>
            }
            extra={
                <Tag
                    bordered={false}
                    style={{
                        background: '#FCE4EC',
                        color: '#D81B60',
                        fontWeight: 700,
                        borderRadius: 16,
                        padding: '4px 12px',
                        fontSize: 12,
                    }}
                >
                    {data.length} Branches Configured
                </Tag>
            }
        >
            {data.length === 0 ? (
                <Empty description="No branches configured yet" />
            ) : (
                <Row gutter={[20, 20]}>
                    <Col xs={24} xl={7}>
                        <div style={{ paddingRight: 6 }}>
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: 12,
                                }}
                            >
                                <Text
                                    style={{
                                        fontSize: 11,
                                        fontWeight: 700,
                                        letterSpacing: '0.06em',
                                        color: '#8c8c8c',
                                    }}
                                >
                                    VOLUME DISTRIBUTION
                                </Text>
                                <span
                                    style={{
                                        fontSize: 11,
                                        fontWeight: 600,
                                        color: '#D81B60',
                                        background: '#FCE4EC',
                                        borderRadius: 12,
                                        padding: '2px 8px',
                                    }}
                                >
                                    All {data.length} Branches
                                </span>
                            </div>

                            {topBranch && topBranch.revenue > 0 && (
                                <div
                                    style={{
                                        borderRadius: 14,
                                        border: '1.5px solid #F8BBD0',
                                        background: '#FFF8FA',
                                        padding: '12px 14px',
                                        marginBottom: 14,
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                        }}
                                    >
                                        <div>
                                            <div
                                                style={{
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    color: '#D81B60',
                                                    letterSpacing: '0.05em',
                                                }}
                                            >
                                                TOP CONTRIBUTING BRANCH
                                            </div>
                                            <div
                                                style={{
                                                    fontSize: 15,
                                                    fontWeight: 800,
                                                    color: '#1A1A22',
                                                    marginTop: 2,
                                                }}
                                            >
                                                {topBranch.name} ({topBranch.code})
                                            </div>
                                            <div style={{ fontSize: 11, color: '#8c8c8c', marginTop: 1 }}>
                                                {topBranch.district
                                                    ? `${topBranch.district} District`
                                                    : 'Network Hub'}
                                            </div>
                                        </div>
                                        <div style={{ textAlign: 'right' }}>
                                            <div style={{ fontSize: 14, fontWeight: 800, color: '#D81B60' }}>
                                                {formatLKR(topBranch.revenue)}
                                            </div>
                                            <span
                                                style={{
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    color: '#16a34a',
                                                    background: '#dcfce7',
                                                    padding: '1px 6px',
                                                    borderRadius: 6,
                                                    display: 'inline-block',
                                                    marginTop: 2,
                                                }}
                                            >
                                                {formatPercent(topBranch.revenue_share)} Volume
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* List of branches with mini progress bars */}
                            <div style={{ maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
                                {sortedByRevenue.map((b) => {
                                    const isTop = b.branch_id === topBranch?.branch_id;
                                    const isSelected = highlightBranchId === b.branch_id;
                                    const barPercent = maxRevenue > 0 ? (b.revenue / maxRevenue) * 100 : 0;
                                    return (
                                        <div
                                            key={b.branch_id}
                                            onClick={() => onSelectBranch?.(b.branch_id)}
                                            style={{
                                                padding: '8px 10px',
                                                borderRadius: 10,
                                                cursor: onSelectBranch ? 'pointer' : 'default',
                                                background: isSelected ? '#FDF2F5' : 'transparent',
                                                marginBottom: 4,
                                                transition: 'background 0.2s',
                                                border: isSelected ? '1px solid #FCE4EC' : '1px solid transparent',
                                            }}
                                        >
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    fontSize: 12,
                                                    marginBottom: 4,
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        fontWeight: isTop || isSelected ? 700 : 500,
                                                        color: '#333',
                                                    }}
                                                >
                                                    <span
                                                        style={{
                                                            color: isTop ? '#D81B60' : '#8c8c8c',
                                                            marginRight: 6,
                                                        }}
                                                    >
                                                        ●
                                                    </span>
                                                    {b.code} ({b.name})
                                                </span>
                                                <span
                                                    style={{
                                                        fontWeight: 600,
                                                        color: isTop ? '#D81B60' : '#555',
                                                    }}
                                                >
                                                    {compactLKR(b.revenue)}
                                                </span>
                                            </div>
                                            <div
                                                style={{
                                                    height: 5,
                                                    background: '#f0f0f2',
                                                    borderRadius: 3,
                                                    overflow: 'hidden',
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        height: '100%',
                                                        width: `${Math.max(barPercent, b.revenue > 0 ? 3 : 0)}%`,
                                                        background: isTop ? '#D81B60' : '#E0457E',
                                                        borderRadius: 3,
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </Col>
                    <Col xs={24} xl={17}>
                        <Table<BranchPerformance>
                            columns={columns}
                            dataSource={data}
                            rowKey="branch_id"
                            size="small"
                            pagination={false}
                            scroll={{ x: 1000 }}
                            onRow={(row) => ({
                                'data-testid': `branch-row-${row.code}`,
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
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                marginTop: 12,
                                flexWrap: 'wrap',
                                gap: 8,
                            }}
                        >
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Revenue counts paid orders only, excluding cancelled and refunded
                                ones. Colour:{' '}
                                <span style={{ color: CHROME.textSecondary }}>
                                    all bars share one hue — length is the comparison.
                                </span>
                            </Text>
                            {onSelectBranch && (
                                <span style={{ fontSize: 12, color: '#D81B60', fontWeight: 600 }}>
                                    Click any branch row to scope this page to it.
                                </span>
                            )}
                        </div>
                    </Col>
                </Row>
            )}
        </Card>
    );
};

export default BranchPerformanceTable;
