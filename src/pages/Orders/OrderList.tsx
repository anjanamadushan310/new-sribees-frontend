/**
 * Order Management (Module 7.3)
 * Branch-scoped order list with status + branch filters. Branch isolation
 * happens server-side: Branch Manager sees only their own branch; Super
 * Admin and Customer Support are unscoped (a support agent has to be able
 * to look up any customer's order, not just the branch they're listed
 * under) and get the branch column + filter to tell orders apart.
 * Row click / View opens the OrderDetails drawer. TanStack Query against
 * /api/v1/admin/orders.
 */
import React, { useState } from 'react';
import { Card, Table, Input, Select, Space, Button, Typography, App, Alert, DatePicker } from 'antd';
import { EyeOutlined, SearchOutlined, FileExcelOutlined, PrinterOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import {
    ordersApi,
    ORDER_STATUS_META,
    ORDER_STATUSES,
} from '../../api/orders.api';
import type { OrderListItem, OrderStatus } from '../../api/orders.api';
import { transfersApi } from '../../api/transfers.api';
import { usePermissions } from '../../hooks/usePermissions';
import OrderDetails, { statusTag } from './OrderDetails';

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
    const [statusFilter, setStatusFilter] = useState<OrderStatus | undefined>(undefined);
    const [branchId, setBranchId] = useState<string | undefined>(undefined);
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
    const [openOrderId, setOpenOrderId] = useState<string | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);

    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [exportingCsv, setExportingCsv] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);

    const fromDate = dateRange?.[0] ? dateRange[0].format('YYYY-MM-DD') : undefined;
    const toDate = dateRange?.[1] ? dateRange[1].format('YYYY-MM-DD') : undefined;

    const { data: branches = [] } = useQuery({
        queryKey: ['admin', 'transfers', 'branches'],
        queryFn: transfersApi.branches,
        enabled: isNetworkWide,
    });

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['admin', 'orders', { page, pageSize, search, statusFilter, branchId, fromDate, toDate }],
        queryFn: () =>
            ordersApi.list({
                page,
                limit: pageSize,
                search: search || undefined,
                order_status: statusFilter,
                branch_id: branchId,
                from_date: fromDate,
                to_date: toDate,
            }),
        placeholderData: keepPreviousData,
    });

    if (isError) {
        message.error((error as any)?.response?.data?.detail || 'Failed to load orders.');
    }

    const showBranchColumn = isNetworkWide;

    const openDrawer = (id: string) => {
        setOpenOrderId(id);
        setDrawerOpen(true);
    };

    const handleExportCSV = async (useSelection: boolean = false) => {
        try {
            setExportingCsv(true);
            const orderIds = useSelection ? (selectedRowKeys as string[]) : undefined;
            const blob = await ordersApi.exportCSV({
                order_status: statusFilter,
                search: search || undefined,
                branch_id: branchId,
                from_date: fromDate,
                to_date: toDate,
                order_ids: orderIds,
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `orders_export_${dayjs().format('YYYYMMDD_HHmmss')}.csv`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            message.success('CSV export downloaded successfully.');
        } catch (err: any) {
            message.error(err?.response?.data?.detail || 'Failed to export CSV.');
        } finally {
            setExportingCsv(false);
        }
    };

    const handleExportPDF = async (useSelection: boolean = false) => {
        try {
            setExportingPdf(true);
            const orderIds = useSelection ? (selectedRowKeys as string[]) : undefined;
            const blob = await ordersApi.exportPDF({
                order_status: statusFilter,
                search: search || undefined,
                branch_id: branchId,
                from_date: fromDate,
                to_date: toDate,
                order_ids: orderIds,
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `dispatch_manifest_${dayjs().format('YYYYMMDD_HHmmss')}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
            message.success('Dispatch Manifest PDF downloaded successfully.');
        } catch (err: any) {
            message.error(err?.response?.data?.detail || 'Failed to export Dispatch Manifest PDF.');
        } finally {
            setExportingPdf(false);
        }
    };

    const columns: ColumnsType<OrderListItem> = [
        {
            title: 'Order',
            dataIndex: 'order_number',
            key: 'order_number',
            render: (num: string, record) => (
                <a onClick={() => openDrawer(record.order_id)}>{num}</a>
            ),
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
        {
            title: 'Items',
            dataIndex: 'item_count',
            key: 'item_count',
            width: 70,
            align: 'right',
        },
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
            width: 140,
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

    return (
        <div>
            <Title level={3} style={{ marginTop: 0 }}>
                Orders
            </Title>

            <Card>
                <Space wrap style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
                    <Space wrap>
                        <Input.Search
                            placeholder="Search order # or customer…"
                            allowClear
                            enterButton={<SearchOutlined />}
                            style={{ width: 300 }}
                            onSearch={(value) => {
                                setPage(1);
                                setSearch(value);
                            }}
                        />
                        <Select
                            placeholder="All statuses"
                            style={{ width: 180 }}
                            allowClear
                            value={statusFilter}
                            onChange={(value) => {
                                setPage(1);
                                setStatusFilter(value);
                            }}
                            options={ORDER_STATUSES.map((s) => ({
                                label: ORDER_STATUS_META[s].label,
                                value: s,
                            }))}
                        />
                        {showBranchColumn && (
                            <Select
                                placeholder="All branches"
                                style={{ width: 220 }}
                                allowClear
                                value={branchId}
                                onChange={(value) => {
                                    setPage(1);
                                    setBranchId(value);
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
                        <Button
                            icon={<FileExcelOutlined />}
                            loading={exportingCsv}
                            onClick={() => handleExportCSV(false)}
                        >
                            Export CSV
                        </Button>
                        <Button
                            type="primary"
                            icon={<PrinterOutlined />}
                            loading={exportingPdf}
                            onClick={() => handleExportPDF(false)}
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
                                    <b>{selectedRowKeys.length}</b> {selectedRowKeys.length === 1 ? 'order' : 'orders'} selected
                                </span>
                                <Space wrap>
                                    <Button
                                        size="small"
                                        icon={<FileExcelOutlined />}
                                        loading={exportingCsv}
                                        onClick={() => handleExportCSV(true)}
                                    >
                                        Export Selected (CSV)
                                    </Button>
                                    <Button
                                        size="small"
                                        type="primary"
                                        icon={<PrinterOutlined />}
                                        loading={exportingPdf}
                                        onClick={() => handleExportPDF(true)}
                                    >
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
                    rowSelection={{
                        selectedRowKeys,
                        onChange: (keys) => setSelectedRowKeys(keys),
                    }}
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

            <OrderDetails
                orderId={openOrderId}
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
            />
        </div>
    );
};

export default OrderList;
