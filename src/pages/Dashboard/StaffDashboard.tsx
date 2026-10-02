/**
 * Staff Dashboard — Enhanced Customer Support Command Center.
 *
 * Dedicated live operations hub for Customer Support Agents:
 * - 4 High-Priority Actionable KPI Metric Cards (Pending Returns, Branch Escalations, Mobile App Inquiries, Delivery Exceptions)
 * - Section 1: Customer Return Requests Queue (with 12h policy check, proof photos, and deep-link review)
 * - Section 2: Inter-Department Escalation Center (with category tags, branch info, and deep-link ticket view)
 * - Section 3: Direct Customer Mobile App Inquiries (with deep-link ticket auto-drawer)
 */
import React from 'react';
import {
    Card,
    Row,
    Col,
    Table,
    Tag,
    Space,
    Typography,
    Button,
    Image,
    Tooltip,
    Badge,
    Spin,
} from 'antd';
import {
    RollbackOutlined,
    AlertOutlined,
    CustomerServiceOutlined,
    WarningOutlined,
    ExportOutlined,
    PhoneOutlined,
    ClockCircleOutlined,
    ReloadOutlined,
    ShopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { ordersApi, type OrderListItem, type OrderEscalation } from '../../api/orders.api';
import { supportApi, type SupportTicketItem } from '../../api/support.api';
import { slt } from '../../utils/datetime';

const { Title, Text } = Typography;

const CATEGORY_COLORS: Record<string, string> = {
    general: 'blue',
    order: 'cyan',
    delivery: 'purple',
    app: 'geekblue',
};

const ESC_CATEGORY_META: Record<string, { label: string; color: string }> = {
    cancel_request: { label: 'Urgent Cancellation', color: 'red' },
    address_correction: { label: 'Address Correction', color: 'orange' },
    hold_shipment: { label: 'Hold Shipment', color: 'volcano' },
    customer_complaint: { label: 'Customer Complaint', color: 'magenta' },
    other: { label: 'General Escalation', color: 'default' },
};

const getReturnPolicyStatus = (deliveredAt?: string | null, returnRequestedAt?: string | null) => {
    if (!deliveredAt || !returnRequestedAt) {
        return { label: 'Within Policy (12h)', color: 'green' };
    }
    const del = new Date(deliveredAt).getTime();
    const req = new Date(returnRequestedAt).getTime();
    const diffHours = (req - del) / (1000 * 60 * 60);
    if (diffHours <= 12) {
        return {
            label: `Within Policy (${diffHours > 0 ? diffHours.toFixed(1) : '0'}h)`,
            color: 'green',
        };
    }
    return {
        label: `Outside 12h (${diffHours.toFixed(1)}h)`,
        color: 'volcano',
    };
};

const StaffDashboard: React.FC = () => {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const user = useAuthStore((state) => state.user);

    // 1. Pending Return Claims
    const {
        data: returnsData,
        isLoading: returnsLoading,
        isRefetching: returnsRefetching,
    } = useQuery({
        queryKey: ['admin', 'dashboard', 'returnsQueue'],
        queryFn: () => ordersApi.list({ order_status: 'return_requested', limit: 50 }),
        refetchInterval: 30000,
    });

    // 2. Branch Escalations (Inbox: tickets from BM/SuperAdmin or with BM responses)
    const {
        data: escalationsData,
        isLoading: escalationsLoading,
        isRefetching: escalationsRefetching,
    } = useQuery({
        queryKey: ['admin', 'dashboard', 'escalationsQueue', 'customer_support'],
        queryFn: () => ordersApi.listEscalationQueue({ for_role: 'customer_support', limit: 50 }),
        refetchInterval: 30000,
    });

    // 3. Mobile App Inquiries (Pending)
    const {
        data: ticketsData,
        isLoading: ticketsLoading,
        isRefetching: ticketsRefetching,
    } = useQuery({
        queryKey: ['admin', 'dashboard', 'supportTicketsQueue'],
        queryFn: () => supportApi.list({ status: 'pending', limit: 50 }),
        refetchInterval: 30000,
    });

    // 4. Delivery Exceptions (Failed deliveries & RTO)
    const {
        data: exceptionsData,
        isLoading: exceptionsLoading,
    } = useQuery({
        queryKey: ['admin', 'dashboard', 'deliveryExceptions'],
        queryFn: () => ordersApi.list({ order_statuses: 'delivery_failed,rto_initiated', limit: 1 }),
        refetchInterval: 30000,
    });

    const refreshAll = () => {
        queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    };

    const isGlobalRefreshing =
        returnsRefetching || escalationsRefetching || ticketsRefetching;

    const scrollToSection = (id: string) => {
        const el = document.getElementById(id);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    const greetingName = (() => {
        if (!user?.full_name) return 'Support Agent';
        return user.full_name.trim();
    })();

    // ── Table 1: Return Requests Columns ──────────────────────────────────────
    const returnColumns: ColumnsType<OrderListItem> = [
        {
            title: 'Order Number',
            key: 'order_number',
            width: 180,
            render: (_, row) => (
                <Space direction="vertical" size={2}>
                    <Text strong style={{ color: '#2563eb' }}>
                        {row.order_number}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                        {row.created_at ? slt(row.created_at).format('MMM DD, YYYY') : '—'}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Customer Details',
            key: 'customer',
            width: 180,
            render: (_, row) => (
                <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {row.customer_name || 'Anonymous Customer'}
                    </div>
                    {row.customer_phone && (
                        <div style={{ fontSize: 12, marginTop: 2 }}>
                            <a href={`tel:${row.customer_phone}`} style={{ color: '#059669' }}>
                                <PhoneOutlined style={{ marginRight: 4 }} />
                                {row.customer_phone}
                            </a>
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: 'Return Reason',
            key: 'return_reason',
            ellipsis: true,
            render: (_, row) => (
                <Text style={{ fontWeight: 500 }}>
                    {row.return_reason || 'Product quality / return request'}
                </Text>
            ),
        },
        {
            title: '12h Policy Check',
            key: 'policy',
            width: 160,
            render: (_, row) => {
                const policy = getReturnPolicyStatus(row.delivered_at, row.return_requested_at);
                return <Tag color={policy.color}>{policy.label}</Tag>;
            },
        },
        {
            title: 'Branch',
            dataIndex: 'branch_name',
            key: 'branch_name',
            width: 140,
            render: (branchName) => (
                <Tag icon={<ShopOutlined />} color="blue">
                    {branchName || 'Unassigned'}
                </Tag>
            ),
        },
        {
            title: 'Proof Photo',
            key: 'proof',
            width: 110,
            render: (_, row) => {
                if (row.return_images && row.return_images.length > 0) {
                    return (
                        <Image.PreviewGroup>
                            <Image
                                src={row.return_images[0]}
                                width={44}
                                height={44}
                                style={{ objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb' }}
                            />
                        </Image.PreviewGroup>
                    );
                }
                return <Text type="secondary" style={{ fontSize: 12 }}>No photo</Text>;
            },
        },
        {
            title: 'Action',
            key: 'action',
            width: 130,
            align: 'right',
            render: (_, row) => (
                <Button
                    size="small"
                    type="primary"
                    icon={<ExportOutlined />}
                    onClick={() => {
                        window.open(`/orders/${row.order_id}#return-claim-review`, '_blank', 'noopener,noreferrer');
                    }}
                    style={{ backgroundColor: '#f59e0b', borderColor: '#f59e0b' }}
                >
                    Review Claim
                </Button>
            ),
        },
    ];

    // ── Table 2: Escalations Columns ──────────────────────────────────────────
    const escalationColumns: ColumnsType<OrderEscalation> = [
        {
            title: 'Category',
            key: 'category',
            width: 170,
            render: (_, esc) => {
                const meta = ESC_CATEGORY_META[esc.category] || {
                    label: esc.category,
                    color: 'default',
                };
                return <Tag color={meta.color}>{meta.label}</Tag>;
            },
        },
        {
            title: 'Order Ref',
            key: 'order_number',
            width: 180,
            render: (_, esc) => (
                <Text strong style={{ color: '#2563eb' }}>
                    {esc.order_number || 'Order Details'}
                </Text>
            ),
        },
        {
            title: 'Branch & Raised By',
            key: 'branch',
            width: 190,
            render: (_, esc) => (
                <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {esc.branch_name || 'Assigned Branch'}
                    </div>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        by {esc.raised_by_name} ({esc.raised_by_role || 'Staff'})
                    </Text>
                </div>
            ),
        },
        {
            title: 'Message / BM Note',
            key: 'message_note',
            ellipsis: true,
            render: (_, esc) => {
                if (esc.resolution_note) {
                    return (
                        <Tooltip title={`BM Response: ${esc.resolution_note}`}>
                            <div>
                                <Tag color="green" style={{ marginRight: 6, fontWeight: 600 }}>BM Reply</Tag>
                                <Text style={{ fontSize: 13, color: '#065f46' }}>{esc.resolution_note}</Text>
                            </div>
                        </Tooltip>
                    );
                }
                return (
                    <Tooltip title={esc.message}>
                        <Text style={{ fontSize: 13 }}>{esc.message}</Text>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 110,
            render: (st, esc) => {
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
            width: 140,
            render: (d) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    <ClockCircleOutlined style={{ marginRight: 4 }} />
                    {d ? slt(d).format('MMM DD, hh:mm A') : '—'}
                </Text>
            ),
        },
        {
            title: 'Action',
            key: 'action',
            width: 120,
            align: 'right',
            render: (_, esc) => (
                <Button
                    size="small"
                    type="primary"
                    danger
                    icon={<ExportOutlined />}
                    onClick={() => {
                        window.open(`/orders/${esc.order_id}#escalation-center`, '_blank', 'noopener,noreferrer');
                    }}
                >
                    View Ticket
                </Button>
            ),
        },
    ];

    // ── Table 3: App Inquiries Columns ────────────────────────────────────────
    const ticketColumns: ColumnsType<SupportTicketItem> = [
        {
            title: 'Ticket #',
            dataIndex: 'ticket_number',
            key: 'ticket_number',
            width: 140,
            render: (num) => (
                <Text strong style={{ color: '#0284c7' }}>
                    {num}
                </Text>
            ),
        },
        {
            title: 'Customer Details',
            key: 'customer',
            width: 180,
            render: (_, ticket) => (
                <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {ticket.customer_name || 'Customer App User'}
                    </div>
                    {ticket.contact_phone && (
                        <div style={{ fontSize: 12, marginTop: 2 }}>
                            <a href={`tel:${ticket.contact_phone}`} style={{ color: '#059669' }}>
                                <PhoneOutlined style={{ marginRight: 4 }} />
                                {ticket.contact_phone}
                            </a>
                        </div>
                    )}
                </div>
            ),
        },
        {
            title: 'Category',
            dataIndex: 'category',
            key: 'category',
            width: 130,
            render: (cat) => (
                <Tag color={CATEGORY_COLORS[cat] || 'blue'} style={{ textTransform: 'capitalize' }}>
                    {cat || 'General'}
                </Tag>
            ),
        },
        {
            title: 'Message Preview',
            dataIndex: 'message',
            key: 'message',
            ellipsis: true,
            render: (msg) => (
                <Tooltip title={msg}>
                    <Text style={{ fontSize: 13 }}>{msg}</Text>
                </Tooltip>
            ),
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 100,
            render: (st) => <Tag color="gold">{st?.toUpperCase() || 'PENDING'}</Tag>,
        },
        {
            title: 'Submitted At',
            dataIndex: 'created_at',
            key: 'created_at',
            width: 140,
            render: (d) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    <ClockCircleOutlined style={{ marginRight: 4 }} />
                    {d ? slt(d).format('MMM DD, hh:mm A') : '—'}
                </Text>
            ),
        },
        {
            title: 'Action',
            key: 'action',
            width: 120,
            align: 'right',
            render: (_, ticket) => (
                <Button
                    size="small"
                    type="primary"
                    icon={<ExportOutlined />}
                    onClick={() => {
                        window.open(`/support-tickets?ticketId=${ticket.ticket_id}&status=pending`, '_blank', 'noopener,noreferrer');
                    }}
                    style={{ backgroundColor: '#0284c7', borderColor: '#0284c7' }}
                >
                    View Inquiry
                </Button>
            ),
        },
    ];

    const pendingReturnsCount = returnsData?.total ?? 0;
    const branchEscalationsCount = escalationsData?.open_count ?? escalationsData?.total ?? 0;
    const mobileInquiriesCount = ticketsData?.pending_count ?? ticketsData?.total ?? 0;
    const deliveryExceptionsCount = exceptionsData?.total ?? 0;

    return (
        <div style={{ padding: '0 0 40px 0' }}>
            {/* Header Hero */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginBottom: 24,
                }}
            >
                <div>
                    <Space align="center">
                        <Title level={3} style={{ margin: 0 }}>
                            Welcome, {greetingName}
                        </Title>
                        <Tag color="success" style={{ fontWeight: 600 }}>
                            🟢 LIVE SUPPORT QUEUE
                        </Tag>
                    </Space>
                    <div style={{ marginTop: 4 }}>
                        <Text type="secondary">
                            Customer Support Command Center — High priority return claims, branch escalations, and app inquiries.
                        </Text>
                    </div>
                </div>
                <Button
                    icon={<ReloadOutlined spin={isGlobalRefreshing} />}
                    onClick={refreshAll}
                >
                    Refresh Queues
                </Button>
            </div>

            {/* 4 Top Actionable KPI Metric Cards */}
            <Row gutter={[16, 16]} style={{ marginBottom: 28 }}>
                {/* KPI Card 1: Pending Returns */}
                <Col xs={24} sm={12} lg={6}>
                    <Card
                        hoverable
                        onClick={() => scrollToSection('return-requests-section')}
                        style={{
                            borderRadius: 12,
                            borderLeft: '5px solid #f59e0b',
                            backgroundColor: '#fffbeb',
                            cursor: 'pointer',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <Text type="secondary" style={{ fontSize: 13, fontWeight: 600, color: '#b45309' }}>
                                    Pending Returns
                                </Text>
                                <div style={{ fontSize: 30, fontWeight: 800, color: '#d97706', marginTop: 4 }}>
                                    {returnsLoading ? <Spin size="small" /> : pendingReturnsCount}
                                </div>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    Awaiting Claim Decision
                                </Text>
                            </div>
                            <div
                                style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 10,
                                    backgroundColor: '#fef3c7',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#d97706',
                                    fontSize: 22,
                                }}
                            >
                                <RollbackOutlined />
                            </div>
                        </div>
                    </Card>
                </Col>

                {/* KPI Card 2: Branch Escalations */}
                <Col xs={24} sm={12} lg={6}>
                    <Card
                        hoverable
                        onClick={() => scrollToSection('branch-escalations-section')}
                        style={{
                            borderRadius: 12,
                            borderLeft: '5px solid #ef4444',
                            backgroundColor: '#fef2f2',
                            cursor: 'pointer',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <Text type="secondary" style={{ fontSize: 13, fontWeight: 600, color: '#b91c1c' }}>
                                    Branch Escalations
                                </Text>
                                <div style={{ fontSize: 30, fontWeight: 800, color: '#dc2626', marginTop: 4 }}>
                                    {escalationsLoading ? <Spin size="small" /> : branchEscalationsCount}
                                </div>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    Urgent BM Tickets
                                </Text>
                            </div>
                            <div
                                style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 10,
                                    backgroundColor: '#fee2e2',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#dc2626',
                                    fontSize: 22,
                                }}
                            >
                                <AlertOutlined />
                            </div>
                        </div>
                    </Card>
                </Col>

                {/* KPI Card 3: Mobile App Inquiries */}
                <Col xs={24} sm={12} lg={6}>
                    <Card
                        hoverable
                        onClick={() => scrollToSection('app-inquiries-section')}
                        style={{
                            borderRadius: 12,
                            borderLeft: '5px solid #3b82f6',
                            backgroundColor: '#eff6ff',
                            cursor: 'pointer',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <Text type="secondary" style={{ fontSize: 13, fontWeight: 600, color: '#1d4ed8' }}>
                                    Mobile App Inquiries
                                </Text>
                                <div style={{ fontSize: 30, fontWeight: 800, color: '#2563eb', marginTop: 4 }}>
                                    {ticketsLoading ? <Spin size="small" /> : mobileInquiriesCount}
                                </div>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    Customer App Tickets
                                </Text>
                            </div>
                            <div
                                style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 10,
                                    backgroundColor: '#dbeafe',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#2563eb',
                                    fontSize: 22,
                                }}
                            >
                                <CustomerServiceOutlined />
                            </div>
                        </div>
                    </Card>
                </Col>

                {/* KPI Card 4: Delivery Exceptions */}
                <Col xs={24} sm={12} lg={6}>
                    <Card
                        hoverable
                        onClick={() => navigate('/orders?tab=exceptions')}
                        style={{
                            borderRadius: 12,
                            borderLeft: '5px solid #8b5cf6',
                            backgroundColor: '#f5f3ff',
                            cursor: 'pointer',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                                <Text type="secondary" style={{ fontSize: 13, fontWeight: 600, color: '#6d28d9' }}>
                                    Delivery Exceptions
                                </Text>
                                <div style={{ fontSize: 30, fontWeight: 800, color: '#7c3aed', marginTop: 4 }}>
                                    {exceptionsLoading ? <Spin size="small" /> : deliveryExceptionsCount}
                                </div>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    Failed / Returned Parcels
                                </Text>
                            </div>
                            <div
                                style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 10,
                                    backgroundColor: '#ede9fe',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#7c3aed',
                                    fontSize: 22,
                                }}
                            >
                                <WarningOutlined />
                            </div>
                        </div>
                    </Card>
                </Col>
            </Row>

            <Space direction="vertical" size={24} style={{ width: '100%' }}>
                {/* ── Section 1: Customer Return Requests Queue ────────────────────── */}
                <div id="return-requests-section">
                    <Card
                        title={
                            <Space>
                                <RollbackOutlined style={{ color: '#f59e0b' }} />
                                <span>Section 1: Customer Return Requests Queue</span>
                                <Badge count={pendingReturnsCount} style={{ backgroundColor: '#f59e0b' }} />
                            </Space>
                        }
                        extra={
                            <Button
                                size="small"
                                onClick={() => navigate('/orders?tab=returns-refunds&subTab=return-requested')}
                            >
                                View in Orders Page <ExportOutlined style={{ fontSize: 10 }} />
                            </Button>
                        }
                        style={{ borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                    >
                        <Table
                            columns={returnColumns}
                            dataSource={returnsData?.orders || []}
                            rowKey="order_id"
                            loading={returnsLoading}
                            pagination={{ pageSize: 5, showSizeChanger: false }}
                            locale={{ emptyText: 'No pending return claims at the moment 🎉' }}
                        />
                    </Card>
                </div>

                {/* ── Section 2: Inter-Department Escalation Center ────────────────── */}
                <div id="branch-escalations-section">
                    <Card
                        title={
                            <Space>
                                <AlertOutlined style={{ color: '#ef4444' }} />
                                <span>Section 2: Inter-Department Escalation Center</span>
                                <Badge count={branchEscalationsCount} style={{ backgroundColor: '#ef4444' }} />
                            </Space>
                        }
                        style={{ borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                    >
                        <Table
                            columns={escalationColumns}
                            dataSource={escalationsData?.items || []}
                            rowKey="escalation_id"
                            loading={escalationsLoading}
                            pagination={{ pageSize: 5, showSizeChanger: false }}
                            locale={{ emptyText: 'No active branch escalations waiting for support 👏' }}
                        />
                    </Card>
                </div>

                {/* ── Section 3: Direct Customer Mobile App Inquiries ─────────────── */}
                <div id="app-inquiries-section">
                    <Card
                        title={
                            <Space>
                                <CustomerServiceOutlined style={{ color: '#0284c7' }} />
                                <span>Section 3: Direct Customer Mobile App Inquiries</span>
                                <Badge count={mobileInquiriesCount} style={{ backgroundColor: '#0284c7' }} />
                            </Space>
                        }
                        extra={
                            <Button
                                size="small"
                                onClick={() => navigate('/support-tickets?status=pending')}
                            >
                                Open Support Tickets <ExportOutlined style={{ fontSize: 10 }} />
                            </Button>
                        }
                        style={{ borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}
                    >
                        <Table
                            columns={ticketColumns}
                            dataSource={ticketsData?.items || []}
                            rowKey="ticket_id"
                            loading={ticketsLoading}
                            pagination={{ pageSize: 5, showSizeChanger: false }}
                            locale={{ emptyText: 'No pending mobile app inquiries found 👍' }}
                        />
                    </Card>
                </div>
            </Space>
        </div>
    );
};

export default StaffDashboard;
