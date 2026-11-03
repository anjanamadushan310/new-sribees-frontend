/**
 * A partially delivered COD order: the customer refused some items at the door,
 * so the rider collected less. Once those items are back at the shop, record
 * which ones (and how many). Their stock goes back on the shelf and Sribees
 * Finance takes the sale off. No refund: the customer paid only for what they took.
 */
import React, { useState } from 'react';
import { Alert, App, InputNumber, Modal, Table, Typography } from 'antd';
import { useMutation } from '@tanstack/react-query';
import { ordersApi } from '../../api/orders.api';
import type { OrderDetail } from '../../api/orders.api';

const { Text } = Typography;

interface Props {
    order: OrderDetail;
    shortfall: number;
    onClose: () => void;
    onDone: () => void;
}

const formatLKR = (value: number): string =>
    `Rs. ${value.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const UndeliveredItemsModal: React.FC<Props> = ({ order, shortfall, onClose, onDone }) => {
    const { message } = App.useApp();
    const [qty, setQty] = useState<Record<string, number>>({});
    const items = order.items ?? [];
    const chosen = Object.entries(qty).filter(([, q]) => q > 0);
    const value = items.reduce((sum, it) => sum + (qty[it.order_item_id] ?? 0) * Number(it.unit_price ?? 0), 0);

    const save = useMutation({
        mutationFn: () =>
            ordersApi.recordUndelivered(
                order.order_id,
                chosen.map(([order_item_id, quantity]) => ({ order_item_id, quantity }))
            ),
        onSuccess: (r) => {
            message.success(r.message);
            onDone();
            onClose();
        },
        onError: (e: unknown) => {
            const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            message.error(detail || 'Could not record the items');
        },
    });

    return (
        <Modal
            open
            title="Items that came back undelivered"
            okText="Record and put back on the shelf"
            onCancel={onClose}
            onOk={() => save.mutate()}
            okButtonProps={{ disabled: chosen.length === 0, loading: save.isPending }}
            width={620}
        >
            <Alert
                type="info"
                showIcon
                style={{ marginBottom: 12 }}
                message={`The rider collected ${formatLKR(shortfall)} less than the order total.`}
                description="Count what actually came back. This is done once."
            />
            <Table
                rowKey="order_item_id"
                size="small"
                pagination={false}
                dataSource={items}
                columns={[
                    { title: 'Item', dataIndex: 'product_name' },
                    { title: 'Ordered', dataIndex: 'quantity', width: 90, align: 'right' },
                    {
                        title: 'Came back',
                        key: 'back',
                        width: 120,
                        render: (_: unknown, it) => (
                            <InputNumber
                                min={0}
                                max={it.quantity}
                                precision={0}
                                value={qty[it.order_item_id] ?? 0}
                                onChange={(v) => setQty((q) => ({ ...q, [it.order_item_id]: Number(v ?? 0) }))}
                            />
                        ),
                    },
                ]}
            />
            <Text type={Math.abs(value - shortfall) < 0.01 ? 'success' : 'warning'} style={{ display: 'block', marginTop: 12 }}>
                Value of what you counted: {formatLKR(value)}
                {Math.abs(value - shortfall) >= 0.01 && ` — the rider was short ${formatLKR(shortfall)}`}
            </Text>
        </Modal>
    );
};

export default UndeliveredItemsModal;
