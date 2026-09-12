/**
 * Printable SribeesExpress shipping label.
 *
 * SribeesExpress has a label builder, but it sits on their staff API behind a
 * staff login — a merchant API key cannot reach it. What it returns is not a
 * rendered label either: it is the same fields this component receives, with
 * their own docs saying the barcode is drawn client-side from `waybill_id` so
 * that paper size, printer model and layout stay out of the API. So the label
 * is rendered here, mirroring their `ShippingLabelOut` field for field — if
 * they ever open the builder to merchants, only the data source changes.
 *
 * Laid out for a 4x6in thermal sticker, the standard courier label size, and
 * printed through an isolated @media print block so the surrounding dashboard
 * chrome never reaches the paper.
 */
import React from 'react';
import { Alert, Button, Modal, Spin, Typography } from 'antd';
import { PrinterOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { ordersApi } from '../../api/orders.api';
import type { CourierLabel } from '../../api/orders.api';
import Code128 from '../../components/common/Code128';

const { Text } = Typography;

const PRINT_STYLES = `
@media print {
  /* Everything but the label is chrome. Hide the app, not just dim it --
     a modal mask that survives into the print wastes toner and can bleed
     grey across a thermal label. */
  body * { visibility: hidden !important; }
  #sxp-label, #sxp-label * { visibility: visible !important; }
  #sxp-label {
    position: fixed; inset: 0; margin: 0;
    width: 4in; height: 6in;
    background: #fff; color: #000;
  }
  .ant-modal-mask, .ant-modal-header, .ant-modal-footer { display: none !important; }
  @page { size: 4in 6in; margin: 0; }
}
`;

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
    <div style={{ display: 'flex', gap: 8, fontSize: 12, lineHeight: 1.5 }}>
        <span style={{ minWidth: 74, color: '#555' }}>{label}</span>
        <span style={{ flex: 1, fontWeight: 500 }}>{children}</span>
    </div>
);

interface ShippingLabelProps {
    orderId: string;
    open: boolean;
    onClose: () => void;
}

const ShippingLabel: React.FC<ShippingLabelProps> = ({ orderId, open, onClose }) => {
    const { data, isLoading, error } = useQuery({
        queryKey: ['admin', 'order', orderId, 'courier-label'],
        queryFn: () => ordersApi.courierLabel(orderId),
        enabled: open && !!orderId,
        retry: false,
    });

    const label: CourierLabel | undefined = data;

    return (
        <Modal
            title="Shipping Label"
            open={open}
            onCancel={onClose}
            width={460}
            footer={
                <Button
                    type="primary"
                    icon={<PrinterOutlined />}
                    disabled={!label}
                    onClick={() => window.print()}
                >
                    Print
                </Button>
            }
        >
            <style>{PRINT_STYLES}</style>

            {isLoading && (
                <div style={{ textAlign: 'center', padding: 40 }}>
                    <Spin />
                </div>
            )}

            {error && (
                <Alert
                    type="warning"
                    showIcon
                    message="No label yet"
                    description={
                        (error as any)?.response?.data?.detail ??
                        'This parcel has no waybill. Request a pickup first.'
                    }
                />
            )}

            {label && (
                <div
                    id="sxp-label"
                    style={{
                        width: '100%',
                        background: '#fff',
                        color: '#000',
                        border: '1px solid #000',
                        padding: 12,
                        fontFamily: 'Arial, Helvetica, sans-serif',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            borderBottom: '2px solid #000',
                            paddingBottom: 6,
                        }}
                    >
                        <div style={{ fontWeight: 700, fontSize: 15 }}>SRIBEES EXPRESS</div>
                        <div style={{ fontSize: 11, textAlign: 'right' }}>
                            {label.order_number}
                            <br />
                            {label.booked_at ? dayjs(label.booked_at).format('DD MMM YYYY') : ''}
                        </div>
                    </div>

                    {/* The one thing on this sticker a scanner reads. */}
                    <div style={{ textAlign: 'center', padding: '10px 0' }}>
                        <Code128 value={label.waybill_id} moduleWidth={2} height={58} />
                    </div>

                    {/* Destination first and largest: it is what a sorter reads
                        at arm's length off a moving belt. */}
                    <div
                        style={{
                            borderTop: '1px solid #000',
                            borderBottom: '1px solid #000',
                            padding: '6px 0',
                            textAlign: 'center',
                        }}
                    >
                        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 1 }}>
                            {label.destination_city ?? label.destination_district ?? '—'}
                        </div>
                        {label.destination_district && label.destination_city && (
                            <div style={{ fontSize: 11 }}>{label.destination_district} District</div>
                        )}
                    </div>

                    <div style={{ padding: '8px 0', borderBottom: '1px dashed #999' }}>
                        <div style={{ fontSize: 10, color: '#555', marginBottom: 2 }}>DELIVER TO</div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{label.recipient_name}</div>
                        <div style={{ fontSize: 12 }}>{label.recipient_address}</div>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{label.recipient_phone}</div>
                    </div>

                    {/* COD is the field a rider must not misread: they are
                        collecting this exact amount at the door. */}
                    {label.is_cod && (
                        <div
                            style={{
                                margin: '8px 0',
                                border: '2px solid #000',
                                padding: '6px 8px',
                                textAlign: 'center',
                            }}
                        >
                            <div style={{ fontSize: 10, letterSpacing: 1 }}>COLLECT ON DELIVERY</div>
                            <div style={{ fontSize: 20, fontWeight: 700 }}>
                                Rs. {Number(label.cod_amount).toLocaleString('en-LK', {
                                    minimumFractionDigits: 2,
                                })}
                            </div>
                        </div>
                    )}

                    {label.requires_handover_code && (
                        <div
                            style={{
                                margin: '8px 0',
                                border: '1px dashed #000',
                                padding: '4px 8px',
                                textAlign: 'center',
                                fontSize: 11,
                                fontWeight: 600,
                            }}
                        >
                            RIDER MUST COLLECT THE CUSTOMER&apos;S HANDOVER CODE
                        </div>
                    )}

                    <div style={{ paddingTop: 6 }}>
                        <Row label="From">
                            {label.sender_name ?? '—'}
                            {label.sender_phone ? ` · ${label.sender_phone}` : ''}
                        </Row>
                        <Row label="Weight">{label.weight_kg} kg</Row>
                        <Row label="Pieces">{label.item_count}</Row>
                        <Row label="Delivery">Rs. {label.delivery_charge}</Row>
                    </div>

                    <div
                        style={{
                            marginTop: 8,
                            paddingTop: 4,
                            borderTop: '1px solid #000',
                            fontSize: 9,
                            textAlign: 'center',
                            color: '#333',
                        }}
                    >
                        {label.waybill_id} · not a proof of payment
                    </div>
                </div>
            )}

            {label && (
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 10 }}>
                    Sized for a 4×6in thermal label. Printing from a normal A4 printer works —
                    the label keeps its own page size.
                </Text>
            )}
        </Modal>
    );
};

export default ShippingLabel;
