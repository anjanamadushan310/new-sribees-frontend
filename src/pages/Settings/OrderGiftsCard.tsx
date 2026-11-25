import { useEffect, useState } from 'react';
import { Alert, App, Button, Card, Form, InputNumber, Select, Space, Switch } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';
import { productsApi } from '../../api/products.api';

type GiftRule = {
    enabled: boolean;
    minimum: number | string;
    items: { product_id: string; quantity: number }[];
};

const path = '/admin/settings/order-gifts';
const key = ['order-gifts'];

export default function OrderGiftsCard() {
    const { message } = App.useApp();
    const cache = useQueryClient();
    const [form] = Form.useForm<GiftRule>();
    const [search, setSearch] = useState('');
    const [productSearch, setProductSearch] = useState('');
    useEffect(() => {
        const timeout = window.setTimeout(() => setProductSearch(search.trim()), 250);
        return () => window.clearTimeout(timeout);
    }, [search]);

    const rule = useQuery({
        queryKey: key,
        queryFn: async () => (await apiClient.get<{ data: GiftRule; names: Record<string, string> }>(path)).data,
    });
    const products = useQuery({
        queryKey: ['gift-products', productSearch],
        enabled: productSearch.length >= 2,
        queryFn: () => productsApi.list({ search: productSearch, is_active: true, limit: 20 }),
    });
    useEffect(() => {
        if (rule.data) {
            form.setFieldsValue({ ...rule.data.data, minimum: Number(rule.data.data.minimum) });
        }
    }, [form, rule.data]);

    const names = { ...rule.data?.names };
    for (const product of products.data?.products ?? []) {
        if (!product.sold_by_weight) names[product.product_id] = product.name;
    }
    const save = useMutation({
        mutationFn: (values: GiftRule) => apiClient.put(path, values),
        onSuccess: () => {
            void cache.invalidateQueries({ queryKey: key });
            message.success('Order gifts saved.');
        },
        onError: (error) => {
            const detail = (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
            message.error(typeof detail === 'string' ? detail : 'Check the minimum, product selection and quantities.');
        },
    });

    return (
        <Card title="Order gifts" style={{ marginTop: 16 }}>
            <Alert type="info" showIcon message="Gifts apply to the value of products after coupon discounts. Delivery fees and wallet payments are excluded."
                style={{ marginBottom: 16 }} />
            {rule.isError && <Alert type="error" message="Gift settings could not be loaded." />}
            <Form form={form} layout="vertical" disabled={rule.isPending || rule.isError || save.isPending} onFinish={save.mutate}
                initialValues={{ enabled: false, minimum: 0, items: [] }}>
                <Form.Item name="enabled" label="Enable automatic gifts" valuePropName="checked"><Switch /></Form.Item>
                <Form.Item name="minimum" label="Minimum product total (LKR)" rules={[{ required: true }]}>
                    <InputNumber min={0} max={99999999.99} precision={2} />
                </Form.Item>
                <Form.List name="items">
                    {(fields, { add, remove }) => (
                        <>
                            {fields.map(({ key: rowKey, name }) => (
                                <Space key={rowKey} wrap align="baseline">
                                    <Form.Item name={[name, 'product_id']} label="Gift product" rules={[{ required: true }]}>
                                        <Select showSearch filterOption={false} onSearch={setSearch}
                                            style={{ width: 280 }} placeholder="Search by name or SKU"
                                            loading={products.isFetching}
                                            options={Object.entries(names).map(([value, label]) => ({ value, label }))} />
                                    </Form.Item>
                                    <Form.Item name={[name, 'quantity']} label="Quantity" rules={[{ required: true }]}>
                                        <InputNumber min={1} max={20} precision={0} />
                                    </Form.Item>
                                    <Button danger onClick={() => remove(name)}>Remove</Button>
                                </Space>
                            ))}
                            <Button onClick={() => add({ quantity: 1 })} disabled={fields.length >= 10}>Add gift product</Button>
                        </>
                    )}
                </Form.List>
                <div style={{ marginTop: 16 }}>
                    <Button type="primary" htmlType="submit" loading={save.isPending}>Save order gifts</Button>
                </div>
            </Form>
        </Card>
    );
}
