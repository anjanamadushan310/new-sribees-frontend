import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    App,
    Breadcrumb,
    Button,
    Card,
    Col,
    Descriptions,
    Divider,
    Image,
    Input,
    Modal,
    Result,
    Row,
    Select,
    Space,
    Spin,
    Table,
    Tag,
    Timeline,
    Typography,
    Alert,
} from 'antd';
import {
    ArrowLeftOutlined,
    ClockCircleOutlined,
    DownloadOutlined,
    ExportOutlined,
    HistoryOutlined,
    PhoneOutlined,
    PictureOutlined,
    RobotOutlined,
    SettingOutlined,
    UserOutlined,
    WhatsAppOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ordersApi, ORDER_STATUS_META } from '../../api/orders.api';
import type {
    FulfilmentContacts,
    OrderItem,
    OrderStatus,
    ReturnResolution,
} from '../../api/orders.api';
import { usePermissions } from '../../hooks/usePermissions';
import CourierPanel from './CourierPanel';
import EscalationSection from './components/EscalationSection';
import HorizontalOrderStepper from './components/HorizontalOrderStepper';
import { slt } from '../../utils/datetime';

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
    'ready_for_pickup', 'handed_to_courier', 'shipped', 'out_for_delivery', 'delivered',
    'delivery_failed',
];

const telHref = (p?: string | null) => (p ? `tel:${p.replace(/\s+/g, '')}` : undefined);
const waHref = (p?: string | null) =>
    p ? `https://wa.me/${p.replace(/[^\d]/g, '')}` : undefined;

const OrderDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const { isSuperAdmin, isBranchManager } = usePermissions();
    const canDecideReturn = isSuperAdmin || isBranchManager;

    const [overrideOpen, setOverrideOpen] = useState(false);
    const [overrideTarget, setOverrideTarget] = useState<OrderStatus | undefined>(undefined);
    const [overrideReason, setOverrideReason] = useState('');

    const [returnResolution, setReturnResolution] = useState<ReturnResolution>('returnless_refund');
    const [returnNote, setReturnNote] = useState('');

    const { data: order, isLoading, error } = useQuery({
        queryKey: ['admin', 'order', id],
        queryFn: () => ordersApi.getById(id!),
        enabled: !!id,
    });

    const { data: actionsData } = useQuery({
        queryKey: ['admin', 'order', id, 'next-statuses'],
        queryFn: () => ordersApi.nextStatuses(id!),
        enabled: !!id && !!order,
    });

    const invalidateOrder = () => {
        queryClient.invalidateQueries({ queryKey: ['admin', 'order', id] });
        queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
    };

    // Deep-link: scroll into hash anchor (e.g. #return-claim-review, #escalation-center)
    React.useEffect(() => {
        if (!isLoading && order) {
            const hash = window.location.hash;
            if (hash) {
                const timer = setTimeout(() => {
                    const el = document.querySelector(hash);
                    if (el) {
                        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    }
                }, 350);
                return () => clearTimeout(timer);
            }
        }
    }, [isLoading, order]);

    const statusMutation = useMutation({
        mutationFn: ({ status }: { status: OrderStatus }) =>
            ordersApi.updateStatus(order!.order_id, status),
        onSuccess: (updated) => {
            message.success(
                `Order moved to ${ORDER_STATUS_META[updated.status]?.label ?? updated.status}.`
            );
            invalidateOrder();
        },
        onError: (err: any) => {
            message.error(err.response?.data?.detail || 'Failed to update order status.');
        },
    });

    const overrideMutation = useMutation({
        mutationFn: ({ id, status, reason }: { id: string; status: OrderStatus; reason: string }) =>
            ordersApi.overrideStatus(id, status, reason),
        onSuccess: (updated) => {
            message.warning(`Order status OVERRIDDEN to ${updated.status}.`);
            setOverrideOpen(false);
            setOverrideTarget(undefined);
            setOverrideReason('');
            invalidateOrder();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Override refused.'),
    });

    const approveReturnMutation = useMutation({
        mutationFn: (id: string) =>
            ordersApi.approveReturn(id, returnResolution, returnNote.trim() || undefined),
        onSuccess: (_updated) => {
            message.success('Return claim approved.');
            invalidateOrder();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to approve return.'),
    });

    const rejectReturnMutation = useMutation({
        mutationFn: (id: string) =>
            ordersApi.rejectReturn(id, returnNote.trim() || undefined),
        onSuccess: () => {
            message.info('Return claim rejected.');
            invalidateOrder();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to reject return.'),
    });

    const regenerateCodeMutation = useMutation({
        mutationFn: (id: string) => ordersApi.regenerateReturnCode(id),
        onSuccess: (updated) => {
            message.success(`New handover code: ${updated.return_handover_code}`);
            invalidateOrder();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to issue a new code.'),
    });

    const retryBookingMutation = useMutation({
        mutationFn: (orderId: string) => ordersApi.retryReturnBooking(orderId),
        onSuccess: (updated) => {
            message.success(`Pickup booked — ${updated.return_waybill_number}`);
            invalidateOrder();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'SribeesExpress could not be reached.'),
    });

    const invoiceMutation = useMutation({
        mutationFn: (orderId: string) => ordersApi.downloadInvoice(orderId),
        onSuccess: (blob, orderId) => {
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `invoice_${order?.order_number ?? orderId}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(url);
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to download invoice.'),
    });


    const runStatusChange = (targetStatus: OrderStatus) => {
        if (!order) return;
        const willNotify = NOTIFY_ON.includes(targetStatus);
        const targetLabel = statusLabel(targetStatus);

        modal.confirm({
            title: `Move order to ${targetLabel}?`,
            content: (
                <span>
                    Order <b>{order.order_number}</b> will become <b>{targetLabel}</b>.
                    {willNotify && (
                        <>
                            {' '}
                            The customer will receive an automated notification (SMS / WhatsApp).
                        </>
                    )}
                </span>
            ),
            okText: `Yes, mark ${targetLabel}`,
            onOk: () => statusMutation.mutateAsync({ status: targetStatus }),
        });
    };

    const confirmRegenerateCode = () => {
        if (!order) return;
        modal.confirm({
            title: 'Generate a new handover code?',
            content:
                'The current code stops working immediately. Only do this if the branch cannot find it.',
            okText: 'Generate',
            okButtonProps: { danger: true },
            onOk: () => regenerateCodeMutation.mutateAsync(order.order_id),
        });
    };

    const confirmApproveReturn = () => {
        if (!order) return;
        const pickup = returnResolution === 'reverse_pickup';
        modal.confirm({
            title: 'Approve return?',
            content: (
                <span>
                    Approve the return for <b>{order.order_number}</b> as{' '}
                    <b>
                        {pickup
                            ? 'a reverse pickup (rider collects the goods)'
                            : 'a returnless refund (no pickup)'}
                    </b>
                    ?{' '}
                    {pickup
                        ? "A rider is booked to collect the goods. The returned items' value goes to the customer's SRIBEES Wallet once the rider hands them to the branch and enters the handover code."
                        : "The returned items' value will be refunded to the customer's SRIBEES Wallet."}
                </span>
            ),
            okText: pickup ? 'Approve & Schedule Pickup' : 'Approve & Refund',
            onOk: () => approveReturnMutation.mutateAsync(order.order_id),
        });
    };

    const confirmRejectReturn = () => {
        if (!order) return;
        if (!returnNote.trim()) {
            message.error('Please enter a Decision Note explaining why the return claim is being rejected.');
            return;
        }
        modal.confirm({
            title: 'Reject return claim?',
            content: (
                <div>
                    <p>
                        Reject the return claim for <b>{order.order_number}</b>? The return request will be
                        marked as <b>Rejected</b> and the customer will see this reason in their app.
                    </p>
                    <div
                        style={{
                            background: '#fff1f0',
                            border: '1px solid #ffccc7',
                            padding: '8px 12px',
                            borderRadius: 6,
                            marginTop: 8,
                        }}
                    >
                        <strong>Decision Reason:</strong> {returnNote.trim()}
                    </div>
                </div>
            ),
            okText: 'Reject Claim',
            okButtonProps: { danger: true },
            onOk: () => rejectReturnMutation.mutateAsync(order.order_id),
        });
    };

    // Columns for Items Table with Product Thumbnails
    const itemColumns: ColumnsType<OrderItem> = [
        {
            title: 'Item & Details',
            key: 'product',
            render: (_, r) => (
                <Space align="center" size={14}>
                    {r.product_image ? (
                        <Image
                            src={r.product_image}
                            width={52}
                            height={52}
                            style={{ objectFit: 'cover', borderRadius: 6, border: '1px solid #f0f0f0' }}
                            preview={{ mask: null }}
                        />
                    ) : (
                        <div
                            style={{
                                width: 52,
                                height: 52,
                                borderRadius: 6,
                                background: '#f5f5f7',
                                border: '1px solid #e8e8ed',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#999',
                            }}
                        >
                            <PictureOutlined style={{ fontSize: 22 }} />
                        </div>
                    )}
                    <Space direction="vertical" size={2}>
                        <Text strong style={{ fontSize: 13, color: '#1f1f1f' }}>
                            {r.product_name}
                        </Text>
                        {r.product_sku && (
                            <Text type="secondary" style={{ fontSize: 12, fontFamily: 'monospace' }}>
                                SKU: {r.product_sku}
                            </Text>
                        )}
                    </Space>
                </Space>
            ),
        },
        {
            title: 'Qty',
            dataIndex: 'quantity',
            key: 'quantity',
            width: 70,
            align: 'center',
            render: (q: number) => <Tag style={{ fontWeight: 600 }}>{q}</Tag>,
        },
        {
            title: 'Unit Price',
            dataIndex: 'unit_price',
            key: 'unit_price',
            width: 120,
            align: 'right',
            render: (v: number) => formatLKR(v),
        },
        {
            title: 'Subtotal',
            dataIndex: 'subtotal',
            key: 'subtotal',
            width: 130,
            align: 'right',
            render: (v: number) => (
                <Text strong style={{ fontSize: 13 }}>
                    {formatLKR(v)}
                </Text>
            ),
        },
    ];

    if (isLoading) {
        return (
            <div style={{ padding: '80px 0', textAlign: 'center' }}>
                <Spin size="large" tip="Loading Order Details..." />
            </div>
        );
    }

    if (error || !order) {
        return (
            <Result
                status="404"
                title="Order Not Found"
                subTitle="The requested order could not be loaded or you do not have permission to view it."
                extra={
                    <Button type="primary" onClick={() => navigate('/orders')}>
                        Back to Orders
                    </Button>
                }
            />
        );
    }

    const contacts = (order as any).contacts as FulfilmentContacts | undefined;
    const actions = actionsData?.actions ?? [];
    const canOverride = !!actionsData?.can_override;
    const overrideOptions = (actionsData?.all_statuses ?? [])
        .filter((s) => s !== order?.status)
        .map((s) => ({ label: statusLabel(s), value: s }));
    const busy = statusMutation.isPending;

    const isCOD =
        order.payment_method === 'CASH_ON_DELIVERY' ||
        order.payment_method === 'cash_on_delivery';
    let paymentColor = 'orange';
    let paymentText = order.payment_status?.toUpperCase() || 'PENDING';
    if (order.payment_status === 'paid') {
        paymentColor = 'green';
        paymentText = 'Paid';
    } else if (order.payment_status === 'failed') {
        paymentColor = 'red';
        paymentText = 'Failed';
    } else if (order.payment_status === 'refunded') {
        paymentColor = 'purple';
        paymentText = 'Refunded';
    } else if (order.payment_status === 'pending' || !order.payment_status) {
        paymentColor = 'orange';
        paymentText = isCOD ? 'Pending (COD)' : 'Pending';
    }

    return (
        <div id="order-detail-page" className="order-detail-page" style={{ maxWidth: 1400, margin: '0 auto', paddingBottom: 40 }}>
            {/* Header navigation bar */}
            <div style={{ marginBottom: 16 }}>
                <Breadcrumb
                    items={[
                        { title: <a onClick={() => navigate('/orders')}>Orders</a> },
                        { title: `Order ${order.order_number}` },
                    ]}
                />
            </div>

            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    marginBottom: 20,
                    background: '#fff',
                    padding: '16px 20px',
                    borderRadius: 8,
                    border: '1px solid #f0f0f0',
                }}
            >
                <Space align="center" size={14} wrap>
                    <Button
                        icon={<ArrowLeftOutlined />}
                        onClick={() => navigate('/orders')}
                    >
                        Back to Orders
                    </Button>
                    <div>
                        <Space align="center" size={10} wrap>
                            <Title level={3} style={{ margin: 0, fontFamily: 'monospace' }}>
                                #{order.order_number}
                            </Title>
                            {statusTag(order.status, true)}
                            <Tag color={paymentColor}>💳 Payment: {paymentText}</Tag>
                            {order.branch_name && (
                                <Tag color="geekblue">📍 Branch: {order.branch_name}</Tag>
                            )}
                        </Space>
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 2 }}>
                            Placed on{' '}
                            {order.created_at
                                ? slt(order.created_at).format('MMMM DD, YYYY · hh:mm A')
                                : '—'}
                            {order.delivery_slot_date && (
                                <>
                                    {' '}
                                    · Slot: {slt(order.delivery_slot_date).format('MMM DD, YYYY')}{' '}
                                    {order.delivery_slot_time || ''}
                                </>
                            )}
                        </Text>
                    </div>
                </Space>

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
                            danger
                            icon={<SettingOutlined />}
                            onClick={() => setOverrideOpen(true)}
                        >
                            Emergency Override
                        </Button>
                    )}
                </Space>
            </div>

            {/* Horizontal Order Status Stepper */}
            <HorizontalOrderStepper order={order} />

            {/* Main 2-Column Responsive Layout */}
            <Row gutter={[20, 20]}>
                {/* LEFT COLUMN: Customer, Contacts, Purchased Items, Pricing */}
                <Col xs={24} lg={14}>
                    <Space orientation="vertical" size={20} style={{ width: '100%' }}>
                        {/* 1. Customer & Delivery Address */}
                        <Card
                            title="👤 Customer &amp; Delivery Information"
                            size="small"
                            style={{ borderRadius: 8 }}
                            extra={
                                order.customer?.user_id ? (
                                    <Button
                                        size="small"
                                        type="default"
                                        icon={<HistoryOutlined />}
                                        onClick={() => {
                                            const custId = order.customer!.user_id;
                                            window.open(`/customers?customerId=${encodeURIComponent(custId)}`, '_blank', 'noopener,noreferrer');
                                        }}
                                        style={{
                                            fontSize: 12,
                                            borderRadius: 6,
                                            borderColor: '#bfdbfe',
                                            backgroundColor: '#eff6ff',
                                            color: '#2563eb',
                                            fontWeight: 600,
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 4,
                                        }}
                                    >
                                        View Customer History <ExportOutlined style={{ fontSize: 10 }} />
                                    </Button>
                                ) : null
                            }
                        >
                            <Row gutter={[16, 16]}>
                                <Col xs={24} sm={12}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>Customer Details</Text>
                                    {order.customer ? (
                                        <div style={{ marginTop: 4 }}>
                                            <div style={{ fontWeight: 600, fontSize: 14 }}>
                                                {order.customer.full_name}
                                            </div>
                                            <div style={{ color: '#555', fontSize: 13 }}>
                                                {order.customer.email}
                                            </div>
                                            {order.customer.phone && (
                                                <div style={{ marginTop: 4 }}>
                                                    <a href={telHref(order.customer.phone)}>
                                                        <PhoneOutlined /> {order.customer.phone}
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ color: '#888' }}>Guest / Unregistered Customer</div>
                                    )}
                                </Col>
                                <Col xs={24} sm={12}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>Delivery Address</Text>
                                    {order.delivery_address ? (
                                        <div style={{ marginTop: 4, fontSize: 13, lineHeight: '1.5' }}>
                                            <div>{order.delivery_address.address_line1}</div>
                                            {order.delivery_address.address_line2 && (
                                                <div>{order.delivery_address.address_line2}</div>
                                            )}
                                            <div style={{ fontWeight: 500, color: '#333' }}>
                                                {order.delivery_address.postal_city}, {order.delivery_address.district}
                                            </div>
                                            <div style={{ color: '#666' }}>
                                                {order.delivery_address.province} {order.delivery_address.postal_code}
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{ color: '#888' }}>No delivery address recorded</div>
                                    )}
                                </Col>
                            </Row>
                        </Card>

                        {/* 2. Fulfilment & Logistics Contacts */}
                        <Card title="🏢 Fulfilment &amp; Logistics Contacts" size="small" style={{ borderRadius: 8 }}>
                            <Row gutter={[16, 16]}>
                                <Col xs={24} sm={12}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>Branch Details</Text>
                                    {contacts?.branch ? (
                                        <div style={{ marginTop: 4 }}>
                                            <div style={{ fontWeight: 600 }}>
                                                {contacts.branch.name} ({contacts.branch.code})
                                            </div>
                                            <div style={{ fontSize: 13, color: '#555' }}>
                                                Manager: {contacts.branch.manager_name || '—'}
                                            </div>
                                            {contacts.branch.phone && (
                                                <Space size={8} style={{ marginTop: 4 }}>
                                                    <a href={telHref(contacts.branch.phone)}>
                                                        <PhoneOutlined /> {contacts.branch.phone}
                                                    </a>
                                                    <a href={waHref(contacts.branch.phone)} target="_blank" rel="noreferrer">
                                                        <WhatsAppOutlined style={{ color: '#25D366' }} /> WhatsApp
                                                    </a>
                                                </Space>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ color: '#888', marginTop: 4 }}>No branch assigned</div>
                                    )}
                                </Col>
                                <Col xs={24} sm={12}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>Assigned Courier Rider</Text>
                                    {contacts?.rider?.state === 'assigned' ? (
                                        <div style={{ marginTop: 4 }}>
                                            <div style={{ fontWeight: 600 }}>
                                                {contacts.rider.name || 'Courier Assigned'}
                                            </div>
                                            <div style={{ fontSize: 12, color: '#666' }}>
                                                Waybill: {contacts.rider.waybill || 'Pending'} · {contacts.rider.tracking_status || ''}
                                            </div>
                                            {contacts.rider.phone && (
                                                <Space size={8} style={{ marginTop: 4 }}>
                                                    <a href={telHref(contacts.rider.phone)}>
                                                        <PhoneOutlined /> {contacts.rider.phone}
                                                    </a>
                                                    <a href={waHref(contacts.rider.phone)} target="_blank" rel="noreferrer">
                                                        <WhatsAppOutlined style={{ color: '#25D366' }} /> WhatsApp
                                                    </a>
                                                </Space>
                                            )}
                                        </div>
                                    ) : (
                                        <div style={{ color: '#888', marginTop: 4 }}>
                                            ⏳ Rider: Pending Assignment (Not dispatched yet)
                                        </div>
                                    )}
                                </Col>
                            </Row>
                        </Card>

                        {/* 3. Items Table with Product Thumbnail Images */}
                        <Card
                            title={
                                <Space>
                                    <span>🛍️ Ordered Items</span>
                                    <Tag color="blue">{order.items?.length || 0} items</Tag>
                                </Space>
                            }
                            size="small"
                            style={{ borderRadius: 8 }}
                            styles={{ body: { padding: 0 } }}
                        >
                            <Table
                                columns={itemColumns}
                                dataSource={order.items}
                                rowKey="order_item_id"
                                pagination={false}
                                size="middle"
                            />
                        </Card>

                        {/* 4. Pricing Breakdown */}
                        <Card title="💰 Pricing Breakdown" size="small" style={{ borderRadius: 8 }}>
                            <Descriptions column={{ xs: 1, sm: 2 }} size="small" bordered>
                                <Descriptions.Item label="Subtotal">
                                    {formatLKR(order.pricing.subtotal)}
                                </Descriptions.Item>
                                <Descriptions.Item label="Tax Amount">
                                    {formatLKR(order.pricing.tax_amount)}
                                </Descriptions.Item>
                                <Descriptions.Item label="Shipping / Delivery Fee">
                                    {formatLKR(order.pricing.shipping_amount)}
                                </Descriptions.Item>
                                <Descriptions.Item label="Discount">
                                    <span style={{ color: '#52c41a' }}>−{formatLKR(order.pricing.discount_amount)}</span>
                                </Descriptions.Item>
                                {order.pricing.wallet_deduction > 0 && (
                                    <Descriptions.Item label="Wallet Deduction">
                                        <span style={{ color: '#722ed1' }}>−{formatLKR(order.pricing.wallet_deduction)}</span>
                                    </Descriptions.Item>
                                )}
                                {order.pricing.cashback_earned > 0 && (
                                    <Descriptions.Item label="Cashback Earned">
                                        <span style={{ color: '#faad14' }}>+{formatLKR(order.pricing.cashback_earned)}</span>
                                    </Descriptions.Item>
                                )}
                            </Descriptions>
                            <div
                                style={{
                                    marginTop: 12,
                                    padding: '12px 16px',
                                    background: '#fafafa',
                                    borderRadius: 6,
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    border: '1px solid #f0f0f0',
                                }}
                            >
                                <Text strong style={{ fontSize: 16 }}>
                                    Total Amount Payable:
                                </Text>
                                <Title level={3} style={{ margin: 0, color: '#1677ff' }}>
                                    {formatLKR(order.pricing.total_amount)}
                                </Title>
                            </div>
                        </Card>
                    </Space>
                </Col>

                {/* RIGHT COLUMN: Actions, Courier, Returns, Audit Trail, Escalation Tickets */}
                <Col xs={24} lg={10}>
                    <Space orientation="vertical" size={20} style={{ width: '100%' }}>
                        {/* 1. Status & Operational Actions */}
                        <Card title="⚡ Order Actions &amp; Lifecycle" size="small" style={{ borderRadius: 8 }}>
                            <div style={{ marginBottom: 12 }}>
                                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 6 }}>
                                    Available Stage Transitions:
                                </Text>
                                {actions.length > 0 ? (
                                    <Space wrap size={8}>
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
                                    <Alert
                                        type="info"
                                        showIcon
                                        message="No status actions available for your role in this stage."
                                    />
                                )}
                            </div>
                        </Card>

                        {/* 2. SribeesExpress Courier Shipment */}
                        <Card title="🚚 SribeesExpress Shipment" size="small" style={{ borderRadius: 8 }}>
                            <CourierPanel order={order} onChanged={invalidateOrder} />
                        </Card>

                        {/* 3. Customer Return Claim & Decisions (if active or requested) */}
                        {(order.status === 'return_requested' ||
                            order.return_requested_at != null) && (
                            <div id="return-claim-review">
                                <Card
                                    title="🔄 Return Claim Review"
                                    size="small"
                                    style={{ borderRadius: 8, borderColor: '#faad14' }}
                                >
                                <Descriptions column={1} size="small" bordered>
                                    <Descriptions.Item label="Reason">
                                        <b>{order.return_reason || '—'}</b>
                                    </Descriptions.Item>
                                    {order.return_comments && (
                                        <Descriptions.Item label="Customer Notes">
                                            {order.return_comments}
                                        </Descriptions.Item>
                                    )}
                                    <Descriptions.Item label="Requested At">
                                        {order.return_requested_at
                                            ? slt(order.return_requested_at).format('MMM DD, YYYY HH:mm')
                                            : '—'}
                                    </Descriptions.Item>
                                </Descriptions>

                                {/* Customer photos */}
                                {order.return_images && order.return_images.length > 0 && (
                                    <div style={{ marginTop: 12 }}>
                                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                                            Proof Photos Attached:
                                        </Text>
                                        <Image.PreviewGroup>
                                            <Space wrap size={8}>
                                                {order.return_images.map((img, idx) => (
                                                    <Image
                                                        key={idx}
                                                        src={img}
                                                        width={64}
                                                        height={64}
                                                        style={{ objectFit: 'cover', borderRadius: 6, border: '1px solid #ddd' }}
                                                    />
                                                ))}
                                            </Space>
                                        </Image.PreviewGroup>
                                    </div>
                                )}

                                {/* Reverse Pickup Details if Approved */}
                                {order.status === 'return_approved' && (
                                    <div style={{ marginTop: 12 }}>
                                        <Divider style={{ margin: '10px 0' }}>Reverse Pickup Details</Divider>
                                        {order.return_booking_status === 'failed' ? (
                                            <Alert
                                                type="error"
                                                showIcon
                                                message="Courier reverse booking failed"
                                                description={
                                                    <div>
                                                        <div>{order.return_booking_error || 'Courier unreachable.'}</div>
                                                        <Button
                                                            size="small"
                                                            style={{ marginTop: 6 }}
                                                            loading={retryBookingMutation.isPending}
                                                            onClick={() => retryBookingMutation.mutate(order.order_id)}
                                                        >
                                                            Retry Booking
                                                        </Button>
                                                    </div>
                                                }
                                            />
                                        ) : (
                                            <div>
                                                <Descriptions column={1} size="small" bordered>
                                                    <Descriptions.Item label="Waybill">
                                                        {order.return_waybill_number || '—'}
                                                    </Descriptions.Item>
                                                    <Descriptions.Item label="Status">
                                                        {order.return_tracking_status || 'Awaiting rider pickup'}
                                                    </Descriptions.Item>
                                                    {order.return_fee != null && (
                                                        <Descriptions.Item label="Return Fee">
                                                            {formatLKR(order.return_fee)}
                                                        </Descriptions.Item>
                                                    )}
                                                </Descriptions>
                                                {order.return_handover_code && (
                                                    <div
                                                        style={{
                                                            marginTop: 10,
                                                            padding: 12,
                                                            background: '#f6ffed',
                                                            border: '1px solid #b7eb8f',
                                                            borderRadius: 6,
                                                            textAlign: 'center',
                                                        }}
                                                    >
                                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                                            HANDOVER VERIFICATION CODE
                                                        </Text>
                                                        <div
                                                            style={{
                                                                fontSize: 20,
                                                                fontWeight: 700,
                                                                letterSpacing: 2,
                                                                color: '#389e0d',
                                                            }}
                                                        >
                                                            {order.return_handover_code}
                                                        </div>
                                                        <Button
                                                            type="link"
                                                            size="small"
                                                            loading={regenerateCodeMutation.isPending}
                                                            onClick={confirmRegenerateCode}
                                                        >
                                                            Generate New Code
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Rejection Details if Rejected */}
                                {order.status === 'return_rejected' && (
                                    <div style={{ marginTop: 12 }}>
                                        <Divider style={{ margin: '10px 0' }}>Rejection Details</Divider>
                                        <Alert
                                            type="error"
                                            showIcon
                                            message="Return Claim Rejected"
                                            description={
                                                <div>
                                                    <div style={{ marginTop: 4 }}>
                                                        <strong>Decision Reason:</strong> {order.return_resolution_note || 'No reason specified.'}
                                                    </div>
                                                </div>
                                            }
                                        />
                                    </div>
                                )}

                                {/* Decision Actions if pending */}
                                {canDecideReturn && order.status === 'return_requested' && (
                                    <div style={{ marginTop: 14 }}>
                                        <Divider style={{ margin: '10px 0' }}>Decide Return Claim</Divider>
                                        <Space direction="vertical" style={{ width: '100%' }} size={10}>
                                            <div>
                                                <Text type="secondary" style={{ fontSize: 12 }}>Resolution Type:</Text>
                                                <Select
                                                    style={{ width: '100%', marginTop: 4 }}
                                                    value={returnResolution}
                                                    onChange={setReturnResolution}
                                                    options={[
                                                        {
                                                            value: 'returnless_refund',
                                                            label: 'Returnless Refund (No pickup, refund immediately)',
                                                        },
                                                        {
                                                            value: 'reverse_pickup',
                                                            label: 'Reverse Pickup (Rider collects goods before refund)',
                                                        },
                                                    ]}
                                                />
                                            </div>
                                            <div>
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                    Decision Note <span style={{ color: '#ff4d4f' }}>*(Mandatory for Reject, Optional for Approve)*</span>:
                                                </Text>
                                                <Input.TextArea
                                                    rows={2}
                                                    placeholder="Enter reason for rejection or operational instructions…"
                                                    value={returnNote}
                                                    onChange={(e) => setReturnNote(e.target.value)}
                                                />
                                            </div>
                                            <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
                                                <Button
                                                    danger
                                                    loading={rejectReturnMutation.isPending}
                                                    onClick={confirmRejectReturn}
                                                >
                                                    Reject Claim
                                                </Button>
                                                <Button
                                                    type="primary"
                                                    loading={approveReturnMutation.isPending}
                                                    onClick={confirmApproveReturn}
                                                >
                                                    Approve Claim
                                                </Button>
                                            </Space>
                                        </Space>
                                    </div>
                                )}
                            </Card>
                            </div>
                        )}

                        {/* 4. Status History & Audit Trail */}
                        <Card title="📜 Status History &amp; Audit Trail" size="small" style={{ borderRadius: 8 }}>
                            {order.history && order.history.length > 0 ? (
                                <div style={{ maxHeight: 420, overflowY: 'auto', paddingRight: 6 }}>
                                    <Timeline
                                        style={{ marginTop: 8 }}
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
                                                        <Space wrap size={6}>
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
                                                            <Text type="secondary" style={{ fontSize: 11 }}>
                                                                <ClockCircleOutlined style={{ marginRight: 3 }} />
                                                                {h.created_at ? slt(h.created_at).format('MMM DD, YYYY · hh:mm A') : '—'}
                                                            </Text>
                                                        </Space>
                                                        <div style={{ marginTop: 2 }}>
                                                            <Tag
                                                                icon={isAdmin || isUser ? <UserOutlined /> : <RobotOutlined />}
                                                                color={isAdmin ? 'purple' : isUser ? 'orange' : 'default'}
                                                                style={{ fontSize: 11 }}
                                                            >
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
                        </Card>
                    </Space>
                </Col>
            </Row>

            {/* Escalation Tickets Section - Full Width under main content for maximum readability */}
            <div id="escalation-center" style={{ marginTop: 24 }}>
                <EscalationSection
                    orderId={order.order_id}
                    escalations={order.escalations || []}
                    canDecide={canDecideReturn}
                    onChanged={invalidateOrder}
                />
            </div>

            {/* Emergency Status Override Modal */}
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
                                At least 15 characters required.
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
        </div>
    );
};

export default OrderDetailPage;
