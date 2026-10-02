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
import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
    Alert,
    App,
    Badge,
    Button,
    Card,
    DatePicker,
    Select,
    Space,
    Table,
    Tabs,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import {
    ClockCircleOutlined,
    ExportOutlined,
    EyeOutlined,
    FileExcelOutlined,
    PrinterOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ordersApi, ORDER_TABS, sumCounts } from '../../api/orders.api';
import type { OrderEscalation, OrderListItem, OrderStatus } from '../../api/orders.api';
import { transfersApi } from '../../api/transfers.api';
import { usePermissions } from '../../hooks/usePermissions';
import { statusTag } from './OrderDetails';
import { DebouncedSearchInput } from '../../components/common/DebouncedSearchInput';
import { slt } from '../../utils/datetime';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const rangePresets: { label: string; value: [dayjs.Dayjs, dayjs.Dayjs] }[] = [
    { label: 'Today', value: [slt().startOf('day'), slt().endOf('day')] },
    { label: 'Yesterday', value: [slt().subtract(1, 'day').startOf('day'), slt().subtract(1, 'day').endOf('day')] },
    { label: 'Last 7 Days', value: [slt().subtract(7, 'day').startOf('day'), slt().endOf('day')] },
    { label: 'Last 30 Days', value: [slt().subtract(30, 'day').startOf('day'), slt().endOf('day')] },
    { label: 'This Month', value: [slt().startOf('month'), slt().endOf('month')] },
    { label: 'Last Month', value: [slt().subtract(1, 'month').startOf('month'), slt().subtract(1, 'month').endOf('month')] },
];

const ESC_CATEGORY_META: Record<string, { label: string; color: string }> = {
    cancel_request: { label: 'Urgent Cancellation', color: 'red' },
    address_correction: { label: 'Address Correction', color: 'orange' },
    hold_shipment: { label: 'Hold Shipment', color: 'volcano' },
    customer_complaint: { label: 'Customer Complaint', color: 'magenta' },
    other: { label: 'General Escalation', color: 'default' },
};

const formatLKR = (value: number): string =>
    new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(value ?? 0);

