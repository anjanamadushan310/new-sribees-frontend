import { Alert, App, Button, Form, Input, InputNumber, Modal, Table } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';
import type { InventoryItem } from '../../api/inventory.api';
import { apiDetailMessage } from '../../api/referralCommission.api';

type Receipt = {
    lot_code?: string;
    quantity: number;
    purchase_cost?: number;
    listed_price: number;
    selling_price: number;
    expires_on?: string;
};

type Batch = Receipt & {
    batch_id: string;
    received_at: string;
    quantity_received: number;
    remaining: number;
};

type BatchList = { batches: Batch[]; legacy_stock: number; can_receive: boolean };

const formatPrice = (value: number | null) =>
    value == null ? '—' : Number(value).toFixed(2);

export default function StockBatchesModal({
    item,
    onClose,
}: {
    item: InventoryItem;
    onClose: () => void;
}) {
    const { message } = App.useApp();
    const cache = useQueryClient();
    const [form] = Form.useForm<Receipt>();
    const path = `/admin/inventory/${item.inventory_id}/batches`;
    const key = ['admin', 'inventory', 'batches', item.inventory_id];
    const batches = useQuery({
        queryKey: key,
        queryFn: async () => (await apiClient.get<BatchList>(path)).data,
    });
    const receive = useMutation({
        mutationFn: (receipt: Receipt) => apiClient.post(path, {
            ...receipt,
            lot_code: receipt.lot_code?.trim() || null,
            expires_on: receipt.expires_on || null,
        }),
        onSuccess: () => {
            form.resetFields();
            void cache.invalidateQueries({ queryKey: ['admin', 'inventory'] });
            message.success('Stock batch received.');
        },
        onError: (error) => message.error(apiDetailMessage(error) ?? 'Could not receive stock.'),
    });

    return (
        <Modal open title={`Stock batches · ${item.product_name}`} width={850} footer={null}
            onCancel={onClose}>
            <p>{item.branch_name} · Orders use existing stock first, then batches in receipt order.</p>
            {batches.isError && <Alert type="error" message="Could not load stock batches." />}
            {!!batches.data?.legacy_stock && (
                <Alert type="info" message={`${batches.data.legacy_stock} units of existing stock use the current inventory price and sell before these batches.`} />
            )}
            <Table<Batch> size="small" rowKey="batch_id" pagination={{ pageSize: 5 }}
                loading={batches.isPending} dataSource={batches.data?.batches ?? []}
                scroll={{ x: 670 }}
                columns={[
                    { title: 'Lot', dataIndex: 'lot_code', render: (value) => value || '—' },
                    { title: 'Received', dataIndex: 'received_at', render: (value: string) => new Date(value).toLocaleDateString() },
                    { title: 'Expiry', dataIndex: 'expires_on', render: (value) => value || '—' },
                    { title: 'Units left', dataIndex: 'remaining', render: (value, batch) => `${value} / ${batch.quantity_received}` },
                    { title: 'Cost (LKR)', dataIndex: 'purchase_cost', render: formatPrice },
                    { title: 'Listed (LKR)', dataIndex: 'listed_price', render: formatPrice },
                    { title: 'Selling (LKR)', dataIndex: 'selling_price', render: formatPrice },
                ]}
            />
            {batches.data?.can_receive === false && (
                <Alert type="info" message="Stock receipts for this branch are managed in Sribees Finance." />
            )}
            {batches.data?.can_receive && (
                <Form form={form} layout="vertical" onFinish={receive.mutate}
                    initialValues={{ listed_price: item.branch_price ?? item.global_price, selling_price: Math.round(item.effective_price * (100 - (item.effective_discount ?? 0))) / 100 }}>
                    <Form.Item name="quantity" label="Units received" rules={[{ required: true }]}>
                        <InputNumber min={1} max={1000000} precision={0} />
                    </Form.Item>
                    <Form.Item name="lot_code" label="Supplier lot code">
                        <Input maxLength={80} />
                    </Form.Item>
                    <Form.Item name="expires_on" label="Expiry date">
                        <Input type="date" />
                    </Form.Item>
                    <Form.Item name="purchase_cost" label="Purchase cost per unit (LKR)">
                        <InputNumber min={0} precision={2} />
                    </Form.Item>
                    <Form.Item name="listed_price" label="Printed price per unit (LKR)" rules={[{ required: true }]}>
                        <InputNumber min={0} precision={2} />
                    </Form.Item>
                    <Form.Item name="selling_price" label="Selling price per unit (LKR)" rules={[{ required: true }]}>
                        <InputNumber min={0} precision={2} />
                    </Form.Item>
                    <Button type="primary" htmlType="submit" loading={receive.isPending}>Receive stock batch</Button>
                </Form>
            )}
        </Modal>
    );
}
