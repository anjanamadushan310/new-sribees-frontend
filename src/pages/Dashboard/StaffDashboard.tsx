/**
 * Staff Dashboard — Customer Support view.
 *
 * A working queue for the branch's live orders. Every number and row here
 * comes from /api/v1/admin/orders, which is branch-scoped on the server —
 * a Customer Support admin only ever sees their own branch's orders, so no
 * branch filtering happens client-side.
 */
import React, { useMemo, useState } from 'react';
import { Card, Row, Col, Statistic, List, Spin, Alert, Tag, Space, Typography, Badge, Button, Empty, Segmented, App } from 'antd';
import {
    ClockCircleOutlined,
    CheckCircleOutlined,
    SyncOutlined,
    CarOutlined,
    UserOutlined,
    ArrowRightOutlined,
    EyeOutlined,
} from '@ant-design/icons';
import { useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../store/authStore';
import { ordersApi, ORDER_STATUS_META } from '../../api/orders.api';
import type { OrderListItem, OrderStatus } from '../../api/orders.api';
import { apiErrorMessage } from '../../utils/analytics';
import OrderDetails from '../Orders/OrderDetails';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.extend(relativeTime);

const { Title, Text } = Typography;

type Segment = 'pending' | 'confirmed' | 'processing' | 'out_for_delivery';

/** Which real order statuses make up each queue tab, and what the "advance" action does. */
const SEGMENT_STATUSES: Record<Segment, OrderStatus[]> = {
    pending: ['pending'],
    confirmed: ['confirmed'],
    processing: ['processing'],
    out_for_delivery: ['shipped', 'out_for_delivery'],
};

const NEXT_STATUS: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
    pending: { status: 'confirmed', label: 'Confirm Order' },
    confirmed: { status: 'processing', label: 'Start Processing' },
    processing: { status: 'shipped', label: 'Mark Shipped' },
    shipped: { status: 'out_for_delivery', label: 'Out for Delivery' },
    out_for_delivery: { status: 'delivered', label: 'Mark Delivered' },
};

const SEGMENT_META: Record<
    Segment,
    { label: string; icon: (color: string) => React.ReactNode; color: string; empty: string }
> = {
    pending: {
        label: 'New',
        icon: (color) => <ClockCircleOutlined style={{ color }} />,
        color: '#faad14',
        empty: 'No new orders! Great job! 🎉',
    },
    confirmed: {
        label: 'Confirmed',
        icon: (color) => <CheckCircleOutlined style={{ color }} />,
        color: '#13c2c2',
        empty: 'Nothing waiting to be processed.',
    },
    processing: {
        label: 'Processing',
        icon: (color) => <SyncOutlined style={{ color }} />,
        color: '#1890ff',
        empty: 'No orders being processed.',
    },
    out_for_delivery: {
        label: 'Out for Delivery',
        icon: (color) => <CarOutlined style={{ color }} />,
        color: '#52c41a',
        empty: 'No orders out for delivery.',
    },
};

const formatLKR = (value: number): string =>
    new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(value ?? 0);

