/**
 * Order Details Drawer (Module 7.3 / QA spec B1)
 *
 * Shows items, delivery details and the pricing breakdown for one order, and
 * drives the fulfilment lifecycle:
 *   - Contextual state-driven action buttons (one-click next step), fetched
 *     from GET /admin/orders/{id}/next-statuses so the server is the single
 *     source of truth for what this role may do (B1 §3).
 *   - Read-only status badge for roles with no allowed transitions.
 *   - Super-Admin-only "Admin Override Status" modal with a mandatory
 *     >= 15-char justification, permanently logged to the audit trail (B1 §4).
 */
import React, { useEffect, useState } from 'react';
import {
    Alert,
    App,
    Button,
    Descriptions,
    Divider,
    Drawer,
    Empty,
    Input,
    Modal,
    Select,
    Space,
    Spin,
    Table,
    Tag,
    Timeline,
    Typography,
} from 'antd';
import {
    ClockCircleOutlined,
    DownloadOutlined,
    RobotOutlined,
    SettingOutlined,
    UserOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ordersApi, ORDER_STATUS_META } from '../../api/orders.api';
import type { OrderItem, OrderStatus } from '../../api/orders.api';

const { Text, Title } = Typography;

const formatLKR = (value: number): string =>
    new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(value ?? 0);

const statusLabel = (s: OrderStatus | string): string =>
    ORDER_STATUS_META[s as OrderStatus]?.label ?? String(s);

export const statusTag = (status: OrderStatus, showPrefix: boolean = false) => {
    const meta = ORDER_STATUS_META[status];
    const label = showPrefix ? `🚚 Status: ${meta?.label ?? status}` : (meta?.label ?? status);
    return <Tag color={meta?.color ?? 'default'}>{label}</Tag>;
};

const NOTIFY_ON: OrderStatus[] = [
    'handed_to_courier', 'shipped', 'out_for_delivery', 'delivered', 'delivery_failed',
];

interface OrderDetailsProps {
    orderId: string | null;
    open: boolean;
    onClose: () => void;
}

