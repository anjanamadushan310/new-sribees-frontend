import React, { useState } from 'react';
import {
    Drawer,
    Typography,
    Space,
    Tag,
    Button,
    Card,
    Row,
    Col,
    Table,
    Avatar,
    Tooltip,
    DatePicker,
    Segmented,
    Descriptions,
    List,
    Empty,
    Image,
} from 'antd';
import {
    UserOutlined,
    PhoneOutlined,
    WhatsAppOutlined,
    MailOutlined,
    HomeOutlined,
    WarningOutlined,
    ExportOutlined,
    ShoppingOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    RollbackOutlined,
    CalendarOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useQuery } from '@tanstack/react-query';
import type { CustomerOrder, CustomerSegment } from '../../api/customers.api';
import { customersApi } from '../../api/customers.api';
import { slt } from '../../utils/datetime';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

const SEGMENT_META: Record<CustomerSegment, { label: string; color: string }> = {
    returning: { label: 'Returning Customer', color: 'green' },
    new: { label: 'New Customer', color: 'blue' },
    at_risk: { label: 'At Risk (30d+)', color: 'orange' },
};

const STATUS_COLOR_MAP: Record<string, string> = {
    delivered: 'green',
    completed: 'green',
    cancelled: 'red',
    return_requested: 'orange',
    return_approved: 'volcano',
    refunded: 'purple',
    rto_delivered: 'orange',
    rto_initiated: 'orange',
    delivery_failed: 'red',
    out_for_delivery: 'cyan',
    shipped: 'blue',
    ready_for_pickup: 'geekblue',
    packing: 'blue',
    packed: 'blue',
    confirmed: 'blue',
    pending: 'gold',
};

const formatLKR = (value: number): string =>
    new Intl.NumberFormat('en-LK', {
        style: 'currency',
        currency: 'LKR',
        maximumFractionDigits: 2,
    }).format(value ?? 0);

type StatusFilter = 'all' | 'delivered' | 'cancelled' | 'returned';
type DatePreset = 'all' | 'today' | 'last_7_days' | 'last_30_days' | 'custom';

interface CustomerProfileDrawerProps {
    customerId: string | null;
    visible: boolean;
    onClose: () => void;
    onSelectCustomer?: (customerId: string) => void;
}

