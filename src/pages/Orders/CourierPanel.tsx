/**
 * SribeesExpress shipment panel — the Branch Manager's dispatch control.
 *
 * Nothing is booked at checkout. Checkout confirms SribeesExpress's delivery
 * quote, which holds the price the customer paid for a week. The parcel is
 * booked the moment the branch says it is **ready for pickup** — the button
 * below, or the same action in the status bar — and that booking carries the
 * agreed quote and how the customer pays: COD with the amount the rider
 * collects, or prepaid with nothing to collect. From then on SribeesExpress
 * drives the status: their rider collecting the parcel is what makes it
 * "Handed to Courier".
 *
 * The panel also covers the bad days:
 *
 * * a booking the courier refused — the reason is shown, and the order stays
 *   Packed rather than claiming a rider is coming;
 * * a webhook was missed, so the dashboard and the customer disagree about
 *   where the parcel is — **Refresh** re-reads that one shipment;
 * * SribeesExpress does not know where this branch is — warned before
 *   dispatch, not discovered when nobody collects.
 *
 * Dispatch is Branch Manager / Super Admin only, matching the fulfilment state
 * machine. Customer Support sees the panel read-only.
 */
import React, { useState } from 'react';
import { Alert, App, Button, Descriptions, Space, Tag, Typography } from 'antd';
import { PrinterOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '../../api/orders.api';
import type { OrderCourier, OrderDetail } from '../../api/orders.api';
import { usePermissions } from '../../hooks/usePermissions';
import ShippingLabel from './ShippingLabel';
import { slt } from '../../utils/datetime';

const { Text } = Typography;

/**
 * SribeesExpress's external status vocabulary — the eight values a merchant
 * can actually receive (contract §8).
 *
 * They track more granular states internally (sorting centre, dispatch,
 * destination hub) and collapse them onto these on the way out, so everything
 * between pickup and out-for-delivery arrives as `in_transit` and consecutive
 * history entries can repeat a status. An unrecognised value falls through to
 * itself rather than being hidden: their vocabulary is theirs to extend.
 */
const TRACKING_META: Record<string, { label: string; color: string }> = {
    booked: { label: 'Booked — awaiting rider', color: 'blue' },
    picked_up: { label: 'Picked up', color: 'cyan' },
    in_transit: { label: 'In transit', color: 'cyan' },
    out_for_delivery: { label: 'Out for delivery', color: 'purple' },
    delivered: { label: 'Delivered', color: 'green' },
    failed: { label: 'Delivery failed', color: 'volcano' },
    returned: { label: 'Returned to us', color: 'orange' },
    cancelled: { label: 'Cancelled', color: 'red' },
};

const trackingTag = (status: string | null) => {
    if (!status) return <Tag>Not tracked yet</Tag>;
    const meta = TRACKING_META[status];
    return <Tag color={meta?.color}>{meta?.label ?? status.replace(/_/g, ' ')}</Tag>;
};

const formatLKR = (value: number): string =>
    `Rs. ${value.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface CourierPanelProps {
    order: OrderDetail;
    /** Re-fetch the order after a dispatch or refresh changed it. */
    onChanged: () => void;
}

const CourierPanel: React.FC<CourierPanelProps> = ({ order, onChanged }) => {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();
    const { isSuperAdmin, isBranchManager } = usePermissions();
    const [labelOpen, setLabelOpen] = useState(false);
    const canDispatch = isSuperAdmin || isBranchManager;

    const courier: OrderCourier | undefined = order.courier;

    const pickupMut = useMutation({
        mutationFn: () => ordersApi.requestPickup(order.order_id),
        onSuccess: (res) => {
            message.success(res.message);
            queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
            onChanged();
        },
        onError: (err: any) =>
            // The backend answers a refusal with the reason it was given —
            // payment not in, or what SribeesExpress said — so show that: it is
            // the only thing that tells the manager what to fix.
            message.error(err.response?.data?.detail || 'Could not reach SribeesExpress.'),
    });

    const refreshMut = useMutation({
        mutationFn: () => ordersApi.refreshCourier(order.order_id),
        onSuccess: (res) => {
            message.success(res.message);
            queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
            onChanged();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Could not reach SribeesExpress.'),
    });

    if (!courier) {
        return <Text type="secondary">No shipment information for this order.</Text>;
    }

    const booked = !!courier.shipment_id;
    const isCod = courier.payment_method === 'cod';
    const repriced =
        courier.quote_amount !== null &&
        Math.abs(courier.quote_amount - order.pricing.shipping_amount) >= 0.005;

    const confirmPickup = () => {
        modal.confirm({
            title: 'Ready for courier pickup?',
            content: (
                <Space direction="vertical" size={6}>
                    <span>
                        <b>{order.order_number}</b> will be booked with SribeesExpress and a rider
                        sent to collect it
                        {courier.branch_pickup_registered ? (
                            <> from {order.branch_name ?? 'this branch'}.</>
                        ) : (
                            <>
                                {' '}
                                — but SribeesExpress does <b>not know this branch's address</b>, so
                                the rider will go to the shared account's address instead. Enter the
                                branch's own key, or register it as an outlet, under Settings →
                                Courier first unless you know that address is right.
                            </>
                        )}
                    </span>
                    <span>
                        {isCod ? (
                            <>
                                <Tag color="gold">COD</Tag> the rider collects{' '}
                                <b>{formatLKR(courier.cod_amount)}</b>
                            </>
                        ) : (
                            <>
                                <Tag color="green">Prepaid</Tag> nothing to collect
                            </>
                        )}
                    </span>
                    {courier.quote_amount !== null && (
                        <Text type="secondary">
                            Delivery charge agreed at checkout: {formatLKR(courier.quote_amount)}
                        </Text>
                    )}
                </Space>
            ),
            okText: 'Book Pickup',
            okButtonProps: { danger: !courier.branch_pickup_registered },
            onOk: () => pickupMut.mutateAsync(),
        });
    };

    return (
        <>
            {/* The courier refused the booking; the order stayed where it was. */}
            {!booked && courier.booking_status === 'failed' && (
                <Alert
                    type="error"
                    showIcon
                    style={{ marginBottom: 12 }}
                    message="The pickup booking was refused"
                    description="SribeesExpress was not reachable, or refused this parcel, when it was marked ready. The order is still Packed. Try again below — the reason is shown if it fails again."
                />
            )}

            {/* Warned before dispatch, not discovered when nobody collects. */}
            {!booked && !courier.branch_pickup_registered && (
                <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 12 }}
                    message="SribeesExpress does not know where this branch is"
                    description="The parcel can still be booked, but the rider will be sent to the shared account's address rather than this branch. A Super Admin can enter this branch's own key, or register it as an outlet, under Settings → Courier."
                />
            )}

            {/* Rider free text. Deliberately not parsed — see contract §8. */}
            {courier.failure_note && (
                <Alert
                    type={courier.will_retry ? 'warning' : 'error'}
                    showIcon
                    style={{ marginBottom: 12 }}
                    message={
                        courier.will_retry
                            ? 'Delivery failed — SribeesExpress will try again'
                            : 'Delivery failed — no further attempts'
                    }
                    description={
                        <>
                            <div>{courier.failure_note}</div>
                            {courier.will_retry === false && (
                                <div style={{ marginTop: 6 }}>
                                    <Text type="secondary">
                                        This parcel is on its way back to the branch. Decide the
                                        refund now rather than waiting for it to arrive.
                                    </Text>
                                </div>
                            )}
                        </>
                    }
                />
            )}

            <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="Payment">
                    {isCod ? (
                        <Space>
                            <Tag color="gold">COD</Tag>
                            <Text>Rider collects {formatLKR(courier.cod_amount)}</Text>
                        </Space>
                    ) : (
                        <Tag color="green">Prepaid — nothing to collect</Tag>
                    )}
                </Descriptions.Item>
                <Descriptions.Item label="Delivery Charge">
                    {courier.quote_amount !== null ? (
                        <Space direction="vertical" size={0}>
                            <Text>{formatLKR(courier.quote_amount)} (SribeesExpress quote)</Text>
                            {repriced && (
                                <Text type="warning" style={{ fontSize: 12 }}>
                                    Re-quoted after the price hold lapsed — the customer paid{' '}
                                    {formatLKR(order.pricing.shipping_amount)}.
                                </Text>
                            )}
                            {!booked && courier.quote_expires_at && (
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    Price held until{' '}
                                    {slt(courier.quote_expires_at).format('MMM DD, HH:mm')}
                                </Text>
                            )}
                        </Space>
                    ) : (
                        <Text type="secondary">No quote on this order (placed before quotes were held)</Text>
                    )}
                </Descriptions.Item>
                {booked && (
                    <>
                        <Descriptions.Item label="Waybill">
                            <Space>
                                <Text copyable strong>
                                    {courier.waybill ?? courier.shipment_id}
                                </Text>
                                {courier.tracking_url && (
                                    <a href={courier.tracking_url} target="_blank" rel="noreferrer">
                                        Track
                                    </a>
                                )}
                            </Space>
                        </Descriptions.Item>
                        <Descriptions.Item label="Courier Status">
                            <Space>
                                {trackingTag(courier.tracking_status)}
                                {courier.tracking_updated_at && (
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        {slt(courier.tracking_updated_at).format('MMM DD, HH:mm')}
                                    </Text>
                                )}
                            </Space>
                        </Descriptions.Item>
                        <Descriptions.Item label="Collect From">
                            {courier.pickup_location_name ?? (
                                <Text type="warning">
                                    Shared account address — not this branch
                                </Text>
                            )}
                        </Descriptions.Item>
                        {courier.handover_required && (
                            <Descriptions.Item label="Handover Code">
                                {courier.handover_verified === true ? (
                                    <Tag color="green">Verified by the rider</Tag>
                                ) : (
                                    <Tag color="gold">Awaiting the customer's code</Tag>
                                )}
                            </Descriptions.Item>
                        )}
                        {/* COD: `delivered` alone does not mean the cash reached us. */}
                        {(courier.cod_collected || courier.cod_collected_amount !== null) && (
                            <Descriptions.Item label="Cash Collected">
                                <Space>
                                    {courier.cod_collected ? (
                                        <Tag color="green">
                                            {courier.cod_collected_amount !== null
                                                ? formatLKR(courier.cod_collected_amount)
                                                : 'Collected'}
                                        </Tag>
                                    ) : (
                                        <Tag color="gold">Not collected</Tag>
                                    )}
                                    {courier.cod_collected && (
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            {courier.remittance_id
                                                ? `Remitted to us (run #${courier.remittance_id})`
                                                : 'Not yet remitted to us'}
                                        </Text>
                                    )}
                                </Space>
                            </Descriptions.Item>
                        )}
                    </>
                )}
            </Descriptions>

            {!booked && (
                <Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                    Not booked with SribeesExpress yet — it is booked when the order is marked
                    ready for pickup.
                </Text>
            )}

            {canDispatch && (
                <Space style={{ marginTop: 12 }} wrap>
                    {courier.can_request_pickup && (
                        <Button
                            type="primary"
                            icon={<SendOutlined />}
                            loading={pickupMut.isPending}
                            onClick={confirmPickup}
                        >
                            {order.status === 'packed' ? 'Ready for Courier Pickup' : 'Retry Booking'}
                        </Button>
                    )}
                    {courier.can_refresh_tracking && (
                        <Button
                            icon={<ReloadOutlined />}
                            loading={refreshMut.isPending}
                            onClick={() => refreshMut.mutate()}
                        >
                            Refresh Tracking
                        </Button>
                    )}
                    {/* The sticker that goes on the parcel. Only once there is
                        a waybill to put on it. */}
                    {booked && (
                        <Button icon={<PrinterOutlined />} onClick={() => setLabelOpen(true)}>
                            Print Label
                        </Button>
                    )}
                </Space>
            )}

            <ShippingLabel
                orderId={order.order_id}
                open={labelOpen}
                onClose={() => setLabelOpen(false)}
            />
        </>
    );
};

export default CourierPanel;