const StaffDashboard: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const user = useAuthStore((state) => state.user);
    const [segment, setSegment] = useState<Segment>('pending');
    const [openOrderId, setOpenOrderId] = useState<string | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);

    // One cheap call per real status (limit=1) just for the header counts —
    // every segment's badge stays accurate even for statuses not currently open.
    const countQueries = useQueries({
        queries: (['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery'] as OrderStatus[]).map(
            (status) => ({
                queryKey: ['admin', 'orders', 'count', status],
                queryFn: () => ordersApi.list({ order_status: status, limit: 1 }),
            })
        ),
    });
    const countByStatus = useMemo(() => {
        const statuses: OrderStatus[] = ['pending', 'confirmed', 'processing', 'shipped', 'out_for_delivery'];
        const out: Partial<Record<OrderStatus, number>> = {};
        countQueries.forEach((q, i) => {
            out[statuses[i]] = q.data?.total ?? 0;
        });
        return out;
    }, [countQueries]);

    const segmentCount = (s: Segment) =>
        SEGMENT_STATUSES[s].reduce((sum, status) => sum + (countByStatus[status] ?? 0), 0);
    const countsLoading = countQueries.some((q) => q.isLoading);

    // The active queue: every status folded into the selected segment, oldest first.
    const statusesInSegment = SEGMENT_STATUSES[segment];
    const queueQueries = useQueries({
        queries: statusesInSegment.map((status) => ({
            queryKey: ['admin', 'orders', 'queue', status],
            queryFn: () => ordersApi.list({ order_status: status, limit: 50 }),
        })),
    });
    const queueLoading = queueQueries.some((q) => q.isLoading);
    const queueError = queueQueries.find((q) => q.isError)?.error;
    const orders = useMemo(() => {
        const rows = queueQueries.flatMap((q) => q.data?.orders ?? []);
        return rows.sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''));
    }, [queueQueries]);

    const advanceMutation = useMutation({
        mutationFn: ({ id, status }: { id: string; status: OrderStatus }) => ordersApi.updateStatus(id, status),
        onSuccess: (updated) => {
            message.success(`${updated.order_number} moved to ${ORDER_STATUS_META[updated.status].label}.`);
            queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
        },
        onError: (err) => message.error(apiErrorMessage(err)),
    });

    const openDrawer = (id: string) => {
        setOpenOrderId(id);
        setDrawerOpen(true);
    };

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '24px' }}>
                <Title level={2} style={{ margin: 0 }}>
                    Welcome, {user?.full_name?.split(' ')[0] || 'Staff'}! 👋
                </Title>
                <Text type="secondary">
                    {user?.branch_name ? `${user.branch_name} • ` : ''}
                    {dayjs().format('dddd, MMMM D')}
                </Text>
            </div>

            {queueError ? (
                <Alert
                    message="Failed to load orders"
                    description={apiErrorMessage(queueError)}
                    type="error"
                    showIcon
                    style={{ marginBottom: '24px' }}
                />
            ) : null}

            <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
                {(Object.keys(SEGMENT_META) as Segment[]).map((s) => (
                    <Col xs={12} sm={6} key={s}>
                        <Card
                            hoverable
                            onClick={() => setSegment(s)}
                            style={{
                                borderTop: segment === s ? `3px solid ${SEGMENT_META[s].color}` : undefined,
                            }}
                        >
                            <Statistic
                                title={SEGMENT_META[s].label}
                                value={segmentCount(s)}
                                loading={countsLoading}
                                prefix={SEGMENT_META[s].icon(SEGMENT_META[s].color)}
                                styles={{ content: { color: SEGMENT_META[s].color } }}
                            />
                        </Card>
                    </Col>
                ))}
            </Row>

            <Card
                title={
                    <Space>
                        <span>Order Queue</span>
                        <Badge count={orders.length} style={{ backgroundColor: SEGMENT_META[segment].color }} />
                    </Space>
                }
                extra={
                    <Segmented
                        value={segment}
                        onChange={(value) => setSegment(value as Segment)}
                        options={(Object.keys(SEGMENT_META) as Segment[]).map((s) => ({
                            label: `${SEGMENT_META[s].label} (${segmentCount(s)})`,
                            value: s,
                        }))}
                    />
                }
            >
                {queueLoading ? (
                    <div style={{ textAlign: 'center', padding: 48 }}>
                        <Spin size="large" />
                    </div>
                ) : orders.length === 0 ? (
                    <Empty description={SEGMENT_META[segment].empty} />
                ) : (
                    <List
                        dataSource={orders}
                        renderItem={(order: OrderListItem) => {
                            const next = NEXT_STATUS[order.status];
                            const meta = ORDER_STATUS_META[order.status];
                            return (
                                <Card style={{ marginBottom: 16 }} styles={{ body: { padding: '16px' } }}>
                                    <Row gutter={[16, 16]} align="middle">
                                        <Col xs={24} sm={12} md={8}>
                                            <Space direction="vertical" size={4}>
                                                <Space>
                                                    <Text strong style={{ fontSize: '16px' }}>
                                                        {order.order_number}
                                                    </Text>
                                                    <Tag color={meta.color}>{meta.label}</Tag>
                                                </Space>
                                                <Text type="secondary">
                                                    {order.created_at ? dayjs(order.created_at).fromNow() : '—'} ·{' '}
                                                    {order.item_count} items
                                                </Text>
                                                <Text strong style={{ color: '#16a34a', fontSize: '18px' }}>
                                                    {formatLKR(order.total_amount)}
                                                </Text>
                                            </Space>
                                        </Col>

                                        <Col xs={24} sm={12} md={8}>
                                            <Space direction="vertical" size={4}>
                                                <Space>
                                                    <UserOutlined />
                                                    <Text strong>{order.customer_name || '—'}</Text>
                                                </Space>
                                                {order.customer_email && (
                                                    <Text type="secondary">{order.customer_email}</Text>
                                                )}
                                            </Space>
                                        </Col>

                                        <Col xs={24} md={8}>
                                            <Space direction="vertical" style={{ width: '100%' }}>
                                                <Button
                                                    block
                                                    icon={<EyeOutlined />}
                                                    onClick={() => openDrawer(order.order_id)}
                                                >
                                                    View Details
                                                </Button>
                                                {next && (
                                                    <Button
                                                        type="primary"
                                                        block
                                                        icon={<ArrowRightOutlined />}
                                                        loading={
                                                            advanceMutation.isPending &&
                                                            advanceMutation.variables?.id === order.order_id
                                                        }
                                                        onClick={() =>
                                                            advanceMutation.mutate({ id: order.order_id, status: next.status })
                                                        }
                                                    >
                                                        {next.label}
                                                    </Button>
                                                )}
                                            </Space>
                                        </Col>
                                    </Row>
                                </Card>
                            );
                        }}
                    />
                )}
            </Card>

            <OrderDetails orderId={openOrderId} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
        </div>
    );
};

export default StaffDashboard;