export const CustomerProfileDrawer: React.FC<CustomerProfileDrawerProps> = ({
    customerId,
    visible,
    onClose,
    onSelectCustomer,
}) => {
    const [ordersPage, setOrdersPage] = useState(1);
    const [pageSize, setPageSize] = useState(8);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [datePreset, setDatePreset] = useState<DatePreset>('all');
    const [customDateRange, setCustomDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);

    // Profile query
    const { data: profile, isLoading: isProfileLoading } = useQuery({
        queryKey: ['customerProfile', customerId],
        queryFn: () => customersApi.getProfile(customerId!),
        enabled: !!customerId && visible,
    });

    // Compute active start & end dates for orders API
    const getDateRange = (): { start_date?: string; end_date?: string } => {
        const now = dayjs();
        if (datePreset === 'today') {
            return {
                start_date: now.startOf('day').toISOString(),
                end_date: now.endOf('day').toISOString(),
            };
        }
        if (datePreset === 'last_7_days') {
            return {
                start_date: now.subtract(7, 'day').startOf('day').toISOString(),
                end_date: now.endOf('day').toISOString(),
            };
        }
        if (datePreset === 'last_30_days') {
            return {
                start_date: now.subtract(30, 'day').startOf('day').toISOString(),
                end_date: now.endOf('day').toISOString(),
            };
        }
        if (datePreset === 'custom' && customDateRange && customDateRange[0] && customDateRange[1]) {
            return {
                start_date: customDateRange[0].startOf('day').toISOString(),
                end_date: customDateRange[1].endOf('day').toISOString(),
            };
        }
        return {};
    };

    const { start_date, end_date } = getDateRange();

    // Orders query with dynamic server-side filters & analytics
    const { data: ordersData, isLoading: isOrdersLoading } = useQuery({
        queryKey: ['customerOrders', customerId, ordersPage, pageSize, statusFilter, start_date, end_date],
        queryFn: () =>
            customersApi.getOrders(customerId!, {
                page: ordersPage,
                limit: pageSize,
                status: statusFilter,
                start_date,
                end_date,
            }),
        enabled: !!customerId && visible,
    });

    const analytics = ordersData?.analytics || {
        total_orders: profile?.stats?.total_orders ?? 0,
        delivered_count: 0,
        cancelled_count: 0,
        returned_count: 0,
        return_rate: 0,
        is_high_return_risk: false,
    };

    const cleanPhoneNumber = (phone: string | null | undefined): string => {
        if (!phone) return '';
        let cleaned = phone.replace(/\D/g, '');
        if (cleaned.startsWith('0')) {
            cleaned = '94' + cleaned.slice(1);
        } else if (!cleaned.startsWith('94')) {
            cleaned = '94' + cleaned;
        }
        return cleaned;
    };

    const handleCall = (phone: string | null | undefined) => {
        if (!phone) return;
        window.open(`tel:${phone}`, '_self');
    };

    const handleWhatsApp = (phone: string | null | undefined) => {
        if (!phone) return;
        const cleaned = cleanPhoneNumber(phone);
        window.open(`https://wa.me/${cleaned}`, '_blank');
    };

    const handleDatePresetChange = (preset: DatePreset) => {
        setDatePreset(preset);
        setOrdersPage(1);
        if (preset !== 'custom') {
            setCustomDateRange(null);
        }
    };

    const columns: ColumnsType<CustomerOrder> = [
        {
            title: 'Order No',
            key: 'order_number',
            width: 170,
            render: (_, record) => (
                <Space direction="vertical" size={2}>
                    <Button
                        type="link"
                        icon={<ExportOutlined />}
                        style={{ padding: 0, fontWeight: 600, fontSize: 13 }}
                        onClick={() => window.open(`/orders/${record.order_id}`, '_blank')}
                    >
                        #{record.order_number}
                    </Button>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                        {record.created_at ? slt(record.created_at).format('MMM DD, YYYY') : '—'}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Product Preview',
            key: 'product_preview',
            render: (_, record) => {
                const preview = record.items_preview;
                const hasItem = preview && preview.product_name && preview.product_name !== 'No items';
                const productName = hasItem ? preview.product_name : 'Order Items (Direct Order)';
                const productImage = hasItem ? preview.product_image : null;
                const quantity = hasItem ? (preview.quantity || 1) : 1;
                const extraCount = preview?.extra_items_count || 0;

                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {productImage ? (
                            <Image
                                src={productImage}
                                alt={productName}
                                width={44}
                                height={44}
                                style={{
                                    objectFit: 'cover',
                                    borderRadius: 6,
                                    border: '1px solid #f0f0f0',
                                }}
                                fallback="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='44' height='44' fill='%23eee'><rect width='44' height='44'/></svg>"
                            />
                        ) : (
                            <div
                                style={{
                                    width: 44,
                                    height: 44,
                                    borderRadius: 6,
                                    background: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#94a3b8',
                                    fontSize: 18,
                                    flexShrink: 0,
                                }}
                            >
                                <ShoppingOutlined />
                            </div>
                        )}
                        <div style={{ maxWidth: 260, minWidth: 140 }}>
                            <Text
                                strong
                                style={{
                                    fontSize: 13,
                                    display: 'block',
                                    lineHeight: 1.3,
                                    color: hasItem ? '#1e293b' : '#64748b',
                                }}
                                ellipsis={{ tooltip: productName }}
                            >
                                {productName}
                            </Text>
                            <Space size={6} style={{ marginTop: 2 }}>
                                <Text type="secondary" style={{ fontSize: 11 }}>
                                    Qty: {quantity}
                                </Text>
                                {extraCount > 0 && (
                                    <Tag
                                        color="blue"
                                        style={{
                                            fontSize: 10,
                                            lineHeight: '16px',
                                            padding: '0 4px',
                                            margin: 0,
                                            borderRadius: 4,
                                        }}
                                    >
                                        +{extraCount} more
                                    </Tag>
                                )}
                            </Space>
                        </div>
                    </div>
                );
            },
        },
        {
            title: 'Amount',
            dataIndex: 'total_amount',
            key: 'total_amount',
            width: 140,
            render: (val) => <Text strong style={{ color: '#1f1f1f' }}>{formatLKR(val)}</Text>,
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 150,
            render: (s: string) => {
                const normalized = (s || '').toLowerCase();
                const color = STATUS_COLOR_MAP[normalized] || 'blue';
                return (
                    <Tag color={color} style={{ textTransform: 'uppercase', fontWeight: 500, fontSize: 11 }}>
                        {normalized.replace(/_/g, ' ')}
                    </Tag>
                );
            },
        },
        {
            title: 'Date & Time',
            dataIndex: 'created_at',
            key: 'created_at',
            width: 160,
            render: (d) => (
                <Text style={{ fontSize: 12 }}>
                    {d ? slt(d).format('MMM DD, YYYY hh:mm A') : '—'}
                </Text>
            ),
        },
    ];

    return (
        <Drawer
            title={null}
            placement="right"
            width={Math.min(1020, typeof window !== 'undefined' ? window.innerWidth - 40 : 1020)}
            onClose={onClose}
            open={visible}
            bodyStyle={{ padding: '24px 28px', background: '#fafbfc' }}
            destroyOnClose
        >
            {isProfileLoading || !profile ? (
                <div style={{ textAlign: 'center', padding: '60px 0' }}>
                    <Text type="secondary">Loading customer profile...</Text>
                </div>
            ) : (
                <Space direction="vertical" size={20} style={{ width: '100%' }}>
                    {/* Header: Profile & High Return Risk Warning */}
                    <div
                        style={{
                            background: '#ffffff',
                            padding: '20px 24px',
                            borderRadius: 12,
                            border: '1px solid #eaedf1',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
                            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                                <Avatar
                                    size={64}
                                    icon={<UserOutlined />}
                                    style={{
                                        backgroundColor: profile.is_blocked ? '#ff4d4f' : '#1677ff',
                                        fontSize: 28,
                                        flexShrink: 0,
                                    }}
                                />
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                        <Title level={4} style={{ margin: 0 }}>
                                            {profile.full_name || 'Unnamed Customer'}
                                        </Title>
                                        {profile.stats?.segment && SEGMENT_META[profile.stats.segment] && (
                                            <Tag color={SEGMENT_META[profile.stats.segment].color} style={{ fontWeight: 500 }}>
                                                {SEGMENT_META[profile.stats.segment].label}
                                            </Tag>
                                        )}
                                        {profile.is_deleted && <Tag color="default">Account Deleted</Tag>}
                                        {profile.is_blocked && <Tag color="red">Account Blocked</Tag>}
                                        {analytics.is_high_return_risk && (
                                            <Tooltip title={`Return rate is ${analytics.return_rate}% (${analytics.returned_count} out of ${analytics.total_orders} orders). Handle COD orders with extra verification.`}>
                                                <Tag
                                                    color="error"
                                                    icon={<WarningOutlined />}
                                                    style={{
                                                        fontWeight: 600,
                                                        padding: '2px 8px',
                                                        borderRadius: 4,
                                                    }}
                                                >
                                                    High Return Risk ({analytics.return_rate}%)
                                                </Tag>
                                            </Tooltip>
                                        )}
                                    </div>
                                    <Space size={16} style={{ marginTop: 6 }} wrap>
                                        {profile.nic && (
                                            <Text type="secondary" style={{ fontSize: 13 }}>
                                                NIC: <Text strong>{profile.nic}</Text>
                                            </Text>
                                        )}
                                        <Text type="secondary" style={{ fontSize: 13 }}>
                                            Joined: {profile.created_at ? slt(profile.created_at).format('MMM DD, YYYY') : '—'}
                                        </Text>
                                        {profile.last_login && (
                                            <Text type="secondary" style={{ fontSize: 13 }}>
                                                Last Active: {slt(profile.last_login).format('MMM DD, YYYY')}
                                            </Text>
                                        )}
                                    </Space>
                                </div>
                            </div>

                            {/* Quick Contact Controls */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
                                <Space wrap>
                                    {profile.phone && (
                                        <>
                                            <Button
                                                type="default"
                                                icon={<PhoneOutlined style={{ color: '#1677ff' }} />}
                                                onClick={() => handleCall(profile.phone)}
                                                style={{ borderRadius: 6, fontWeight: 500 }}
                                            >
                                                Call ({profile.phone})
                                            </Button>
                                            <Button
                                                type="primary"
                                                icon={<WhatsAppOutlined />}
                                                style={{ backgroundColor: '#25D366', borderColor: '#25D366', borderRadius: 6, fontWeight: 500 }}
                                                onClick={() => handleWhatsApp(profile.phone)}
                                            >
                                                WhatsApp
                                            </Button>
                                        </>
                                    )}
                                    {profile.email && (
                                        <Button
                                            type="text"
                                            icon={<MailOutlined />}
                                            onClick={() => window.open(`mailto:${profile.email}`, '_self')}
                                            style={{ color: '#595959' }}
                                        >
                                            Email
                                        </Button>
                                    )}
                                </Space>
                                {profile.alternate_phone && (
                                    <Space size={6}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>Alt Phone: {profile.alternate_phone}</Text>
                                        <Button size="small" type="link" onClick={() => handleCall(profile.alternate_phone)} style={{ padding: 0 }}>Call</Button>
                                        <Text type="secondary">·</Text>
                                        <Button size="small" type="link" onClick={() => handleWhatsApp(profile.alternate_phone)} style={{ padding: 0, color: '#25D366' }}>WhatsApp</Button>
                                    </Space>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Order Analytics: 4 Metric Cards */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                            <Text strong style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#8c8c8c' }}>
                                Order Analytics & Risk Overview
                            </Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Lifetime Spend: <Text strong style={{ color: '#1677ff' }}>{formatLKR(profile.stats?.net_spent ?? 0)}</Text>
                            </Text>
                        </div>
                        <Row gutter={[14, 14]}>
                            <Col xs={24} sm={12} md={6}>
                                <Card
                                    size="small"
                                    style={{
                                        borderRadius: 10,
                                        border: '1px solid #e6f4ff',
                                        background: '#ffffff',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ width: 42, height: 42, borderRadius: 8, background: '#e6f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#1677ff', fontSize: 20 }}>
                                            <ShoppingOutlined />
                                        </div>
                                        <div>
                                            <Text type="secondary" style={{ fontSize: 12 }}>Total Orders</Text>
                                            <Title level={4} style={{ margin: 0, color: '#1677ff' }}>
                                                {analytics.total_orders} <span style={{ fontSize: 12, fontWeight: 400, color: '#8c8c8c' }}>Orders</span>
                                            </Title>
                                        </div>
                                    </div>
                                </Card>
                            </Col>
                            <Col xs={24} sm={12} md={6}>
                                <Card
                                    size="small"
                                    style={{
                                        borderRadius: 10,
                                        border: '1px solid #f6ffed',
                                        background: '#ffffff',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ width: 42, height: 42, borderRadius: 8, background: '#f6ffed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#52c41a', fontSize: 20 }}>
                                            <CheckCircleOutlined />
                                        </div>
                                        <div>
                                            <Text type="secondary" style={{ fontSize: 12 }}>Delivered</Text>
                                            <Title level={4} style={{ margin: 0, color: '#52c41a' }}>
                                                {analytics.delivered_count} <Tag color="green" style={{ fontSize: 11, marginLeft: 4 }}>Delivered</Tag>
                                            </Title>
                                        </div>
                                    </div>
                                </Card>
                            </Col>
                            <Col xs={24} sm={12} md={6}>
                                <Card
                                    size="small"
                                    style={{
                                        borderRadius: 10,
                                        border: '1px solid #fff1f0',
                                        background: '#ffffff',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ width: 42, height: 42, borderRadius: 8, background: '#fff1f0', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#ff4d4f', fontSize: 20 }}>
                                            <CloseCircleOutlined />
                                        </div>
                                        <div>
                                            <Text type="secondary" style={{ fontSize: 12 }}>Cancelled</Text>
                                            <Title level={4} style={{ margin: 0, color: '#ff4d4f' }}>
                                                {analytics.cancelled_count} <Tag color="red" style={{ fontSize: 11, marginLeft: 4 }}>Cancelled</Tag>
                                            </Title>
                                        </div>
                                    </div>
                                </Card>
                            </Col>
                            <Col xs={24} sm={12} md={6}>
                                <Card
                                    size="small"
                                    style={{
                                        borderRadius: 10,
                                        border: analytics.is_high_return_risk ? '1px solid #ffa39e' : '1px solid #fff7e6',
                                        background: '#ffffff',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ width: 42, height: 42, borderRadius: 8, background: analytics.is_high_return_risk ? '#fff1f0' : '#fff7e6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: analytics.is_high_return_risk ? '#cf1322' : '#fa8c16', fontSize: 20 }}>
                                            <RollbackOutlined />
                                        </div>
                                        <div>
                                            <Text type="secondary" style={{ fontSize: 12 }}>Returned & Rate</Text>
                                            <Title level={4} style={{ margin: 0, color: analytics.is_high_return_risk ? '#cf1322' : '#fa8c16' }}>
                                                {analytics.returned_count} <Tag color={analytics.is_high_return_risk ? 'error' : 'orange'} style={{ fontSize: 11, marginLeft: 4 }}>{analytics.return_rate}% Rate</Tag>
                                            </Title>
                                        </div>
                                    </div>
                                </Card>
                            </Col>
                        </Row>
                    </div>

                    {/* Order History Table with Filter Bar */}
                    <div
                        style={{
                            background: '#ffffff',
                            padding: '20px 24px',
                            borderRadius: 12,
                            border: '1px solid #eaedf1',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                            <Title level={5} style={{ margin: 0 }}>
                                Order History
                            </Title>
                            <Space wrap size={10}>
                                {/* Status Filter Buttons */}
                                <Segmented
                                    value={statusFilter}
                                    onChange={(val) => {
                                        setStatusFilter(val as StatusFilter);
                                        setOrdersPage(1);
                                    }}
                                    options={[
                                        { label: `All (${analytics.total_orders})`, value: 'all' },
                                        { label: `Delivered (${analytics.delivered_count})`, value: 'delivered' },
                                        { label: `Cancelled (${analytics.cancelled_count})`, value: 'cancelled' },
                                        { label: `Returned (${analytics.returned_count})`, value: 'returned' },
                                    ]}
                                />
                            </Space>
                        </div>

                        {/* Date Range Filter Bar */}
                        <div
                            style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                flexWrap: 'wrap',
                                gap: 12,
                                padding: '10px 14px',
                                background: '#f8fafc',
                                borderRadius: 8,
                                marginBottom: 16,
                            }}
                        >
                            <Space wrap size={8} align="center">
                                <CalendarOutlined style={{ color: '#8c8c8c' }} />
                                <Text type="secondary" style={{ fontSize: 12 }}>Filter Date:</Text>
                                <Segmented
                                    size="small"
                                    value={datePreset}
                                    onChange={(val) => handleDatePresetChange(val as DatePreset)}
                                    options={[
                                        { label: 'All Time', value: 'all' },
                                        { label: 'Today', value: 'today' },
                                        { label: 'Last 7 Days', value: 'last_7_days' },
                                        { label: 'Last 30 Days', value: 'last_30_days' },
                                        { label: 'Custom Range', value: 'custom' },
                                    ]}
                                />
                                {datePreset === 'custom' && (
                                    <RangePicker
                                        size="small"
                                        value={customDateRange}
                                        onChange={(dates) => {
                                            setCustomDateRange(dates);
                                            setOrdersPage(1);
                                        }}
                                        style={{ width: 230 }}
                                    />
                                )}
                            </Space>

                            {(statusFilter !== 'all' || datePreset !== 'all') && (
                                <Button
                                    size="small"
                                    type="link"
                                    icon={<ReloadOutlined />}
                                    onClick={() => {
                                        setStatusFilter('all');
                                        setDatePreset('all');
                                        setCustomDateRange(null);
                                        setOrdersPage(1);
                                    }}
                                >
                                    Reset Filters
                                </Button>
                            )}
                        </div>

                        {/* Orders Table */}
                        <Table
                            size="middle"
                            rowKey="order_id"
                            dataSource={ordersData?.orders ?? []}
                            loading={isOrdersLoading}
                            columns={columns}
                            locale={{
                                emptyText: (
                                    <Empty
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description="No orders found matching the selected filters."
                                    />
                                ),
                            }}
                            pagination={{
                                current: ordersPage,
                                pageSize: pageSize,
                                total: ordersData?.total ?? 0,
                                showSizeChanger: true,
                                pageSizeOptions: ['5', '8', '15', '25'],
                                size: 'small',
                                onChange: (p, ps) => {
                                    setOrdersPage(p);
                                    setPageSize(ps);
                                },
                            }}
                        />
                    </div>

                    {/* Customer Profile Details & Saved Addresses */}
                    <Row gutter={[16, 16]}>
                        <Col xs={24} md={12}>
                            <div
                                style={{
                                    background: '#ffffff',
                                    padding: '18px 20px',
                                    borderRadius: 12,
                                    border: '1px solid #eaedf1',
                                    height: '100%',
                                }}
                            >
                                <Title level={5} style={{ marginBottom: 14 }}>
                                    Profile Details
                                </Title>
                                <Descriptions column={1} size="small" bordered>
                                    <Descriptions.Item label="Full Name">
                                        {profile.full_name || <span style={{ color: '#bbb' }}>—</span>}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="NIC Number">
                                        {profile.nic || <span style={{ color: '#bbb' }}>—</span>}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Primary Phone">
                                        {profile.phone || <span style={{ color: '#bbb' }}>—</span>}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Email Address">
                                        {profile.email || <span style={{ color: '#bbb' }}>—</span>}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Account Status">
                                        {profile.is_deleted ? (
                                            <Tag color="default">Deleted</Tag>
                                        ) : profile.is_blocked ? (
                                            <Tag color="red">Blocked ({profile.blocked_reason || 'No reason'})</Tag>
                                        ) : (
                                            <Tag color={profile.is_active ? 'green' : 'default'}>
                                                {profile.is_active ? 'Active' : 'Inactive'}
                                            </Tag>
                                        )}
                                    </Descriptions.Item>
                                    <Descriptions.Item label="Email Verified">
                                        {profile.is_verified ? <Tag color="green">Yes</Tag> : <Tag color="orange">No</Tag>}
                                    </Descriptions.Item>
                                </Descriptions>
                            </div>
                        </Col>

                        <Col xs={24} md={12}>
                            <div
                                style={{
                                    background: '#ffffff',
                                    padding: '18px 20px',
                                    borderRadius: 12,
                                    border: '1px solid #eaedf1',
                                    height: '100%',
                                }}
                            >
                                <Title level={5} style={{ marginBottom: 14 }}>
                                    Saved Delivery Addresses ({profile.addresses?.length ?? 0})
                                </Title>
                                {profile.addresses && profile.addresses.length > 0 ? (
                                    <List
                                        size="small"
                                        dataSource={profile.addresses}
                                        renderItem={(addr) => (
                                            <List.Item style={{ padding: '8px 0' }}>
                                                <div style={{ width: '100%' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <Text strong style={{ fontSize: 13 }}>
                                                            <HomeOutlined style={{ marginRight: 6, color: '#1677ff' }} />
                                                            {addr.postal_city}, {addr.district}
                                                        </Text>
                                                        {addr.is_default && <Tag color="blue">Default</Tag>}
                                                    </div>
                                                    <Text style={{ fontSize: 12 }}>
                                                        {addr.address_line1}
                                                        {addr.address_line2 ? `, ${addr.address_line2}` : ''}
                                                    </Text>
                                                    <br />
                                                    <Text type="secondary" style={{ fontSize: 11 }}>
                                                        {addr.province} (Postal Code: {addr.postal_code})
                                                    </Text>
                                                </div>
                                            </List.Item>
                                        )}
                                    />
                                ) : (
                                    <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No saved addresses recorded." />
                                )}
                            </div>
                        </Col>
                    </Row>

                    {/* Linked Accounts with same NIC if any */}
                    {profile.linked_accounts && profile.linked_accounts.length > 0 && (
                        <div
                            style={{
                                background: '#ffffff',
                                padding: '18px 20px',
                                borderRadius: 12,
                                border: '1px solid #eaedf1',
                            }}
                        >
                            <Title level={5} style={{ marginBottom: 10 }}>
                                Other Accounts Associated With This NIC ({profile.linked_accounts.length})
                            </Title>
                            <List
                                size="small"
                                dataSource={profile.linked_accounts}
                                renderItem={(acc) => (
                                    <List.Item
                                        actions={[
                                            <Button
                                                key="switch"
                                                type="link"
                                                size="small"
                                                onClick={() => onSelectCustomer && onSelectCustomer(acc.user_id)}
                                            >
                                                Switch to Profile
                                            </Button>,
                                        ]}
                                    >
                                        <Space size={12}>
                                            <Text strong>{acc.full_name || 'Unnamed Account'}</Text>
                                            <Tag color={acc.is_deleted ? 'default' : 'green'}>
                                                {acc.is_deleted ? 'Deleted' : 'Live'}
                                            </Tag>
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                Joined {acc.created_at ? slt(acc.created_at).format('MMM DD, YYYY') : '—'}
                                            </Text>
                                        </Space>
                                    </List.Item>
                                )}
                            />
                        </div>
                    )}
                </Space>
            )}
        </Drawer>
    );
};

export default CustomerProfileDrawer;
