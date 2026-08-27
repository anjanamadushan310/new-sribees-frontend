/**
 * Order Details Drawer (Module 7.3)
 * Shows items, delivery details and the pricing breakdown for one order, and
 * lets an admin advance the order status behind a confirmation modal.
 */
import React, { useState, useEffect } from 'react';
import {
    Drawer,
    Descriptions,
    Table,
    Tag,
    Space,
    Select,
    Button,
    Divider,
    Spin,
    Empty,
    App,
    Typography,
} from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
    ordersApi,
    ORDER_STATUS_META,
    ORDER_STATUSES,
} from '../../api/orders.api';
import type { OrderItem, OrderStatus } from '../../api/orders.api';

const { Text, Title } = Typography;

const formatLKR = (value: number): string =>
    new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(value ?? 0);

export const statusTag = (status: OrderStatus, showPrefix: boolean = false) => {
    const meta = ORDER_STATUS_META[status];
    const label = showPrefix ? `🚚 Status: ${meta?.label ?? status}` : (meta?.label ?? status);
    return <Tag color={meta?.color ?? 'default'}>{label}</Tag>;
};

interface OrderDetailsProps {
    orderId: string | null;
    open: boolean;
    onClose: () => void;
}

const OrderDetails: React.FC<OrderDetailsProps> = ({ orderId, open, onClose }) => {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const [nextStatus, setNextStatus] = useState<OrderStatus | undefined>(undefined);

    const { data: order, isLoading } = useQuery({
        queryKey: ['admin', 'order', orderId],
        queryFn: () => ordersApi.getById(orderId!),
        enabled: open && !!orderId,
    });

    // Reset the pending status selection whenever a different order is opened.
    useEffect(() => {
        setNextStatus(undefined);
    }, [orderId]);

    const statusMutation = useMutation({
        mutationFn: ({ id, status }: { id: string; status: OrderStatus }) =>
            ordersApi.updateStatus(id, status),
        onSuccess: (updated) => {
            message.success(`Status updated to ${ORDER_STATUS_META[updated.status].label}.`);
            setNextStatus(undefined);
            queryClient.invalidateQueries({ queryKey: ['admin', 'order', orderId] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to update status.'),
    });

    const confirmUpdate = () => {
        if (!order || !nextStatus) return;
        modal.confirm({
            title: 'Update order status?',
            content: (
                <span>
                    Change <b>{order.order_number}</b> from {ORDER_STATUS_META[order.status].label} to{' '}
                    <b>{ORDER_STATUS_META[nextStatus].label}</b>?
                    {(nextStatus === 'shipped' || nextStatus === 'delivered') &&
                        ' The customer will be notified.'}
                </span>
            ),
            okText: 'Update',
            onOk: () => statusMutation.mutateAsync({ id: order.order_id, status: nextStatus }),
        });
    };

    const invalidateOrder = () => {
        queryClient.invalidateQueries({ queryKey: ['admin', 'order', orderId] });
        queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
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

    const statusOptions = ORDER_STATUSES.filter((s) => s !== order?.status).map((s) => ({
        label: ORDER_STATUS_META[s].label,
        value: s,
    }));

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

                    <Divider titlePlacement="start">Actions</Divider>
                    <Space wrap>
                        <Select
                            placeholder="Advance status to…"
                            style={{ width: 220 }}
                            value={nextStatus}
                            onChange={(v) => setNextStatus(v)}
                            options={statusOptions}
                        />
                        <Button
                            type="primary"
                            disabled={!nextStatus}
                            loading={statusMutation.isPending}
                            onClick={confirmUpdate}
                        >
                            Update Status
                        </Button>
                        <Button
                            icon={<DownloadOutlined />}
                            loading={invoiceMutation.isPending}
                            onClick={() => invoiceMutation.mutate(order.order_id)}
                        >
                            Download Invoice
                        </Button>
                    </Space>
                </>
            )}
        </Drawer>
    );
};

export default OrderDetails;
