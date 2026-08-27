/**
 * Analytics & Reports (Module 7.2)
 *
 * The reporting counterpart to the Dashboard: same figures, same definitions,
 * but sliced — by branch, by product, by customer, by category, by fulfilment
 * status — over a period the user chooses.
 *
 * Branch visibility is decided by the server (`inject_branch_filter`): a Super
 * Admin sees the whole network and can drill into any branch, a Branch Manager
 * only ever receives their own branch's rows no matter what this page asks for.
 * The UI reflects that scope rather than enforcing it.
 */
import React, { useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    Dropdown,
    Empty,
    Modal,
    Progress,
    Row,
    Skeleton,
    Space,
    Table,
    Tag,
    Typography,
} from 'antd';
import type { MenuProps } from 'antd';
import {
    DollarOutlined,
    RiseOutlined,
    ShoppingCartOutlined,
    TeamOutlined,
    DropboxOutlined,
    DownloadOutlined,
    FilePdfOutlined,
    FileTextOutlined,
    PrinterOutlined,
} from '@ant-design/icons';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import type { ColumnsType } from 'antd/es/table';

import {
    analyticsApi,
    type CategorySplit,
    type TopCustomer,
    type TopProduct,
} from '../../api/analytics.api';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuthStore } from '../../store/authStore';
import {
    AnalyticsFilters,
    BranchPerformanceTable,
    KpiCard,
    RevenueTrendChart,
} from '../../components/analytics';
import { apiErrorMessage, mergeSeries } from '../../utils/analytics';
import type { ChartTooltipProps } from '../../utils/analytics';
import {
    formatLKR,
    formatNumber,
    formatPercent,
    titleCase,
} from '../../utils/format';
import { MAX_SERIES, PRIMARY, SERIES, STATUS } from '../../utils/chartTheme';

const { Title, Text } = Typography;

/** Statuses that mean the order will never turn into revenue. */
const VOID_STATUSES = new Set(['cancelled', 'refunded']);

const CategoryTooltip: React.FC<ChartTooltipProps<CategorySplit>> = ({ active, payload }) => {
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
            <div>{formatLKR(row.revenue)}</div>
            <div>
                {formatPercent(row.share)} · {formatNumber(row.units_sold)} units
            </div>
        </div>
    );
};

