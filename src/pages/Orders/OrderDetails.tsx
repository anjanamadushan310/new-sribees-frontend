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
    Radio,
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
    FlagOutlined,
    PhoneOutlined,
    RobotOutlined,
    SettingOutlined,
    UserOutlined,
    WhatsAppOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ordersApi, ORDER_STATUS_META } from '../../api/orders.api';
import type {
    EscalationCategory,
    FulfilmentContacts,
    OrderEscalation,
    OrderItem,
    OrderStatus,
    ReturnResolution,
} from '../../api/orders.api';
import { usePermissions } from '../../hooks/usePermissions';

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

const ESC_CATEGORIES: { value: EscalationCategory; label: string }[] = [
    { value: 'cancel_request', label: 'Urgent Cancellation' },
    { value: 'address_correction', label: 'Address Correction' },
    { value: 'hold_shipment', label: 'Hold Shipment' },
    { value: 'customer_complaint', label: 'Customer Complaint' },
    { value: 'other', label: 'Other' },
];
const escLabel = (c: string) => ESC_CATEGORIES.find((x) => x.value === c)?.label ?? c;
const telHref = (p?: string | null) => (p ? `tel:${p.replace(/\s+/g, '')}` : undefined);
const waHref = (p?: string | null) =>
    p ? `https://wa.me/${p.replace(/[^\d]/g, '')}` : undefined;

