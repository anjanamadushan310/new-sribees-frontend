/**
 * SribeesExpress shipment panel — the Branch Manager's dispatch control.
 *
 * The parcel is booked automatically when an order is confirmed, so on a good
 * day this panel is a read-out: waybill, where the rider was told to collect,
 * and how far along the parcel is. It earns its place on the bad days, which
 * are the ones a branch actually has to handle:
 *
 * * the booking failed (courier outage, an address that never resolved to a
 *   serviceable city) and nothing retries it — **Request Pickup** is that retry;
 * * a webhook was missed, so the dashboard and the customer disagree about
 *   where the parcel is — **Refresh** re-reads that one shipment;
 * * the branch was never registered as a pickup location, so the rider is
 *   being sent to another branch's address — warned before dispatch, not
 *   discovered when the parcel is not collected.
 *
 * Dispatch is Branch Manager / Super Admin only, matching the fulfilment state
 * machine. Customer Support sees the panel read-only: they hold orders:update
 * so they can annotate and escalate, not so they can send a rider.
 */
import React, { useState } from 'react';
import { Alert, App, Button, Descriptions, Space, Tag, Typography } from 'antd';
import { CarOutlined, PrinterOutlined, ReloadOutlined, SendOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '../../api/orders.api';
import type { OrderCourier, OrderDetail } from '../../api/orders.api';
import { usePermissions } from '../../hooks/usePermissions';
import ShippingLabel from './ShippingLabel';

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
    booked: { label: 'Booked', color: 'blue' },
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
            // The backend answers a courier refusal with the reason it was
            // given, so show that rather than a generic failure — it is the
            // only thing that tells the manager what to fix.
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

    const confirmPickup = () => {
        modal.confirm({
            title: 'Request pickup from SribeesExpress?',
            content: (
                <span>
                    A rider will be sent to collect <b>{order.order_number}</b>
                    {courier.branch_pickup_registered ? (
                        <> from {order.branch_name ?? 'this branch'}.</>
                    ) : (
                        <>
                            {' '}
                            — but this branch is <b>not registered</b> as a pickup location, so
                            SribeesExpress will send the rider to the account's default address
                            instead. Register it under Settings → Courier first unless you know
                            that address is right.
                        </>
                    )}
                </span>
            ),
            okText: 'Request Pickup',
            okButtonProps: { danger: !courier.branch_pickup_registered },
            onOk: () => pickupMut.mutateAsync(),
        });
    };

    return (
        <>
            {/* The booking failed and nothing retries it on its own. */}
            {!booked && courier.booking_status === 'failed' && (
                <Alert
                    type="error"
                    showIcon
                    style={{ marginBottom: 12 }}
                    message="Automatic booking failed"
                    description="SribeesExpress was not reachable, or refused this parcel, when the order was confirmed. Nothing retries it automatically — use Request Pickup below, and the reason will be shown if it fails again."
                />
            )}

            {/* Warned before dispatch, not discovered when nobody collects. */}
            {!booked && !courier.branch_pickup_registered && (
                <Alert
                    type="warning"
                    showIcon
                    style={{ marginBottom: 12 }}
                    message="This branch has no registered pickup location"
                    description="The parcel can still be booked, but the rider will be sent to the account's default address rather than this branch. A Super Admin can register it under Settings → Courier."
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

            {booked ? (
                <Descriptions column={1} size="small" bordered>
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
                                    {dayjs(courier.tracking_updated_at).format('MMM DD, HH:mm')}
                                </Text>
                            )}
                        </Space>
                    </Descriptions.Item>
                    <Descriptions.Item label="Collect From">
                        {courier.pickup_location_name ?? (
                            <Text type="warning">
                                Account default address — not this branch
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
                </Descriptions>
            ) : (
                <Text type="secondary">
                    No parcel booked with SribeesExpress yet.
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
                            Request Pickup
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

            {/* A booked parcel still has to physically leave, and only the
                person who hands it over can say it did — that is the status
                machine's `handed_to_courier`, not anything SribeesExpress
                tells us. Say so, so nobody waits for it to happen by itself. */}
            {booked && canDispatch && order.status === 'packed' && (
                <Alert
                    type="info"
                    showIcon
                    icon={<CarOutlined />}
                    style={{ marginTop: 12 }}
                    message="Mark it handed over once the rider has the parcel"
                    description="The waybill is issued, but the order stays in Packed until someone confirms the rider actually collected it. Use the Handed to Courier action above."
                />
            )}
        </>
    );
};

export default CourierPanel;
