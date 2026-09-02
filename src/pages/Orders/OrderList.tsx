/**
 * Order Management (Module 7.3 / QA spec B2)
 *
 * Two-tier lifecycle filter:
 *   Tier 1 — main tabs (New / Warehouse / Logistics / Delivered / Returns /
 *            Exceptions) with badge counters.
 *   Tier 2 — sub-status pills for the active tab.
 * Row 3 — search, branch, date range, exports.
 *
 * Branch isolation is server-side (inject_branch_filter); the tab/pill counts
 * come from the same context-filtered `status_counts` map the list returns.
 */
import React, { useState } from 'react';
import { Alert, App, Badge, Button, Card, DatePicker, Select, Space, Table, Tabs, Tag, Typography } from 'antd';
import { EyeOutlined, FileExcelOutlined, PrinterOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ordersApi, ORDER_TABS, sumCounts } from '../../api/orders.api';
import type { OrderListItem, OrderStatus } from '../../api/orders.api';
import { transfersApi } from '../../api/transfers.api';
import { usePermissions } from '../../hooks/usePermissions';
import OrderDetails, { statusTag } from './OrderDetails';
import { DebouncedSearchInput } from '../../components/common/DebouncedSearchInput';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const rangePresets: { label: string; value: [dayjs.Dayjs, dayjs.Dayjs] }[] = [
    { label: 'Today', value: [dayjs().startOf('day'), dayjs().endOf('day')] },
    { label: 'Yesterday', value: [dayjs().subtract(1, 'day').startOf('day'), dayjs().subtract(1, 'day').endOf('day')] },
    { label: 'Last 7 Days', value: [dayjs().subtract(7, 'day').startOf('day'), dayjs().endOf('day')] },
    { label: 'Last 30 Days', value: [dayjs().subtract(30, 'day').startOf('day'), dayjs().endOf('day')] },
    { label: 'This Month', value: [dayjs().startOf('month'), dayjs().endOf('month')] },
    { label: 'Last Month', value: [dayjs().subtract(1, 'month').startOf('month'), dayjs().subtract(1, 'month').endOf('month')] },
];

const formatLKR = (value: number): string =>
    new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(value ?? 0);