const Analytics: React.FC = () => {
    const { isSuperAdmin } = usePermissions();
    const [days, setDays] = useState(30);
    const [branchId, setBranchId] = useState<string | undefined>(undefined);
    const [pdfModalOpen, setPdfModalOpen] = useState(false);

    const query = useMemo(() => ({ days, branchId }), [days, branchId]);
    const key = ['admin', 'analytics', days, branchId ?? 'all'] as const;

    const summaryQuery = useQuery({
        queryKey: [...key, 'summary'],
        queryFn: () => analyticsApi.summary(query),
    });
    const salesQuery = useQuery({
        queryKey: [...key, 'sales'],
        queryFn: () => analyticsApi.sales(query, true),
    });
    const branchesQuery = useQuery({
        queryKey: ['admin', 'analytics', days, 'branches'],
        queryFn: () => analyticsApi.branches(days),
    });
    const productsQuery = useQuery({
        queryKey: [...key, 'top-products'],
        queryFn: () => analyticsApi.topProducts(query, 10),
    });
    const customersQuery = useQuery({
        queryKey: [...key, 'top-customers'],
        queryFn: () => analyticsApi.topCustomers(query, 10),
    });
    const categoriesQuery = useQuery({
        queryKey: [...key, 'categories'],
        queryFn: () => analyticsApi.categories(query),
    });
    const statusQuery = useQuery({
        queryKey: [...key, 'order-status'],
        queryFn: () => analyticsApi.orderStatus(query),
    });

    const summary = summaryQuery.data;
    const current = summary?.current;

    const { user } = useAuthStore();

    const handleExportPDF = () => {
        setPdfModalOpen(true);
    };

    const downloadCSV = (headers: string[], rows: (string | number | boolean | null | undefined)[][], filename: string) => {
        const csvContent = [
            headers.join(','),
            ...rows.map(row => 
                row.map(val => {
                    const escaped = ('' + (val ?? '')).replace(/"/g, '""');
                    return `"${escaped}"`;
                }).join(',')
            )
        ].join('\n');
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleExportKpiCSV = () => {
        if (!current) return;
        const headers = ['Metric', 'Value', 'Delta vs Previous Period'];
        const formatDelta = (d: number | null | undefined) => 
            d === null || d === undefined ? 'New' : `${d > 0 ? '+' : ''}${d.toFixed(1)}%`;
            
        const rows = [
            ['Revenue', current.revenue, formatDelta(summary?.deltas.revenue)],
            ['Orders', current.orders, formatDelta(summary?.deltas.orders)],
            ['Avg Order Value', current.avg_order_value, formatDelta(summary?.deltas.avg_order_value)],
            ['Customers', current.customers, formatDelta(summary?.deltas.customers)],
            ['Items Sold', current.items_sold, formatDelta(summary?.deltas.items_sold)],
        ];
        downloadCSV(headers, rows, `analytics_kpis_${dayjs().format('YYYYMMDD')}.csv`);
    };

    const handleExportSalesTrendCSV = () => {
        const headers = ['Date', 'Revenue (LKR)', 'Orders Count', 'Previous Revenue (LKR)', 'Previous Orders'];
        const rows = trendRows.map((r) => [
            r.date,
            r.revenue,
            r.orders,
            r.previous_revenue ?? 0,
            r.previous_orders ?? 0,
        ]);
        downloadCSV(headers, rows, `sales_trend_chart_data_${dayjs().format('YYYYMMDD')}.csv`);
    };

    const handleExportCategoriesCSV = () => {
        const headers = ['Category ID', 'Category Name', 'Revenue (LKR)', 'Units Sold', 'Market Share (%)'];
        const rows = categorySlices.map((c) => [
            c.category_id,
            c.name,
            c.revenue,
            c.units_sold,
            c.share,
        ]);
        downloadCSV(headers, rows, `category_share_chart_data_${dayjs().format('YYYYMMDD')}.csv`);
    };

    const handleExportOrderStatusCSV = () => {
        const headers = ['Order Status', 'Orders Count', 'Share (%)', 'Revenue (LKR)'];
        const rows = statusRows.map((s) => [
            titleCase(s.status),
            s.orders,
            statusTotal ? ((s.orders / statusTotal) * 100).toFixed(1) + '%' : '0%',
            s.revenue,
        ]);
        downloadCSV(headers, rows, `order_fulfilment_data_${dayjs().format('YYYYMMDD')}.csv`);
    };

    const handleExportProductsCSV = () => {
        const data = productsQuery.data || [];
        const headers = ['Rank', 'Product Name', 'SKU', 'Category', 'Units Sold', 'Revenue (LKR)'];
        const rows = data.map((p, idx) => [
            idx + 1,
            p.name || 'Unnamed',
            p.sku || '',
            p.category || '',
            p.units_sold,
            p.revenue
        ]);
        downloadCSV(headers, rows, `top_products_${dayjs().format('YYYYMMDD')}.csv`);
    };

    const handleExportCustomersCSV = () => {
        const data = customersQuery.data || [];
        const headers = ['Rank', 'Customer Name', 'Email', 'Phone', 'Orders Count', 'Total Spent (LKR)', 'Last Order Date'];
        const rows = data.map((c, idx) => [
            idx + 1,
            c.full_name || 'Unnamed',
            c.email || '',
            c.phone || '',
            c.orders,
            c.revenue,
            c.last_order_at ? dayjs(c.last_order_at).format('YYYY-MM-DD') : ''
        ]);
        downloadCSV(headers, rows, `top_customers_${dayjs().format('YYYYMMDD')}.csv`);
    };

    const handleExportBranchesCSV = () => {
        const data = branchesQuery.data?.branches || [];
        const headers = ['Branch Code', 'Branch Name', 'District', 'Revenue (LKR)', 'Orders Count', 'Cancellation Rate', 'Low Stock Alerts'];
        const rows = data.map(b => [
            b.code,
            b.name,
            b.district || '',
            b.revenue,
            b.orders,
            `${(b.cancellation_rate || 0).toFixed(1)}%`,
            b.low_stock_alerts
        ]);
        downloadCSV(headers, rows, `branch_performance_${dayjs().format('YYYYMMDD')}.csv`);
    };

    const exportItems: MenuProps['items'] = [
        {
            key: 'pdf',
            label: 'PDF Report Summary',
            icon: <FilePdfOutlined style={{ color: '#ff4d4f' }} />,
            onClick: handleExportPDF,
        },
        {
            type: 'divider',
        },
        {
            key: 'csv-kpi',
            label: 'Export KPIs (CSV)',
            icon: <FileTextOutlined />,
            onClick: handleExportKpiCSV,
        },
        {
            key: 'csv-sales-trend',
            label: 'Export Sales Trend Chart Data (CSV)',
            icon: <FileTextOutlined />,
            onClick: handleExportSalesTrendCSV,
        },
        {
            key: 'csv-categories',
            label: 'Export Category Share Data (CSV)',
            icon: <FileTextOutlined />,
            onClick: handleExportCategoriesCSV,
        },
        {
            key: 'csv-order-status',
            label: 'Export Order Fulfilment Data (CSV)',
            icon: <FileTextOutlined />,
            onClick: handleExportOrderStatusCSV,
        },
        {
            key: 'csv-products',
            label: 'Export Top Products (CSV)',
            icon: <FileTextOutlined />,
            onClick: handleExportProductsCSV,
        },
        {
            key: 'csv-customers',
            label: 'Export Top Customers (CSV)',
            icon: <FileTextOutlined />,
            onClick: handleExportCustomersCSV,
        },
        ...(isSuperAdmin ? [
            {
                key: 'csv-branches',
                label: 'Export Branches (CSV)',
                icon: <FileTextOutlined />,
                onClick: handleExportBranchesCSV,
            }
        ] : []),
    ];
    const trendRows = useMemo(
        () => mergeSeries(salesQuery.data?.series ?? [], salesQuery.data?.previous_series),
        [salesQuery.data]
    );

    /**
     * Past six classes adjacent slices stop being distinguishable, so the tail
     * folds into a single "Other" rather than reaching for a seventh hue.
     */
    const categorySlices = useMemo<CategorySplit[]>(() => {
        const rows = categoriesQuery.data?.categories ?? [];
        if (rows.length <= MAX_SERIES) return rows;
        const head = rows.slice(0, MAX_SERIES - 1);
        const tail = rows.slice(MAX_SERIES - 1);
        return [
            ...head,
            {
                category_id: '__other__',
                name: `Other (${tail.length})`,
                revenue: tail.reduce((s, r) => s + r.revenue, 0),
                units_sold: tail.reduce((s, r) => s + r.units_sold, 0),
                share: Number(tail.reduce((s, r) => s + r.share, 0).toFixed(1)),
            },
        ];
    }, [categoriesQuery.data]);

    const firstError = [
        summaryQuery,
        salesQuery,
        branchesQuery,
        productsQuery,
        customersQuery,
        categoriesQuery,
        statusQuery,
    ].find((q) => q.isError);

    const productColumns: ColumnsType<TopProduct> = [
        {
            title: '#',
            key: 'rank',
            width: 48,
            render: (_: unknown, __: TopProduct, i: number) => i + 1,
        },
        {
            title: 'Product',
            dataIndex: 'name',
            key: 'name',
            render: (name: string, row) => (
                <div>
                    <div>{name}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {[row.sku, row.category].filter(Boolean).join(' · ') || '—'}
                    </Text>
                </div>
            ),
        },
        {
            title: 'Units',
            dataIndex: 'units_sold',
            key: 'units_sold',
            align: 'right',
            width: 90,
            render: formatNumber,
        },
        {
            title: 'Revenue',
            dataIndex: 'revenue',
            key: 'revenue',
            align: 'right',
            width: 140,
            render: (v: number) => <Text strong>{formatLKR(v)}</Text>,
        },
    ];

    const customerColumns: ColumnsType<TopCustomer> = [
        {
            title: '#',
            key: 'rank',
            width: 48,
            render: (_: unknown, __: TopCustomer, i: number) => i + 1,
        },
        {
            title: 'Customer',
            dataIndex: 'full_name',
            key: 'full_name',
            render: (name: string, row) => (
                <div>
                    <div>{name}</div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {row.email || row.phone || '—'}
                    </Text>
                </div>
            ),
        },
        {
            title: 'Orders',
            dataIndex: 'orders',
            key: 'orders',
            align: 'right',
            width: 90,
            render: formatNumber,
        },
        {
            title: 'Spent',
            dataIndex: 'revenue',
            key: 'revenue',
            align: 'right',
            width: 140,
            render: (v: number) => <Text strong>{formatLKR(v)}</Text>,
        },
        {
            title: 'Last order',
            dataIndex: 'last_order_at',
            key: 'last_order_at',
            width: 130,
            render: (v: string | null) =>
                // Take the UTC calendar date off the ISO string rather than
                // letting dayjs shift it into the viewer's zone: the period
                // header above is a UTC range, and a "last order" dated after
                // the range ends reads as a bug.
                v ? dayjs(v.slice(0, 10)).format('MMM D, YYYY') : <Text type="secondary">—</Text>,
        },
    ];

    const statusRows = statusQuery.data?.statuses ?? [];
    const statusTotal = statusQuery.data?.total_orders ?? 0;

    return (
        <div data-testid="analytics-page">
            {/* Print-only Header (Hidden on screen, visible only during PDF printing) */}
            <div className="print-header" style={{ display: 'none' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                        <h1 style={{ margin: 0, color: '#1890ff', fontSize: 28 }}>SRIBEESonline</h1>
                        <span style={{ fontSize: 14, color: '#666' }}>Executive Analytics &amp; Reports Summary</span>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 12, color: '#666' }}>
                        <div><strong>Report Period:</strong> {days} Days ({summary ? `${dayjs(summary.range.start_date).format('MMM D, YYYY')} - ${dayjs(summary.range.end_date).format('MMM D, YYYY')}` : ''})</div>
                        <div><strong>Branch Scope:</strong> {branchId ? (branchesQuery.data?.branches.find(b => b.branch_id === branchId)?.name || 'Filtered') : 'All Branches'}</div>
                        <div><strong>Generated By:</strong> {user?.full_name || 'Administrator'}</div>
                        <div><strong>Generated At:</strong> {dayjs().format('YYYY-MM-DD HH:mm:ss')}</div>
                    </div>
                </div>
            </div>

            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginBottom: 20,
                }}
            >
                <div>
                    <Title level={3} style={{ margin: 0 }} className="no-print">
                        Analytics &amp; Reports
                    </Title>
                    {summary && (
                        <Text type="secondary" style={{ fontSize: 12 }} className="no-print">
                            {dayjs(summary.range.start_date).format('MMM D, YYYY')} –{' '}
                            {dayjs(summary.range.end_date).format('MMM D, YYYY')}
                            {' · compared with '}
                            {dayjs(summary.range.previous_start_date).format('MMM D')} –{' '}
                            {dayjs(summary.range.previous_end_date).format('MMM D')}
                            {!summary.scope.is_super_admin && ' · your branch only'}
                        </Text>
                    )}
                </div>
                <Space wrap size={12} className="no-print" style={{ alignItems: 'center' }}>
                    <AnalyticsFilters
                        days={days}
                        onDaysChange={setDays}
                        showBranchFilter={isSuperAdmin}
                        branchId={branchId}
                        onBranchChange={setBranchId}
                    />
                    <Dropdown menu={{ items: exportItems }} trigger={['click']} placement="bottomRight">
                        <Button type="primary" icon={<DownloadOutlined />}>Export Report</Button>
                    </Dropdown>
                </Space>
            </div>

            {firstError && (
                <Alert
                    type="error"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="Failed to load analytics"
                    description={apiErrorMessage(firstError.error)}
                />
            )}

            {/* KPIs — each against the equal-length period before it. */}
            <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} xl={5}>
                    <KpiCard
                        title="Revenue"
                        value={formatLKR(current?.revenue)}
                        icon={<DollarOutlined />}
                        accent={SERIES[5]}
                        loading={summaryQuery.isLoading}
                        delta={summary?.deltas.revenue}
                        deltaCaption={`vs previous ${days} days`}
                        hint="Paid orders only, excluding cancelled and refunded ones."
                    />
                </Col>
                <Col xs={24} sm={12} xl={5}>
                    <KpiCard
                        title="Orders"
                        value={formatNumber(current?.orders)}
                        icon={<ShoppingCartOutlined />}
                        accent={PRIMARY}
                        loading={summaryQuery.isLoading}
                        delta={summary?.deltas.orders}
                        deltaCaption={`vs previous ${days} days`}
                        footnote={`${formatNumber(current?.paid_orders)} paid`}
                        hint="Every order placed in the period, whatever its status."
                    />
                </Col>
                <Col xs={24} sm={12} xl={5}>
                    <KpiCard
                        title="Avg order value"
                        value={formatLKR(current?.avg_order_value)}
                        icon={<RiseOutlined />}
                        accent={SERIES[1]}
                        loading={summaryQuery.isLoading}
                        delta={summary?.deltas.avg_order_value}
                        deltaCaption={`vs previous ${days} days`}
                        hint="Revenue divided by paid orders — unpaid baskets do not drag it down."
                    />
                </Col>
                <Col xs={24} sm={12} xl={5}>
                    <KpiCard
                        title="Customers"
                        value={formatNumber(current?.customers)}
                        icon={<TeamOutlined />}
                        accent={SERIES[4]}
                        loading={summaryQuery.isLoading}
                        delta={summary?.deltas.customers}
                        deltaCaption={`vs previous ${days} days`}
                        footnote={`${formatNumber(summary?.new_customers)} first-time`}
                        hint="Distinct customers who placed at least one order in the period."
                    />
                </Col>
                <Col xs={24} sm={12} xl={4}>
                    <KpiCard
                        title="Items sold"
                        value={formatNumber(current?.items_sold)}
                        icon={<DropboxOutlined />}
                        accent={SERIES[2]}
                        loading={summaryQuery.isLoading}
                        delta={summary?.deltas.items_sold}
                        deltaCaption={`vs previous ${days} days`}
                        hint="Units across every line of every paid order."
                    />
                </Col>
            </Row>

            {/* Revenue and orders get their own plots — a single chart with two
                y-scales would invent a relationship the data does not contain. */}
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col xs={24} xl={14}>
                    <Card title="Revenue over time">
                        <RevenueTrendChart
                            rows={trendRows}
                            loading={salesQuery.isLoading}
                            metric="revenue"
                            height={320}
                        />
                    </Card>
                </Col>
                <Col xs={24} xl={10}>
                    <Card title="Orders over time">
                        <RevenueTrendChart
                            rows={trendRows}
                            loading={salesQuery.isLoading}
                            metric="orders"
                            height={320}
                        />
                    </Card>
                </Col>
            </Row>

            {/* The Super Admin's network view. */}
            {(isSuperAdmin || (branchesQuery.data?.branches.length ?? 0) > 0) && (
                <div style={{ marginTop: 16 }}>
                    <BranchPerformanceTable
                        data={branchesQuery.data?.branches ?? []}
                        loading={branchesQuery.isLoading}
                        days={days}
                        highlightBranchId={branchId}
                        onSelectBranch={
                            isSuperAdmin
                                ? (id) => setBranchId(id === branchId ? undefined : id)
                                : undefined
                        }
                        unassigned={branchesQuery.data?.unassigned ?? null}
                    />
                </div>
            )}

            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col xs={24} xl={10}>
                    <Card title="Revenue by category" data-testid="category-mix">
                        {categoriesQuery.isLoading ? (
                            <Skeleton active paragraph={{ rows: 6 }} />
                        ) : categorySlices.length === 0 ? (
                            <Empty description="No sales in this period" />
                        ) : (
                            <>
                                <ResponsiveContainer width="100%" height={260}>
                                    <PieChart>
                                        <Pie
                                            // Recharts types its data as an
                                            // open record; an interface without
                                            // an index signature is structurally
                                            // fine but does not satisfy it.
                                            data={categorySlices as unknown as Record<string, unknown>[]}
                                            dataKey="revenue"
                                            nameKey="name"
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={58}
                                            outerRadius={94}
                                            // 2px of surface between slices, so
                                            // neighbouring fills separate without
                                            // a stroke drawn around each one.
                                            paddingAngle={2}
                                            stroke="#fff"
                                            strokeWidth={2}
                                        >
                                            {categorySlices.map((row, i) => (
                                                <Cell key={row.category_id} fill={SERIES[i]} />
                                            ))}
                                        </Pie>
                                        <RTooltip content={<CategoryTooltip />} />
                                    </PieChart>
                                </ResponsiveContainer>
                                {/* The written list is the accessibility relief
                                    for the lighter slots and doubles as the
                                    legend, so identity is never colour-alone. */}
                                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                                    {categorySlices.map((row, i) => (
                                        <div
                                            key={row.category_id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 8,
                                            }}
                                        >
                                            <span
                                                style={{
                                                    width: 10,
                                                    height: 10,
                                                    borderRadius: 2,
                                                    background: SERIES[i],
                                                    flex: '0 0 auto',
                                                }}
                                            />
                                            <span style={{ flex: 1 }}>{row.name}</span>
                                            <Text strong>{formatLKR(row.revenue)}</Text>
                                            <Text type="secondary" style={{ width: 52, textAlign: 'right' }}>
                                                {formatPercent(row.share)}
                                            </Text>
                                        </div>
                                    ))}
                                </Space>
                            </>
                        )}
                    </Card>
                </Col>

                <Col xs={24} xl={14}>
                    <Card
                        data-testid="order-fulfilment"
                        title="Order fulfilment"
                        extra={
                            statusQuery.data && (
                                <Space size={16}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        Delivered{' '}
                                        <Text strong style={{ color: STATUS.good }}>
                                            {formatPercent(statusQuery.data.fulfilment_rate)}
                                        </Text>
                                    </Text>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        Cancelled/refunded{' '}
                                        <Text strong style={{ color: STATUS.critical }}>
                                            {formatPercent(statusQuery.data.cancellation_rate)}
                                        </Text>
                                    </Text>
                                </Space>
                            )
                        }
                    >
                        {statusQuery.isLoading ? (
                            <Skeleton active paragraph={{ rows: 6 }} />
                        ) : statusTotal === 0 ? (
                            <Empty description="No orders in this period" />
                        ) : (
                            // Ten statuses is past the point where colour classes
                            // stay readable, so this is a table, not a chart.
                            <Table
                                size="small"
                                pagination={false}
                                rowKey="status"
                                dataSource={statusRows}
                                columns={[
                                    {
                                        title: 'Status',
                                        dataIndex: 'status',
                                        key: 'status',
                                        render: (s: string) =>
                                            VOID_STATUSES.has(s) ? (
                                                <Tag color="error">{titleCase(s)}</Tag>
                                            ) : s === 'delivered' ? (
                                                <Tag color="success">{titleCase(s)}</Tag>
                                            ) : (
                                                <span>{titleCase(s)}</span>
                                            ),
                                    },
                                    {
                                        title: 'Orders',
                                        dataIndex: 'orders',
                                        key: 'orders',
                                        align: 'right',
                                        width: 100,
                                        render: formatNumber,
                                    },
                                    {
                                        title: 'Share',
                                        key: 'share',
                                        width: 180,
                                        render: (_: unknown, row) => (
                                            <Progress
                                                percent={
                                                    statusTotal
                                                        ? (row.orders / statusTotal) * 100
                                                        : 0
                                                }
                                                size="small"
                                                strokeColor={PRIMARY}
                                                format={(p) => `${(p ?? 0).toFixed(1)}%`}
                                            />
                                        ),
                                    },
                                    {
                                        title: 'Revenue',
                                        dataIndex: 'revenue',
                                        key: 'revenue',
                                        align: 'right',
                                        width: 140,
                                        render: (v: number) =>
                                            v > 0 ? (
                                                formatLKR(v)
                                            ) : (
                                                <Text type="secondary">—</Text>
                                            ),
                                    },
                                ]}
                            />
                        )}
                    </Card>
                </Col>
            </Row>

            <Row gutter={[16, 16]} style={{ marginTop: 16, marginBottom: 8 }}>
                <Col xs={24} xl={12}>
                    <Card title="Top selling products" data-testid="top-products">
                        {productsQuery.isLoading ? (
                            <Skeleton active paragraph={{ rows: 6 }} />
                        ) : (productsQuery.data?.length ?? 0) === 0 ? (
                            <Empty description="No products sold in this period" />
                        ) : (
                            <Table<TopProduct>
                                columns={productColumns}
                                dataSource={productsQuery.data}
                                rowKey="product_id"
                                size="small"
                                pagination={false}
                            />
                        )}
                    </Card>
                </Col>
                <Col xs={24} xl={12}>
                    <Card title="Top customers" data-testid="top-customers">
                        {customersQuery.isLoading ? (
                            <Skeleton active paragraph={{ rows: 6 }} />
                        ) : (customersQuery.data?.length ?? 0) === 0 ? (
                            <Empty description="No customers ordered in this period" />
                        ) : (
                            <Table<TopCustomer>
                                columns={customerColumns}
                                dataSource={customersQuery.data}
                                rowKey="user_id"
                                size="small"
                                pagination={false}
                            />
                        )}
                    </Card>
                </Col>
            </Row>
            {/* Dedicated Printable Executive PDF Report Preview Modal */}
            <Modal
                title={
                    <Space>
                        <FilePdfOutlined style={{ color: '#ff4d4f' }} />
                        <span>Executive Analytics PDF Report Preview</span>
                    </Space>
                }
                open={pdfModalOpen}
                onCancel={() => setPdfModalOpen(false)}
                width={900}
                centered
                footer={[
                    <Button key="close" onClick={() => setPdfModalOpen(false)}>
                        Close
                    </Button>,
                    <Button
                        key="print"
                        type="primary"
                        icon={<PrinterOutlined />}
                        onClick={() => window.print()}
                    >
                        Print / Save as PDF
                    </Button>,
                ]}
            >
                <div
                    className="printable-pdf-document"
                    style={{
                        background: '#ffffff',
                        padding: '32px',
                        borderRadius: '4px',
                        border: '1px solid #cbd5e1',
                        fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
                        color: '#0f172a',
                        maxWidth: '840px',
                        margin: '0 auto',
                    }}
                >
                    {/* Official Corporate Header */}
                    <div
                        style={{
                            background: '#0f172a',
                            color: '#ffffff',
                            padding: '24px 28px',
                            borderRadius: '6px',
                            marginBottom: '24px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                        }}
                    >
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                <span style={{ background: '#f59e0b', color: '#0f172a', fontWeight: 800, fontSize: '12px', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    SRIBEES ONLINE
                                </span>
                                <span style={{ color: '#94a3b8', fontSize: '12px' }}>| OFFICIAL REPORT</span>
                            </div>
                            <h1 style={{ margin: 0, color: '#ffffff', fontSize: '22px', fontWeight: 700, letterSpacing: '-0.3px' }}>
                                Executive Analytics &amp; Reports Summary
                            </h1>
                            <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '4px' }}>
                                Period: {days} Days ({summary ? `${dayjs(summary.range.start_date).format('MMM D, YYYY')} – ${dayjs(summary.range.end_date).format('MMM D, YYYY')}` : ''})
                            </div>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '11px', color: '#94a3b8', lineHeight: 1.6, borderLeft: '1px solid #334155', paddingLeft: '16px' }}>
                            <div><strong>Scope:</strong> <span style={{ color: '#f8fafc' }}>{branchId ? (branchesQuery.data?.branches.find(b => b.branch_id === branchId)?.name || 'Branch Filtered') : 'All Network Branches'}</span></div>
                            <div><strong>Generated By:</strong> <span style={{ color: '#f8fafc' }}>{user?.full_name || 'System Administrator'}</span></div>
                            <div><strong>Generated At:</strong> <span style={{ color: '#f8fafc' }}>{dayjs().format('YYYY-MM-DD HH:mm')}</span></div>
                            <div style={{ marginTop: '4px' }}>
                                <span style={{ background: '#334155', color: '#f1f5f9', padding: '1px 6px', borderRadius: '3px', fontWeight: 600 }}>CONFIDENTIAL</span>
                            </div>
                        </div>
                    </div>

                    {/* Section 1: Executive KPI Metrics */}
                    <div className="pdf-section" style={{ marginBottom: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '2px solid #0f172a', paddingBottom: '6px', marginBottom: '14px' }}>
                            <span style={{ background: '#0f172a', color: '#fff', width: '20px', height: '20px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>1</span>
                            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '15px', fontWeight: 700 }}>
                                Key Performance Indicators (KPIs)
                            </h3>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '12px' }}>
                            <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '6px', border: '1px solid #e2e8f0', borderLeft: '4px solid #2563eb' }}>
                                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Total Revenue</div>
                                <div style={{ fontSize: '18px', fontWeight: 700, color: '#1e3a8a', marginTop: '2px' }}>{formatLKR(current?.revenue)}</div>
                                <div style={{ fontSize: '10px', color: summary?.deltas.revenue && summary.deltas.revenue > 0 ? '#16a34a' : '#dc2626', marginTop: '2px', fontWeight: 600 }}>
                                    {summary?.deltas.revenue !== undefined && summary.deltas.revenue !== null ? `${summary.deltas.revenue > 0 ? '+' : ''}${summary.deltas.revenue.toFixed(1)}% vs previous period` : 'Baseline'}
                                </div>
                            </div>
                            <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '6px', border: '1px solid #e2e8f0', borderLeft: '4px solid #16a34a' }}>
                                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Total Orders</div>
                                <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>{formatNumber(current?.orders)}</div>
                                <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>
                                    {formatNumber(current?.paid_orders)} paid orders
                                </div>
                            </div>
                            <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '6px', border: '1px solid #e2e8f0', borderLeft: '4px solid #9333ea' }}>
                                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Avg Order Value</div>
                                <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>{formatLKR(current?.avg_order_value)}</div>
                                <div style={{ fontSize: '10px', color: summary?.deltas.avg_order_value && summary.deltas.avg_order_value > 0 ? '#16a34a' : '#dc2626', marginTop: '2px', fontWeight: 600 }}>
                                    {summary?.deltas.avg_order_value !== undefined && summary.deltas.avg_order_value !== null ? `${summary.deltas.avg_order_value > 0 ? '+' : ''}${summary.deltas.avg_order_value.toFixed(1)}% vs previous` : 'Baseline'}
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                            <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '6px', border: '1px solid #e2e8f0', borderLeft: '4px solid #d97706' }}>
                                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Active Customers</div>
                                <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>{formatNumber(current?.customers)}</div>
                                <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>
                                    {formatNumber(summary?.new_customers)} first-time ordering customers
                                </div>
                            </div>
                            <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '6px', border: '1px solid #e2e8f0', borderLeft: '4px solid #0891b2' }}>
                                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase' }}>Total Items Sold</div>
                                <div style={{ fontSize: '18px', fontWeight: 700, color: '#0f172a', marginTop: '2px' }}>{formatNumber(current?.items_sold)}</div>
                                <div style={{ fontSize: '10px', color: '#475569', marginTop: '2px' }}>
                                    Units across paid order lines
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Section 2: Order Fulfilment Breakdown */}
                    <div className="pdf-section" style={{ marginBottom: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '2px solid #0f172a', paddingBottom: '6px', marginBottom: '14px' }}>
                            <span style={{ background: '#0f172a', color: '#fff', width: '20px', height: '20px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>2</span>
                            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '15px', fontWeight: 700 }}>
                                Order Fulfilment &amp; Status Breakdown
                            </h3>
                        </div>
                        <table className="pdf-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                                <tr style={{ background: '#0f172a', color: '#ffffff', textAlign: 'left' }}>
                                    <th style={{ padding: '8px 12px', borderRadius: '4px 0 0 0' }}>Order Status</th>
                                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Orders Count</th>
                                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Share (%)</th>
                                    <th style={{ padding: '8px 12px', textAlign: 'right', borderRadius: '0 4px 0 0' }}>Total Revenue</th>
                                </tr>
                            </thead>
                            <tbody>
                                {statusRows.map((row, idx) => (
                                    <tr key={row.status} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{titleCase(row.status)}</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatNumber(row.orders)}</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{statusTotal ? ((row.orders / statusTotal) * 100).toFixed(1) + '%' : '0%'}</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{formatLKR(row.revenue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Section 3: Revenue by Category */}
                    <div className="pdf-section" style={{ marginBottom: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '2px solid #0f172a', paddingBottom: '6px', marginBottom: '14px' }}>
                            <span style={{ background: '#0f172a', color: '#fff', width: '20px', height: '20px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>3</span>
                            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '15px', fontWeight: 700 }}>
                                Product Category Performance Summary
                            </h3>
                        </div>
                        <table className="pdf-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                                <tr style={{ background: '#0f172a', color: '#ffffff', textAlign: 'left' }}>
                                    <th style={{ padding: '8px 12px', borderRadius: '4px 0 0 0' }}>Category Name</th>
                                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Units Sold</th>
                                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Market Share</th>
                                    <th style={{ padding: '8px 12px', textAlign: 'right', borderRadius: '0 4px 0 0' }}>Total Revenue</th>
                                </tr>
                            </thead>
                            <tbody>
                                {categorySlices.map((cat, idx) => (
                                    <tr key={cat.category_id} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{cat.name}</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatNumber(cat.units_sold)}</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{cat.share}%</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{formatLKR(cat.revenue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Section 4: Top Products */}
                    <div className="pdf-section" style={{ marginBottom: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '2px solid #0f172a', paddingBottom: '6px', marginBottom: '14px' }}>
                            <span style={{ background: '#0f172a', color: '#fff', width: '20px', height: '20px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>4</span>
                            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '15px', fontWeight: 700 }}>
                                Top Performing Products
                            </h3>
                        </div>
                        <table className="pdf-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                                <tr style={{ background: '#0f172a', color: '#ffffff', textAlign: 'left' }}>
                                    <th style={{ padding: '8px 12px', width: '30px', borderRadius: '4px 0 0 0' }}>#</th>
                                    <th style={{ padding: '8px 12px' }}>Product Name</th>
                                    <th style={{ padding: '8px 12px' }}>Category</th>
                                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Units Sold</th>
                                    <th style={{ padding: '8px 12px', textAlign: 'right', borderRadius: '0 4px 0 0' }}>Total Revenue</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(productsQuery.data || []).slice(0, 5).map((p, idx) => (
                                    <tr key={p.product_id} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{p.name}</td>
                                        <td style={{ padding: '8px 12px', color: '#64748b' }}>{p.category || '—'}</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatNumber(p.units_sold)}</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{formatLKR(p.revenue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Section 5: Top Customers */}
                    <div className="pdf-section" style={{ marginBottom: '24px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '2px solid #0f172a', paddingBottom: '6px', marginBottom: '14px' }}>
                            <span style={{ background: '#0f172a', color: '#fff', width: '20px', height: '20px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: 700 }}>5</span>
                            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '15px', fontWeight: 700 }}>
                                Top Value Customers
                            </h3>
                        </div>
                        <table className="pdf-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                            <thead>
                                <tr style={{ background: '#0f172a', color: '#ffffff', textAlign: 'left' }}>
                                    <th style={{ padding: '8px 12px', width: '30px', borderRadius: '4px 0 0 0' }}>#</th>
                                    <th style={{ padding: '8px 12px' }}>Customer Name</th>
                                    <th style={{ padding: '8px 12px' }}>Contact Info</th>
                                    <th style={{ padding: '8px 12px', textAlign: 'right' }}>Orders</th>
                                    <th style={{ padding: '8px 12px', textAlign: 'right', borderRadius: '0 4px 0 0' }}>Total Spent</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(customersQuery.data || []).slice(0, 5).map((c, idx) => (
                                    <tr key={c.user_id} style={{ background: idx % 2 === 0 ? '#ffffff' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{ padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                                        <td style={{ padding: '8px 12px', fontWeight: 600 }}>{c.full_name}</td>
                                        <td style={{ padding: '8px 12px', color: '#64748b' }}>{c.email || c.phone || '—'}</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right' }}>{formatNumber(c.orders)}</td>
                                        <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700 }}>{formatLKR(c.revenue)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Authorization & Verification Block */}
                    <div className="pdf-section" style={{ marginTop: '32px', paddingTop: '20px', borderTop: '2px dashed #cbd5e1' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '32px' }}>
                            <div>
                                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: '32px' }}>
                                    PREPARED BY
                                </div>
                                <div style={{ borderBottom: '1px solid #94a3b8', width: '80%', marginBottom: '4px' }}></div>
                                <div style={{ fontSize: '12px', fontWeight: 600 }}>{user?.full_name || 'System Administrator'}</div>
                                <div style={{ fontSize: '10px', color: '#64748b' }}>SRIBEES Online Management System</div>
                            </div>
                            <div>
                                <div style={{ fontSize: '11px', color: '#64748b', fontWeight: 600, textTransform: 'uppercase', marginBottom: '32px' }}>
                                    APPROVED BY (FINANCE / EXECUTIVE DIRECTOR)
                                </div>
                                <div style={{ borderBottom: '1px solid #94a3b8', width: '80%', marginBottom: '4px' }}></div>
                                <div style={{ fontSize: '12px', fontWeight: 600 }}>Signature &amp; Corporate Stamp</div>
                                <div style={{ fontSize: '10px', color: '#64748b' }}>Date: ____ / ____ / ________</div>
                            </div>
                        </div>
                    </div>

                    {/* Document Footer */}
                    <div style={{ marginTop: '24px', paddingTop: '12px', borderTop: '1px solid #e2e8f0', textAlign: 'center', fontSize: '10px', color: '#94a3b8' }}>
                        STRICTLY CONFIDENTIAL — SRIBEESonline Internal Executive &amp; Management Financial Performance Document
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default Analytics;