const OrderDetails: React.FC<OrderDetailsProps> = ({ orderId, open, onClose }) => {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const { isSuperAdmin, isBranchManager, isSupport } = usePermissions();
    const canDecideReturn = isSuperAdmin || isBranchManager;

    const [overrideOpen, setOverrideOpen] = useState(false);
    const [overrideTarget, setOverrideTarget] = useState<OrderStatus | undefined>(undefined);
    const [overrideReason, setOverrideReason] = useState('');

    const [returnResolution, setReturnResolution] = useState<ReturnResolution>('returnless_refund');
    const [returnNote, setReturnNote] = useState('');
    const [proofNote, setProofNote] = useState('');
    const [escOpen, setEscOpen] = useState(false);
    const [escCategory, setEscCategory] = useState<EscalationCategory>('cancel_request');
    const [escMessage, setEscMessage] = useState('');

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
        setReturnResolution('returnless_refund');
        setReturnNote('');
        setProofNote('');
        setEscOpen(false);
        setEscCategory('cancel_request');
        setEscMessage('');
    }, [orderId]);

    const invalidateOrder = () => {
        queryClient.invalidateQueries({ queryKey: ['admin', 'order', orderId] });
        queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
    };

    const escalations = order?.escalations ?? [];
    const contacts: FulfilmentContacts | undefined = order?.fulfilment_contacts;

    const raiseEscMut = useMutation({
        mutationFn: () => ordersApi.raiseEscalation(order!.order_id, escCategory, escMessage.trim()),
        onSuccess: () => {
            message.success('Escalation raised.');
            setEscOpen(false);
            setEscMessage('');
            invalidateOrder();
        },
        onError: (err: any) => message.error(err.response?.data?.detail || 'Failed to raise escalation.'),
    });

    const escUpdateMut = useMutation({
        mutationFn: ({ eid, status, note }: { eid: string; status: 'acknowledged' | 'resolved'; note?: string }) =>
            ordersApi.updateEscalation(order!.order_id, eid, status, note),
        onSuccess: (_r, v) => {
            message.success(`Escalation ${v.status}.`);
            invalidateOrder();
        },
        onError: (err: any) => message.error(err.response?.data?.detail || 'Failed to update escalation.'),
    });

    const proofMut = useMutation({
        mutationFn: () => ordersApi.addReturnNote(order!.order_id, proofNote.trim()),
        onSuccess: () => {
            message.success('Note added to the return claim.');
            setProofNote('');
            invalidateOrder();
        },
        onError: (err: any) => message.error(err.response?.data?.detail || 'Failed to add note.'),
    });

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
        mutationFn: (id: string) => ordersApi.approveReturn(id, returnResolution, returnNote.trim() || undefined),
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
        mutationFn: (id: string) => ordersApi.rejectReturn(id, returnNote.trim() || undefined),
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
                    Approve the return for <b>{order.order_number}</b> as{' '}
                    <b>
                        {returnResolution === 'reverse_pickup'
                            ? 'a reverse pickup (rider collects the goods)'
                            : 'a returnless refund (no pickup)'}
                    </b>
                    ? The returned items' value will be refunded to the customer's SRIBEES Wallet.
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

                    <Divider titlePlacement="start">🏢 Fulfilment &amp; Logistics Contacts</Divider>
                    {contacts?.branch ? (
                        <Descriptions column={1} size="small" bordered>
                            <Descriptions.Item label="Branch">
                                {contacts.branch.name} ({contacts.branch.code})
                            </Descriptions.Item>
                            <Descriptions.Item label="Manager">
                                {contacts.branch.manager_name || '—'}
                                {contacts.branch.manager_email ? ` · ${contacts.branch.manager_email}` : ''}
                            </Descriptions.Item>
                            <Descriptions.Item label="Branch Phone">
                                {contacts.branch.phone ? (
                                    <Space>
                                        <span>{contacts.branch.phone}</span>
                                        <a href={telHref(contacts.branch.phone)}>
                                            <PhoneOutlined /> Call
                                        </a>
                                        <a href={waHref(contacts.branch.phone)} target="_blank" rel="noreferrer">
                                            <WhatsAppOutlined /> WhatsApp
                                        </a>
                                    </Space>
                                ) : (
                                    '—'
                                )}
                            </Descriptions.Item>
                        </Descriptions>
                    ) : (
                        <Text type="secondary">This order has no fulfilling branch.</Text>
                    )}
                    <div style={{ marginTop: 8 }}>
                        {contacts?.rider?.state === 'assigned' ? (
                            <Descriptions column={1} size="small">
                                <Descriptions.Item label="Rider">
                                    {contacts.rider.name || (
                                        <Text type="secondary">
                                            With the courier — waybill{' '}
                                            {contacts.rider.waybill || 'pending'}
                                            {contacts.rider.tracking_status
                                                ? ` · ${contacts.rider.tracking_status}`
                                                : ''}
                                        </Text>
                                    )}
                                </Descriptions.Item>
                                {contacts.rider.phone && (
                                    <Descriptions.Item label="Rider Phone">
                                        <Space>
                                            <span>{contacts.rider.phone}</span>
                                            <a href={telHref(contacts.rider.phone)}>
                                                <PhoneOutlined /> Call
                                            </a>
                                            <a href={waHref(contacts.rider.phone)} target="_blank" rel="noreferrer">
                                                <WhatsAppOutlined /> WhatsApp
                                            </a>
                                        </Space>
                                    </Descriptions.Item>
                                )}
                            </Descriptions>
                        ) : (
                            <Text type="secondary">⏳ Rider: Pending Assignment (not dispatched yet)</Text>
                        )}
                    </div>

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
                            {/* Support captures proofs; only BM/SA decides (B4 §2). */}
                            <div style={{ marginTop: 12 }}>
                                <Text strong style={{ fontSize: 13 }}>Add a proof / context note</Text>
                                <Space.Compact style={{ display: 'flex', marginTop: 4 }}>
                                    <Input
                                        placeholder="e.g. customer sent a photo of the spoiled item…"
                                        value={proofNote}
                                        onChange={(e) => setProofNote(e.target.value)}
                                        onPressEnter={() => proofNote.trim().length >= 3 && proofMut.mutate()}
                                    />
                                    <Button
                                        onClick={() => proofMut.mutate()}
                                        loading={proofMut.isPending}
                                        disabled={proofNote.trim().length < 3}
                                    >
                                        Add
                                    </Button>
                                </Space.Compact>
                            </div>

                            {canDecideReturn ? (
                                <div style={{ marginTop: 16 }}>
                                    <Text strong style={{ fontSize: 13 }}>Resolution</Text>
                                    <Radio.Group
                                        style={{ display: 'block', marginTop: 4 }}
                                        value={returnResolution}
                                        onChange={(e) => setReturnResolution(e.target.value)}
                                    >
                                        <Radio value="returnless_refund">
                                            Returnless refund <Text type="secondary">(spoilage — no pickup)</Text>
                                        </Radio>
                                        <Radio value="reverse_pickup">
                                            Reverse pickup <Text type="secondary">(a rider collects the goods)</Text>
                                        </Radio>
                                    </Radio.Group>
                                    <Input.TextArea
                                        style={{ marginTop: 8 }}
                                        rows={2}
                                        placeholder="Decision note (optional)…"
                                        value={returnNote}
                                        onChange={(e) => setReturnNote(e.target.value)}
                                    />
                                    <Space style={{ marginTop: 12 }}>
                                        <Button
                                            type="primary"
                                            loading={approveReturnMutation.isPending}
                                            onClick={confirmApproveReturn}
                                        >
                                            Approve &amp; Refund
                                        </Button>
                                        <Button
                                            danger
                                            loading={rejectReturnMutation.isPending}
                                            onClick={confirmRejectReturn}
                                        >
                                            Reject Claim
                                        </Button>
                                    </Space>
                                </div>
                            ) : (
                                <Alert
                                    style={{ marginTop: 12 }}
                                    type="info"
                                    showIcon
                                    message="A Branch Manager or Super Admin reviews and decides this claim."
                                />
                            )}
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

                    <Divider titlePlacement="start">
                        <Space>
                            <FlagOutlined /> Escalation Tickets
                            {escalations.some((e) => e.status !== 'resolved') && (
                                <Tag color="red">
                                    {escalations.filter((e) => e.status !== 'resolved').length} open
                                </Tag>
                            )}
                        </Space>
                    </Divider>
                    <Space direction="vertical" style={{ width: '100%' }} size={8}>
                        {escalations.length === 0 && (
                            <Text type="secondary">No escalations raised on this order.</Text>
                        )}
                        {escalations.map((e: OrderEscalation) => (
                            <div
                                key={e.escalation_id}
                                style={{
                                    padding: 10,
                                    borderRadius: 8,
                                    border: '1px solid #f0f0f0',
                                    background: e.status === 'resolved' ? '#fafafa' : '#fffef7',
                                }}
                            >
                                <Space wrap size={6}>
                                    <Tag color="geekblue">{escLabel(e.category)}</Tag>
                                    <Tag color={e.status === 'open' ? 'red' : e.status === 'acknowledged' ? 'gold' : 'green'}>
                                        {e.status}
                                    </Tag>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        {e.raised_by_name}
                                        {e.created_at ? ` · ${dayjs(e.created_at).format('MMM DD, HH:mm')}` : ''}
                                    </Text>
                                </Space>
                                <div style={{ marginTop: 4 }}>{e.message}</div>
                                {e.resolution_note && (
                                    <div style={{ marginTop: 4 }}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            ↳ {e.handled_by_name}: {e.resolution_note}
                                        </Text>
                                    </div>
                                )}
                                {canDecideReturn && e.status !== 'resolved' && (
                                    <Space style={{ marginTop: 8 }}>
                                        {e.status === 'open' && (
                                            <Button
                                                size="small"
                                                loading={escUpdateMut.isPending}
                                                onClick={() =>
                                                    escUpdateMut.mutate({ eid: e.escalation_id, status: 'acknowledged' })
                                                }
                                            >
                                                Acknowledge
                                            </Button>
                                        )}
                                        <Button
                                            size="small"
                                            type="primary"
                                            loading={escUpdateMut.isPending}
                                            onClick={() => {
                                                let note = '';
                                                modal.confirm({
                                                    title: 'Resolve escalation',
                                                    content: (
                                                        <Input.TextArea
                                                            rows={3}
                                                            placeholder="Resolution note (optional)…"
                                                            onChange={(ev) => (note = ev.target.value)}
                                                        />
                                                    ),
                                                    okText: 'Resolve',
                                                    onOk: () =>
                                                        escUpdateMut.mutateAsync({
                                                            eid: e.escalation_id,
                                                            status: 'resolved',
                                                            note: note.trim() || undefined,
                                                        }),
                                                });
                                            }}
                                        >
                                            Resolve
                                        </Button>
                                    </Space>
                                )}
                            </div>
                        ))}
                        <Button
                            icon={<FlagOutlined />}
                            onClick={() => setEscOpen(true)}
                            style={{ alignSelf: 'flex-start' }}
                        >
                            Raise Escalation
                        </Button>
                    </Space>

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

                    <Modal
                        title="🚩 Raise Internal Escalation"
                        open={escOpen}
                        onCancel={() => setEscOpen(false)}
                        okText="Raise Escalation"
                        okButtonProps={{
                            disabled: escMessage.trim().length < 5,
                            loading: raiseEscMut.isPending,
                        }}
                        onOk={() => raiseEscMut.mutate()}
                    >
                        <Space direction="vertical" style={{ width: '100%' }} size="middle">
                            <div>
                                <Text strong>Category</Text>
                                <Select
                                    style={{ width: '100%', marginTop: 4 }}
                                    value={escCategory}
                                    onChange={setEscCategory}
                                    options={ESC_CATEGORIES}
                                />
                            </div>
                            <div>
                                <Text strong>What needs the branch's attention?</Text>
                                <Input.TextArea
                                    style={{ marginTop: 4 }}
                                    rows={4}
                                    maxLength={2000}
                                    showCount
                                    placeholder="e.g. Customer called to cancel — order is still Confirmed, please hold before packing."
                                    value={escMessage}
                                    onChange={(e) => setEscMessage(e.target.value)}
                                />
                            </div>
                            {isSupport && (
                                <Alert
                                    type="info"
                                    showIcon
                                    message="The Branch Manager is notified and will acknowledge / resolve this ticket."
                                />
                            )}
                        </Space>
                    </Modal>
                </>
            )}
        </Drawer>
    );
};

export default OrderDetails;