const OrderList: React.FC = () => {
    const { message } = App.useApp();
    const { isSuperAdmin, isSupport } = usePermissions();
    const isNetworkWide = isSuperAdmin || isSupport;

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [search, setSearch] = useState('');
    const [tabKey, setTabKey] = useState('all');
    const [pillKey, setPillKey] = useState<string | undefined>(undefined);
    const [branchId, setBranchId] = useState<string | undefined>(undefined);
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
    const [openOrderId, setOpenOrderId] = useState<string | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);

    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [exportingCsv, setExportingCsv] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);

    const fromDate = dateRange?.[0] ? dateRange[0].format('YYYY-MM-DD') : undefined;
    const toDate = dateRange?.[1] ? dateRange[1].format('YYYY-MM-DD') : undefined;

    const activeTab = ORDER_TABS.find((t) => t.key === tabKey) ?? ORDER_TABS[0];
    const activePill = activeTab.subPills.find((p) => p.key === pillKey);
    const filterStatuses: OrderStatus[] = activePill?.statuses ?? activeTab.statuses;
    const orderStatusesParam = filterStatuses.length ? filterStatuses.join(',') : undefined;
    const statusFilterForExport = filterStatuses.length === 1 ? filterStatuses[0] : undefined;

    const { data: branches = [] } = useQuery({
        queryKey: ['admin', 'transfers', 'branches'],
        queryFn: transfersApi.branches,
        enabled: isNetworkWide,
    });

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['admin', 'orders', { page, pageSize, search, orderStatusesParam, branchId, fromDate, toDate }],
        queryFn: () =>
            ordersApi.list({
                page,
                limit: pageSize,
                search: search || undefined,
                order_statuses: orderStatusesParam,
                branch_id: branchId,
                from_date: fromDate,
                to_date: toDate,
            }),
        placeholderData: keepPreviousData,
    });

    if (isError) {
        message.error((error as any)?.response?.data?.detail || 'Failed to load orders.');
    }

    const counts = data?.statusCounts ?? {};
    const showBranchColumn = isNetworkWide;

    const resetTo = (nextTab: string, nextPill?: string) => {
        setTabKey(nextTab);
        setPillKey(nextPill);
        setPage(1);
        setSelectedRowKeys([]);
    };

    const openDrawer = (id: string) => {
        setOpenOrderId(id);
        setDrawerOpen(true);
    };

    const runExport = async (kind: 'csv' | 'pdf', useSelection: boolean) => {
        const set = kind === 'csv' ? setExportingCsv : setExportingPdf;
        try {
            set(true);
            const params = {
                order_status: statusFilterForExport,
                search: search || undefined,
                branch_id: branchId,
                from_date: fromDate,
                to_date: toDate,
                order_ids: useSelection ? (selectedRowKeys as string[]) : undefined,
            };
            const blob = kind === 'csv' ? await ordersApi.exportCSV(params) : await ordersApi.exportPDF(params);
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download =
                kind === 'csv'
                    ? `orders_export_${dayjs().format('YYYYMMDD_HHmmss')}.csv`
                    : `dispatch_manifest_${dayjs().format('YYYYMMDD_HHmmss')}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            message.success(kind === 'csv' ? 'CSV export downloaded.' : 'Dispatch Manifest PDF downloaded.');
        } catch (err: any) {
            message.error(err?.response?.data?.detail || `Failed to export ${kind.toUpperCase()}.`);
        } finally {
            set(false);
        }
    };

    const columns: ColumnsType<OrderListItem> = [
        {
            title: 'Order',
            dataIndex: 'order_number',
            key: 'order_number',
            render: (num: string, record) => <a onClick={() => openDrawer(record.order_id)}>{num}</a>,
        },
        {
            title: 'Customer',
            key: 'customer',
            render: (_, record) => (
                <Space direction="vertical" size={0}>
                    <Text>{record.customer_name || '—'}</Text>
                    {record.customer_email && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {record.customer_email}
                        </Text>
                    )}
                </Space>
            ),
        },
        ...(showBranchColumn
            ? [
                  {
                      title: 'Branch',
                      dataIndex: 'branch_name',
                      key: 'branch_name',
                      render: (name: string | null) =>
                          name ? <span>{name}</span> : <Text type="secondary">Unassigned</Text>,
                  } as ColumnsType<OrderListItem>[number],
              ]
            : []),
        {
            title: 'Date',
            dataIndex: 'created_at',
            key: 'created_at',
            render: (d: string | null) => (d ? dayjs(d).format('MMM DD, YYYY') : '—'),
        },
        { title: 'Items', dataIndex: 'item_count', key: 'item_count', width: 70, align: 'right' },
        {
            title: 'Total',
            dataIndex: 'total_amount',
            key: 'total_amount',
            align: 'right',
            render: (v: number) => <Text strong>{formatLKR(v)}</Text>,
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 150,
            render: (s: OrderStatus) => statusTag(s),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 100,
            render: (_, record) => (
                <Button type="link" icon={<EyeOutlined />} onClick={() => openDrawer(record.order_id)}>
                    View
                </Button>
            ),
        },
    ];

    const tabItems = ORDER_TABS.map((t) => ({
        key: t.key,
        label: (
            <span>
                {t.label}{' '}
                <Badge
                    count={sumCounts(counts, t.statuses)}
                    showZero
                    overflowCount={9999}
                    style={{ backgroundColor: t.key === tabKey ? '#1677ff' : '#bfbfbf' }}
                />
            </span>
        ),
    }));

    return (
        <div>
            <Title level={3} style={{ marginTop: 0 }}>
                Orders
            </Title>

            <Card>
                {/* Tier 1: main tabs */}
                <Tabs
                    activeKey={tabKey}
                    items={tabItems}
                    onChange={(k) => resetTo(k)}
                    tabBarStyle={{ marginBottom: 8 }}
                />

                {/* Tier 2: sub-status pills */}
                {activeTab.subPills.length > 0 && (
                    <Space wrap size={8} style={{ marginBottom: 16 }}>
                        <Tag.CheckableTag checked={!pillKey} onChange={() => resetTo(tabKey)}>
                            All ({sumCounts(counts, activeTab.statuses)})
                        </Tag.CheckableTag>
                        {activeTab.subPills.map((p) => (
                            <Tag.CheckableTag
                                key={p.key}
                                checked={pillKey === p.key}
                                onChange={() => resetTo(tabKey, pillKey === p.key ? undefined : p.key)}
                            >
                                {p.label} ({sumCounts(counts, p.statuses)})
                            </Tag.CheckableTag>
                        ))}
                    </Space>
                )}

                {/* Row 3: secondary filters + exports */}
                <Space wrap style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
                    <Space wrap>
                        <DebouncedSearchInput
                            placeholder="Search order #, customer, phone, email…"
                            value={search}
                            onChange={(v) => {
                                setPage(1);
                                setSearch(v);
                            }}
                            style={{ width: 320 }}
                        />
                        {showBranchColumn && (
                            <Select
                                placeholder="All branches"
                                style={{ width: 220 }}
                                allowClear
                                value={branchId}
                                onChange={(v) => {
                                    setPage(1);
                                    setBranchId(v);
                                }}
                                options={branches.map((b) => ({ label: b.name, value: b.branch_id }))}
                            />
                        )}
                        <RangePicker
                            presets={rangePresets}
                            value={dateRange}
                            onChange={(dates) => {
                                setPage(1);
                                setDateRange(dates as any);
                            }}
                            style={{ width: 280 }}
                            allowClear
                        />
                    </Space>

                    <Space wrap>
                        <Button icon={<FileExcelOutlined />} loading={exportingCsv} onClick={() => runExport('csv', false)}>
                            Export CSV
                        </Button>
                        <Button
                            type="primary"
                            icon={<PrinterOutlined />}
                            loading={exportingPdf}
                            onClick={() => runExport('pdf', false)}
                        >
                            Dispatch PDF
                        </Button>
                    </Space>
                </Space>

                {selectedRowKeys.length > 0 && (
                    <Alert
                        type="info"
                        showIcon
                        style={{ marginBottom: 16 }}
                        message={
                            <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                                <span>
                                    <b>{selectedRowKeys.length}</b>{' '}
                                    {selectedRowKeys.length === 1 ? 'order' : 'orders'} selected
                                </span>
                                <Space wrap>
                                    <Button size="small" icon={<FileExcelOutlined />} loading={exportingCsv} onClick={() => runExport('csv', true)}>
                                        Export Selected (CSV)
                                    </Button>
                                    <Button size="small" type="primary" icon={<PrinterOutlined />} loading={exportingPdf} onClick={() => runExport('pdf', true)}>
                                        Export Selected (PDF)
                                    </Button>
                                    <Button size="small" type="link" onClick={() => setSelectedRowKeys([])}>
                                        Clear Selection
                                    </Button>
                                </Space>
                            </Space>
                        }
                    />
                )}

                <Table
                    rowKey="order_id"
                    rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys) }}
                    columns={columns}
                    dataSource={data?.orders ?? []}
                    loading={isLoading}
                    locale={{ emptyText: isError ? 'Failed to load orders.' : 'No orders found.' }}
                    pagination={{
                        current: page,
                        pageSize,
                        total: data?.total ?? 0,
                        showSizeChanger: true,
                        showTotal: (t) => `Total ${t} orders`,
                        onChange: (nextPage, nextSize) => {
                            setPage(nextPage);
                            setPageSize(nextSize);
                        },
                    }}
                />
            </Card>

            <OrderDetails orderId={openOrderId} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        </div>
    );
};

export default OrderList;