const OrderList: React.FC = () => {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const { message } = App.useApp();
    const { isSuperAdmin, isSupport, isBranchManager } = usePermissions();
    const isNetworkWide = isSuperAdmin || isSupport;

    const initialTab = searchParams.get('tab') || 'all';
    const initialPill = searchParams.get('pill') || undefined;

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [search, setSearch] = useState('');
    const [tabKey, setTabKey] = useState(initialTab);
    const [pillKey, setPillKey] = useState<string | undefined>(initialPill);
    const [branchId, setBranchId] = useState<string | undefined>(undefined);
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

    useEffect(() => {
        const urlTab = searchParams.get('tab') || 'all';
        const urlPill = searchParams.get('pill') || undefined;
        if (urlTab !== tabKey) setTabKey(urlTab);
        if (urlPill !== pillKey) setPillKey(urlPill);
    }, [searchParams]);

    // Escalations state
    const [escalationBox, setEscalationBox] = useState<'inbox' | 'outbox' | 'resolved'>('inbox');
    const [escalationPill, setEscalationPill] = useState<string | undefined>(undefined);

    const openOrder = (orderId: string) => {
        navigate(`/orders/${orderId}`);
    };

    const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
    const [exportingCsv, setExportingCsv] = useState(false);
    const [exportingPdf, setExportingPdf] = useState(false);

    const fromDate = dateRange?.[0] ? dateRange[0].format('YYYY-MM-DD') : undefined;
    const toDate = dateRange?.[1] ? dateRange[1].format('YYYY-MM-DD') : undefined;

    const activeTab = ORDER_TABS.find((t) => t.key === tabKey) ?? ORDER_TABS[0];
    const activePill = activeTab.subPills?.find((p) => p.key === pillKey);
    const filterStatuses: OrderStatus[] = activePill?.statuses ?? activeTab.statuses ?? [];
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
        enabled: tabKey !== 'escalations',
    });

    const forRole = isSupport ? 'customer_support' : (isBranchManager ? 'branch_manager' : undefined);

    // Global escalation badge count (unread/open)
    const { data: escalationBadgeData } = useQuery({
        queryKey: ['admin', 'orders', 'escalationsBadge', { branchId, forRole }],
        queryFn: () =>
            ordersApi.listEscalationQueue({
                box: 'inbox',
                for_role: forRole,
                limit: 1,
            }),
        refetchInterval: 30000,
    });

    // Escalations table data
    const { data: escalationQueueData, isLoading: escalationsLoading } = useQuery({
        queryKey: ['admin', 'orders', 'escalationsQueue', { escalationBox, escalationPill, branchId, forRole }],
        queryFn: () =>
            ordersApi.listEscalationQueue({
                box: escalationBox,
                status: escalationBox === 'inbox' || escalationBox === 'outbox' ? (escalationPill || undefined) : undefined,
                for_role: forRole,
                limit: 100,
            }),
        enabled: tabKey === 'escalations',
        refetchInterval: 15000,
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
        setSearchParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                if (nextTab === 'all') next.delete('tab');
                else next.set('tab', nextTab);
                if (!nextPill) next.delete('pill');
                else next.set('pill', nextPill);
                return next;
            },
            { replace: true },
        );
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
                    ? `orders_export_${slt().format('YYYYMMDD_HHmmss')}.csv`
                    : `dispatch_manifest_${slt().format('YYYYMMDD_HHmmss')}.pdf`;
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
            width: 175,
            render: (num: string, record) => (
                <a
                    onClick={() => openOrder(record.order_id)}
                    style={{
                        fontWeight: 600,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        fontSize: 13,
                        whiteSpace: 'nowrap',
                    }}
                >
                    {num}
                </a>
            ),
        },
        {
            title: 'Customer',
            key: 'customer',
            width: 220,
            render: (_, record) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden' }}>
                    <Text
                        strong
                        style={{ fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                        title={record.customer_name || undefined}
                    >
                        {record.customer_name || '—'}
                    </Text>
                    {record.customer_email && (
                        <Text
                            type="secondary"
                            style={{ fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                            title={record.customer_email}
                        >
                            {record.customer_email}
                        </Text>
                    )}
                </div>
            ),
        },
        ...(showBranchColumn
            ? [
                  {
                      title: 'Branch',
                      dataIndex: 'branch_name',
                      key: 'branch_name',
                      width: 140,
                      render: (name: string | null) => (
                          <span style={{ whiteSpace: 'nowrap' }}>
                              {name ? name : <Text type="secondary">Unassigned</Text>}
                          </span>
                      ),
                  } as ColumnsType<OrderListItem>[number],
              ]
            : []),
        {
            title: 'Date',
            dataIndex: 'created_at',
            key: 'created_at',
            width: 120,
            render: (d: string | null) => (
                <span style={{ whiteSpace: 'nowrap', fontSize: 13, color: '#434343' }}>
                    {d ? slt(d).format('MMM DD, YYYY') : '—'}
                </span>
            ),
        },
        {
            title: 'Items',
            dataIndex: 'item_count',
            key: 'item_count',
            width: 75,
            align: 'center',
            render: (count: number) => <Tag style={{ margin: 0, fontWeight: 500 }}>{count}</Tag>,
        },
        {
            title: 'Total',
            dataIndex: 'total_amount',
            key: 'total_amount',
            width: 130,
            align: 'right',
            render: (v: number) => (
                <Text strong style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                    {formatLKR(v)}
                </Text>
            ),
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 130,
            align: 'center',
            render: (s: OrderStatus) => <div style={{ whiteSpace: 'nowrap' }}>{statusTag(s)}</div>,
        },
        {
            title: 'Parcel',
            key: 'parcel',
            width: 140,
            render: (_, record) => {
                if (record.courier_booking_status === 'failed' && !record.courier_waybill) {
                    return <Tag color="red" style={{ margin: 0 }}>Not booked</Tag>;
                }
                if (!record.courier_waybill) {
                    return <Text type="secondary">—</Text>;
                }
                return (
                    <Space direction="vertical" size={0} style={{ whiteSpace: 'nowrap' }}>
                        <Text style={{ fontSize: 12, fontFamily: 'monospace' }}>{record.courier_waybill}</Text>
                        {record.courier_tracking_status && (
                            <Text type="secondary" style={{ fontSize: 11, textTransform: 'capitalize' }}>
                                {record.courier_tracking_status.replace(/_/g, ' ')}
                            </Text>
                        )}
                    </Space>
                );
            },
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 90,
            align: 'center',
            render: (_, record) => (
                <Button type="link" size="small" icon={<EyeOutlined />} onClick={() => openOrder(record.order_id)}>
                    View
                </Button>
            ),
        },
    ];

    const escalationColumns: ColumnsType<OrderEscalation> = [
        {
            title: 'Order Ref',
            dataIndex: 'order_number',
            key: 'order_number',
            width: 165,
            render: (num: string, record) => (
                <a
                    onClick={() => navigate(`/orders/${record.order_id}#escalation-center`)}
                    style={{
                        fontWeight: 600,
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        fontSize: 13,
                        color: '#2563eb',
                        whiteSpace: 'nowrap',
                    }}
                >
                    {num || 'Order Details'}
                </a>
            ),
        },
        {
            title: 'Category',
            dataIndex: 'category',
            key: 'category',
            width: 170,
            render: (cat: string) => {
                const meta = ESC_CATEGORY_META[cat] || { label: cat, color: 'default' };
                return <Tag color={meta.color} style={{ fontWeight: 500 }}>{meta.label}</Tag>;
            },
        },
        {
            title: 'Branch & Raised By',
            key: 'branch_raised',
            width: 200,
            render: (_, record) => (
                <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {record.branch_name || 'Assigned Branch'}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        by {record.raised_by_name} ({record.raised_by_role || 'Staff'})
                    </Text>
                </div>
            ),
        },
        {
            title: 'Message / Response Note',
            key: 'message_note',
            ellipsis: true,
            render: (_, record) => {
                if (record.resolution_note) {
                    return (
                        <Tooltip title={`BM Response: ${record.resolution_note}`}>
                            <div>
                                <Tag color="green" style={{ marginRight: 6, fontWeight: 600 }}>BM Reply</Tag>
                                <Text style={{ fontSize: 13, color: '#065f46' }}>{record.resolution_note}</Text>
                            </div>
                        </Tooltip>
                    );
                }
                return (
                    <Tooltip title={record.message}>
                        <Text style={{ fontSize: 13 }}>{record.message}</Text>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 120,
            align: 'center',
            render: (st: string) => {
                const isResolved = st === 'resolved';
                const isAck = st === 'acknowledged';
                const tagColor = isResolved ? 'green' : isAck ? 'orange' : 'red';
                return (
                    <Tag color={tagColor} style={{ textTransform: 'capitalize', fontWeight: 600 }}>
                        {st}
                    </Tag>
                );
            },
        },
        {
            title: 'Raised At',
            dataIndex: 'created_at',
            key: 'created_at',
            width: 160,
            render: (d: string | null) => (
                <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                    <ClockCircleOutlined style={{ marginRight: 4 }} />
                    {d ? slt(d).format('MMM DD, YYYY hh:mm A') : '—'}
                </Text>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 120,
            align: 'center',
            render: (_, record) => (
                <Button
                    type="primary"
                    size="small"
                    danger={record.status === 'open'}
                    icon={<ExportOutlined />}
                    onClick={() => navigate(`/orders/${record.order_id}#escalation-center`)}
                >
                    View Ticket
                </Button>
            ),
        },
    ];

    const tabItems = [
        ...ORDER_TABS.map((t) => {
            const isReturnsTab = t.key === 'returns';
            const badgeCount = sumCounts(counts, t.badgeStatuses ?? t.statuses);
            const hasPendingAction = isReturnsTab && badgeCount > 0;

            return {
                key: t.key,
                label: (
                    <span>
                        {t.label}{' '}
                        <Badge
                            count={badgeCount}
                            showZero={!isReturnsTab}
                            overflowCount={9999}
                            style={{
                                backgroundColor: hasPendingAction
                                    ? '#ff4d4f'
                                    : t.key === tabKey
                                    ? '#1677ff'
                                    : '#bfbfbf',
                            }}
                        />
                    </span>
                ),
            };
        }),
        {
            key: 'escalations',
            label: (
                <span>
                    Escalations{' '}
                    <Badge
                        count={escalationBadgeData?.open_count ?? 0}
                        showZero={false}
                        overflowCount={99}
                        style={{ backgroundColor: tabKey === 'escalations' ? '#1677ff' : '#ff4d4f' }}
                    />
                </span>
            ),
        },
    ];

    const displayedEscalations = (escalationQueueData?.items ?? []).filter((esc) => {
        if (branchId && esc.branch_id !== branchId) return false;
        if (!search) return true;
        const q = search.toLowerCase();
        return (
            esc.order_number?.toLowerCase().includes(q) ||
            esc.message?.toLowerCase().includes(q) ||
            esc.resolution_note?.toLowerCase().includes(q) ||
            esc.raised_by_name?.toLowerCase().includes(q) ||
            esc.branch_name?.toLowerCase().includes(q) ||
            esc.category?.toLowerCase().includes(q)
        );
    });

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
                    tabBarStyle={{ marginBottom: 12 }}
                />

                {tabKey === 'escalations' ? (
                    <div>
                        {/* Escalation Sub-tabs: Inbox, Outbox, Resolved */}
                        <Tabs
                            activeKey={escalationBox}
                            onChange={(k) => {
                                setEscalationBox(k as 'inbox' | 'outbox' | 'resolved');
                                setEscalationPill(undefined);
                            }}
                            type="card"
                            tabBarStyle={{ marginBottom: 12 }}
                            items={[
                                {
                                    key: 'inbox',
                                    label: (
                                        <span>
                                            📥 Inbox / Received
                                        </span>
                                    ),
                                },
                                {
                                    key: 'outbox',
                                    label: <span>📤 Sent by Me / Outbox</span>,
                                },
                                {
                                    key: 'resolved',
                                    label: <span>✅ Resolved / Closed</span>,
                                },
                            ]}
                        />

                        {/* Sub-status pills for Inbox */}
                        {escalationBox === 'inbox' && (
                            <Space wrap size={8} style={{ marginBottom: 16 }}>
                                <Tag.CheckableTag checked={!escalationPill} onChange={() => setEscalationPill(undefined)}>
                                    All Received
                                </Tag.CheckableTag>
                                <Tag.CheckableTag
                                    checked={escalationPill === 'open'}
                                    onChange={() => setEscalationPill(escalationPill === 'open' ? undefined : 'open')}
                                >
                                    Open
                                </Tag.CheckableTag>
                                <Tag.CheckableTag
                                    checked={escalationPill === 'acknowledged'}
                                    onChange={() => setEscalationPill(escalationPill === 'acknowledged' ? undefined : 'acknowledged')}
                                >
                                    Acknowledged
                                </Tag.CheckableTag>
                            </Space>
                        )}

                        {/* Sub-status pills for Outbox */}
                        {escalationBox === 'outbox' && (
                            <Space wrap size={8} style={{ marginBottom: 16 }}>
                                <Tag.CheckableTag checked={!escalationPill} onChange={() => setEscalationPill(undefined)}>
                                    All Sent
                                </Tag.CheckableTag>
                                <Tag.CheckableTag
                                    checked={escalationPill === 'open'}
                                    onChange={() => setEscalationPill(escalationPill === 'open' ? undefined : 'open')}
                                >
                                    Open
                                </Tag.CheckableTag>
                                <Tag.CheckableTag
                                    checked={escalationPill === 'acknowledged'}
                                    onChange={() => setEscalationPill(escalationPill === 'acknowledged' ? undefined : 'acknowledged')}
                                >
                                    Acknowledged
                                </Tag.CheckableTag>
                                <Tag.CheckableTag
                                    checked={escalationPill === 'resolved'}
                                    onChange={() => setEscalationPill(escalationPill === 'resolved' ? undefined : 'resolved')}
                                >
                                    Resolved
                                </Tag.CheckableTag>
                            </Space>
                        )}

                        {/* Search & Branch filter */}
                        <Space wrap style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
                            <Space wrap>
                                <DebouncedSearchInput
                                    placeholder="Search tickets by order #, message, note…"
                                    value={search}
                                    onChange={(v) => setSearch(v)}
                                    style={{ width: 340 }}
                                />
                                {showBranchColumn && (
                                    <Select
                                        placeholder="All branches"
                                        style={{ width: 220 }}
                                        allowClear
                                        value={branchId}
                                        onChange={(v) => setBranchId(v)}
                                        options={branches.map((b) => ({ label: b.name, value: b.branch_id }))}
                                    />
                                )}
                            </Space>
                        </Space>

                        <Table
                            rowKey="escalation_id"
                            size="middle"
                            columns={escalationColumns}
                            dataSource={displayedEscalations}
                            loading={escalationsLoading}
                            scroll={{ x: 'max-content' }}
                            locale={{ emptyText: 'No escalation tickets found.' }}
                            pagination={{
                                pageSize: 10,
                                showSizeChanger: true,
                                showTotal: (t) => `Total ${t} tickets`,
                            }}
                        />
                    </div>
                ) : (
                    <div>
                        {/* Tier 2: sub-status pills for normal order tabs */}
                        {activeTab.subPills && activeTab.subPills.length > 0 && (
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
                                    placeholder="Search order #, customer, phone, email, waybill…"
                                    value={search}
                                    onChange={(v) => {
                                        setPage(1);
                                        setSearch(v);
                                    }}
                                    style={{ width: 340 }}
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
                            size="middle"
                            rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys) }}
                            columns={columns}
                            dataSource={data?.orders ?? []}
                            loading={isLoading}
                            scroll={{ x: 'max-content' }}
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
                    </div>
                )}
            </Card>
        </div>
    );
};

export default OrderList;