const OrderDetails: React.FC<OrderDetailsProps> = ({ orderId, open, onClose }) => {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();

    const [overrideOpen, setOverrideOpen] = useState(false);
    const [overrideTarget, setOverrideTarget] = useState<OrderStatus | undefined>(undefined);
    const [overrideReason, setOverrideReason] = useState('');

    const { data: order, isLoading } = useQuery({
        queryKey: ['admin', 'order', orderId],
        queryFn: () => ordersApi.getById(orderId!),
        enabled: open && !!orderId,
    });

    const { data: actionsData } = useQuery({
        queryKey: ['admin', 'order', orderId, 'next-statuses'],
        queryFn: () => ordersApi.nextStatuses(orderId!),
        enabled: open && !!orderId && !!order,
    });

    useEffect(() => {
        setOverrideOpen(false);
        setOverrideTarget(undefined);
        setOverrideReason('');
    }, [orderId]);

    const invalidateOrder = () => {
        queryClient.invalidateQueries({ queryKey: ['admin', 'order', orderId] });
        queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
    };

    const statusMutation = useMutation({
        mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
            ordersApi.updateStatus(id, status),
        onSuccess: (updated) => {
            message.success(`Status updated to ${statusLabel(updated.status)}.`);
            invalidateOrder();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to update status.'),
    });

    const overrideMutation = useMutation({
        mutationFn: ({ id, status, reason }: { id: string; status: OrderStatus; reason: string }) =>
            ordersApi.overrideStatus(id, status, reason),
        onSuccess: (updated) => {
            message.success(`Status overridden to ${statusLabel(updated.status)}.`);
            setOverrideOpen(false);
            setOverrideTarget(undefined);
            setOverrideReason('');
            invalidateOrder();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Override failed.'),
    });

    const runStatusChange = (target: OrderStatus) => {
        if (!order) return;
        modal.confirm({
            title: 'Update order status?',
            content: (
                <span>
                    Change <b>{order.order_number}</b> from {statusLabel(order.status)} to{' '}
                    <b>{statusLabel(target)}</b>?
                    {NOTIFY_ON.includes(target) && ' The customer will be notified.'}
                </span>
            ),
            okText: 'Update',
            onOk: () => statusMutation.mutateAsync({ id: order.order_id, status: target }),
        });
    };

    const approveReturnMutation = useMutation({
        mutationFn: (id: string) => ordersApi.approveReturn(id),
        onSuccess: (updated) => {
            message.success(
                `Return approved. ${formatLKR(updated.refund_amount ?? 0)} credited to the customer's wallet.`
            );
            invalidateOrder();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to approve return.'),
    });

    const rejectReturnMutation = useMutation({
        mutationFn: (id: string) => ordersApi.rejectReturn(id),
        onSuccess: () => {
            message.success('Return rejected. Order reverted to Delivered.');
            invalidateOrder();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to reject return.'),
    });

    const confirmApproveReturn = () => {
        if (!order) return;
        modal.confirm({
            title: 'Approve return?',
            content: (
                <span>
                    Approve the return for <b>{order.order_number}</b>? The returned items' value
                    will be refunded to the customer's SRIBEES Wallet and the order marked Refunded.
                </span>
            ),
            okText: 'Approve & Refund',
            onOk: () => approveReturnMutation.mutateAsync(order.order_id),
        });
    };

    const confirmRejectReturn = () => {
        if (!order) return;
        modal.confirm({
            title: 'Reject return?',
            content: (
                <span>
                    Reject the return for <b>{order.order_number}</b>? The order will revert to
                    Delivered and no refund will be issued.
                </span>
            ),
            okText: 'Reject',
            okButtonProps: { danger: true },
            onOk: () => rejectReturnMutation.mutateAsync(order.order_id),
        });
    };

    const invoiceMutation = useMutation({
        mutationFn: (id: string) => ordersApi.downloadInvoice(id),
        onSuccess: (blob, id) => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `invoice_${order?.order_number ?? id}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to download invoice.'),
    });

    const itemColumns: ColumnsType<OrderItem> = [
        {
            title: 'Product',
            key: 'product',
            render: (_, r) => (
                <Space direction="vertical" size={0}>
                    <Text>{r.product_name}</Text>
                    {r.product_sku && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {r.product_sku}
                        </Text>
                    )}
                </Space>
            ),
        },
        { title: 'Qty', dataIndex: 'quantity', key: 'quantity', width: 60, align: 'right' },
        {
            title: 'Unit',
            dataIndex: 'unit_price',
            key: 'unit_price',
            align: 'right',
            render: (v: number) => formatLKR(v),
        },
        {
            title: 'Subtotal',
            dataIndex: 'subtotal',
            key: 'subtotal',
            align: 'right',
            render: (v: number) => formatLKR(v),
        },
    ];

    const actions = actionsData?.actions ?? [];
    const canOverride = !!actionsData?.can_override;
    const overrideOptions = (actionsData?.all_statuses ?? [])
        .filter((s) => s !== order?.status)
        .map((s) => ({ label: statusLabel(s), value: s }));
    const busy = statusMutation.isPending;

    return (
        <Drawer
            title={order ? `Order ${order.order_number}` : 'Order'}
            open={open}
            onClose={onClose}
            width={640}
            destroyOnHidden
        >
            {isLoading || !order ? (
                <div style={{ textAlign: 'center', padding: 60 }}>
                    {isLoading ? <Spin size="large" /> : <Empty description="Order not found" />}
                </div>
            ) : (
                <>
                    <Space wrap style={{ marginBottom: 16 }}>
                        {statusTag(order.status, true)}
                        {(() => {
                            const isCOD =
                                order.payment_method === 'CASH_ON_DELIVERY' ||
                                order.payment_method === 'cash_on_delivery';
                            let color = 'orange';
                            let text = order.payment_status?.toUpperCase() || 'PENDING';
                            if (order.payment_status === 'paid') {
                                color = 'green';
                                text = 'Paid';
                            } else if (order.payment_status === 'failed') {
                                color = 'red';
                                text = 'Failed';
                            } else if (order.payment_status === 'refunded') {
                                color = 'purple';
                                text = 'Refunded';
                            } else if (order.payment_status === 'pending' || !order.payment_status) {
                                color = 'orange';
                                text = isCOD ? 'Pending (COD)' : 'Pending';
                            }
                            return <Tag color={color}>💳 Payment: {text}</Tag>;
                        })()}
                        {order.branch_name && <Tag color="geekblue">📍 Branch: {order.branch_name}</Tag>}
                    </Space>

                    <Descriptions column={1} size="small" bordered>
                        <Descriptions.Item label="Placed">
                            {order.created_at
                                ? dayjs(order.created_at).format('MMM DD, YYYY HH:mm')
                                : '—'}
                        </Descriptions.Item>
                        <Descriptions.Item label="Payment Method">
                            {order.payment_method?.toUpperCase() || 'N/A'}
                        </Descriptions.Item>
                        {order.delivery_slot_date && (
                            <Descriptions.Item label="Delivery Slot">
                                {dayjs(order.delivery_slot_date).format('MMM DD, YYYY')}
                                {order.delivery_slot_time ? ` · ${order.delivery_slot_time}` : ''}
                            </Descriptions.Item>
                        )}
                    </Descriptions>

                    <Divider titlePlacement="start">Customer</Divider>
                    {order.customer ? (
                        <Descriptions column={1} size="small">
                            <Descriptions.Item label="Name">
                                {order.customer.full_name}
                            </Descriptions.Item>
                            <Descriptions.Item label="Email">
                                {order.customer.email}
                            </Descriptions.Item>
                            {order.customer.phone && (
                                <Descriptions.Item label="Phone">
                                    {order.customer.phone}
                                </Descriptions.Item>
                            )}
                        </Descriptions>
                    ) : (
                        <Text type="secondary">No customer data</Text>
                    )}

                    <Divider titlePlacement="start">Delivery Address</Divider>
                    {order.delivery_address ? (
                        <Text>
                            {order.delivery_address.address_line1}
                            {order.delivery_address.address_line2
                                ? `, ${order.delivery_address.address_line2}`
                                : ''}
                            , {order.delivery_address.post_office}, {order.delivery_address.district},{' '}
                            {order.delivery_address.province} {order.delivery_address.postal_code}
                        </Text>
                    ) : (
                        <Text type="secondary">No delivery address</Text>
                    )}

                    <Divider titlePlacement="start">Items</Divider>
                    <Table
                        columns={itemColumns}
                        dataSource={order.items}
                        rowKey="order_item_id"
                        pagination={false}
                        size="small"
                    />

                    <Divider titlePlacement="start">Pricing</Divider>
                    <Descriptions column={1} size="small">
                        <Descriptions.Item label="Subtotal">
                            {formatLKR(order.pricing.subtotal)}
                        </Descriptions.Item>
                        <Descriptions.Item label="Tax">
                            {formatLKR(order.pricing.tax_amount)}
                        </Descriptions.Item>
                        <Descriptions.Item label="Shipping">
                            {formatLKR(order.pricing.shipping_amount)}
                        </Descriptions.Item>
                        <Descriptions.Item label="Discount">
                            −{formatLKR(order.pricing.discount_amount)}
                        </Descriptions.Item>
                        {order.pricing.wallet_deduction > 0 && (
                            <Descriptions.Item label="Wallet">
                                −{formatLKR(order.pricing.wallet_deduction)}
                            </Descriptions.Item>
                        )}
                    </Descriptions>
                    <Title level={4} style={{ marginTop: 8 }}>
                        Total: {formatLKR(order.pricing.total_amount)}
                    </Title>

                    {order.status === 'return_requested' && (
                        <>
                            <Divider titlePlacement="start">Return Request</Divider>
                            <Descriptions column={1} size="small" bordered>
                                <Descriptions.Item label="Reason">
                                    {order.return_reason || '—'}
                                </Descriptions.Item>
                                {order.return_comments && (
                                    <Descriptions.Item label="Comments">
                                        {order.return_comments}
                                    </Descriptions.Item>
                                )}
                                <Descriptions.Item label="Scope">
                                    {order.return_items && order.return_items.length > 0
                                        ? `${order.return_items.length} item(s)`
                                        : 'Full order'}
                                </Descriptions.Item>
                            </Descriptions>
                            <Space style={{ marginTop: 12 }}>
                                <Button
                                    type="primary"
                                    loading={approveReturnMutation.isPending}
                                    onClick={confirmApproveReturn}
                                >
                                    Approve Return
                                </Button>
                                <Button
                                    danger
                                    loading={rejectReturnMutation.isPending}
                                    onClick={confirmRejectReturn}
                                >
                                    Reject Return
                                </Button>
                            </Space>
                        </>
                    )}

                    {order.refund_amount != null && order.status === 'refunded' && (
                        <>
                            <Divider titlePlacement="start">Refund</Divider>
                            <Text>
                                Refunded <b>{formatLKR(order.refund_amount)}</b> to the customer's
                                wallet{order.return_reason ? ` (${order.return_reason})` : ''}.
                            </Text>
                        </>
                    )}

                    <Divider titlePlacement="start">📜 Status History & Audit Trail</Divider>
                    {order.history && order.history.length > 0 ? (
                        <div style={{ padding: '8px 12px', background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0' }}>
                            <Timeline
                                style={{ marginTop: 16 }}
                                items={order.history.map((h) => {
                                    const meta = ORDER_STATUS_META[h.new_status as OrderStatus];
                                    let color = meta?.color || 'blue';
                                    if (h.new_status === 'delivered') color = 'green';
                                    if (h.new_status === 'cancelled') color = 'red';
                                    if (h.new_status === 'shipped') color = 'cyan';
                                    if (h.new_status === 'pending') color = 'gold';

                                    const isUser = h.changed_by.toLowerCase().includes('customer');
                                    const isAdmin = h.changed_by.toLowerCase().includes('admin');
                                    const isOverride = (h.notes ?? '').includes('[EMERGENCY OVERRIDE]');

                                    return {
                                        color: isOverride ? 'red' : color,
                                        children: (
                                            <div style={{ marginBottom: 6 }}>
                                                <Space wrap size={8}>
                                                    <Text strong style={{ fontSize: 13 }}>
                                                        {meta?.label ?? h.new_status.toUpperCase()}
                                                    </Text>
                                                    <Tag color={color} style={{ margin: 0, fontSize: 11 }}>
                                                        {h.new_status}
                                                    </Tag>
                                                    {isOverride && (
                                                        <Tag color="red" style={{ margin: 0, fontSize: 11 }}>
                                                            OVERRIDE
                                                        </Tag>
                                                    )}
                                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                                        <ClockCircleOutlined style={{ marginRight: 4 }} />
                                                        {h.created_at ? dayjs(h.created_at).format('MMM DD, YYYY · hh:mm A') : '—'}
                                                    </Text>
                                                </Space>
                                                <div style={{ marginTop: 4 }}>
                                                    <Tag icon={isAdmin || isUser ? <UserOutlined /> : <RobotOutlined />} color={isAdmin ? 'purple' : isUser ? 'orange' : 'default'} style={{ fontSize: 11 }}>
                                                        by {h.changed_by}
                                                    </Tag>
                                                    {h.notes && (
                                                        <Text type="secondary" style={{ fontSize: 12, marginLeft: 4 }}>
                                                            ({h.notes})
                                                        </Text>
                                                    )}
                                                </div>
                                            </div>
                                        ),
                                    };
                                })}
                            />
                        </div>
                    ) : (
                        <Text type="secondary">No status history records available.</Text>
                    )}

                    <Divider titlePlacement="start">Actions</Divider>
                    {actions.length > 0 ? (
                        <Space wrap>
                            {actions.map((a) => (
                                <Button
                                    key={a.status}
                                    type={a.kind === 'danger' ? 'default' : 'primary'}
                                    danger={a.kind === 'danger'}
                                    loading={busy}
                                    onClick={() => runStatusChange(a.status)}
                                >
                                    {a.label}
                                </Button>
                            ))}
                        </Space>
                    ) : (
                        <Text type="secondary">
                            No status changes available from here for your role.
                        </Text>
                    )}

                    <div style={{ marginTop: 16 }}>
                        <Space wrap>
                            <Button
                                icon={<DownloadOutlined />}
                                loading={invoiceMutation.isPending}
                                onClick={() => invoiceMutation.mutate(order.order_id)}
                            >
                                Download Invoice
                            </Button>
                            {canOverride && (
                                <Button
                                    type="link"
                                    danger
                                    icon={<SettingOutlined />}
                                    onClick={() => setOverrideOpen(true)}
                                >
                                    Admin Override Status
                                </Button>
                            )}
                        </Space>
                    </div>

                    <Modal
                        title="⚙️ Emergency Manual Status Override"
                        open={overrideOpen}
                        onCancel={() => setOverrideOpen(false)}
                        okText="Confirm Override"
                        okButtonProps={{
                            danger: true,
                            disabled: !overrideTarget || overrideReason.trim().length < 15,
                            loading: overrideMutation.isPending,
                        }}
                        onOk={() =>
                            overrideTarget &&
                            overrideMutation.mutate({
                                id: order.order_id,
                                status: overrideTarget,
                                reason: overrideReason.trim(),
                            })
                        }
                    >
                        <Space direction="vertical" style={{ width: '100%' }} size="middle">
                            <Descriptions column={1} size="small" bordered>
                                <Descriptions.Item label="Current Status">
                                    {statusLabel(order.status)}
                                </Descriptions.Item>
                            </Descriptions>
                            <div>
                                <Text strong>Target Status</Text>
                                <Select
                                    style={{ width: '100%', marginTop: 4 }}
                                    placeholder="Pick any order status…"
                                    value={overrideTarget}
                                    onChange={setOverrideTarget}
                                    options={overrideOptions}
                                    showSearch
                                    optionFilterProp="label"
                                />
                            </div>
                            <div>
                                <Text strong>Reason / Justification (required)</Text>
                                <Input.TextArea
                                    style={{ marginTop: 4 }}
                                    rows={3}
                                    maxLength={1000}
                                    showCount
                                    placeholder="Explain why an emergency manual status change is required…"
                                    value={overrideReason}
                                    onChange={(e) => setOverrideReason(e.target.value)}
                                    status={
                                        overrideReason.length > 0 && overrideReason.trim().length < 15
                                            ? 'error'
                                            : undefined
                                    }
                                />
                                {overrideReason.length > 0 && overrideReason.trim().length < 15 && (
                                    <Text type="danger" style={{ fontSize: 12 }}>
                                        At least 15 characters.
                                    </Text>
                                )}
                            </div>
                            <Alert
                                type="warning"
                                showIcon
                                message="Overriding status bypasses standard operational validations and will be logged permanently in the audit trail."
                            />
                        </Space>
                    </Modal>
                </>
            )}
        </Drawer>
    );
};

export default OrderDetails;
