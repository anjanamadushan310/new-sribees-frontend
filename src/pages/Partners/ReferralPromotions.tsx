import { useState } from 'react';
import { Alert, App, Button, Card, Form, Input, InputNumber, Modal, Select, Space, Switch, Table, Tag } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import type { AdminPartner } from '../../api/partners.api';

interface Rules { valid_days: number; free_delivery: boolean; delivery_uses: number | null; min_order: number | string; max_delivery_fee: number | string; coupon_type: 'fixed' | 'percentage'; coupon_value: number | string; coupon_cap: number | string; coupon_uses: number; }
interface Campaign { id: string; name: string; scope: 'all' | 'partner' | 'master_team'; partner_id?: string | null; starts_at: string; ends_at: string; active: boolean; max_customers: number; enrolled_count: number; delivery_budget: string; delivery_spent: string; rules: Rules; }
interface Values extends Omit<Campaign, 'id' | 'enrolled_count' | 'delivery_spent'> { unlimited?: boolean; }
const localDate = (value: string) => { const d = new Date(value); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

export default function ReferralPromotions({ partners }: { partners: AdminPartner[] }) {
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState<Campaign | null | undefined>();
    const [form] = Form.useForm<Values>();
    const scope = Form.useWatch('scope', form);
    const unlimited = Form.useWatch('unlimited', form);
    const free = Form.useWatch(['rules', 'free_delivery'], form);
    const { message } = App.useApp();
    const cache = useQueryClient();
    const query = useQuery({ queryKey: ['referral-promotions'], enabled: open, queryFn: async () => (await api.get<{ data: Campaign[]; enabled: boolean }>('/admin/referral-promotions')).data });
    const mutation = useMutation({ mutationFn: async (values: Values) => {
        const { unlimited: timeOnly, ...body } = values;
        const payload = { ...body, starts_at: new Date(values.starts_at).toISOString(), ends_at: new Date(values.ends_at).toISOString(),
            partner_id: values.scope === 'all' ? null : values.partner_id,
            rules: { ...values.rules, delivery_uses: timeOnly ? null : values.rules.delivery_uses } };
        return editing ? api.put(`/admin/referral-promotions/${editing.id}`, payload) : api.post('/admin/referral-promotions', payload);
    }, onSuccess: async () => { setEditing(undefined); message.success('Campaign saved. Existing customer benefits are unchanged.'); await cache.invalidateQueries({ queryKey: ['referral-promotions'] }); },
    onError: () => message.error('Could not save. Check dates, selected Partner, limits and budget, then retry.') });
    const edit = (row: Campaign | null) => {
        form.resetFields();
        form.setFieldsValue(row ? { ...row, starts_at: localDate(row.starts_at), ends_at: localDate(row.ends_at), unlimited: row.rules.delivery_uses === null } : {
            name: '', scope: 'all', active: false, starts_at: localDate(new Date().toISOString()), ends_at: localDate(new Date(Date.now() + 30 * 86400000).toISOString()), max_customers: 100, delivery_budget: '0', unlimited: false,
            rules: { valid_days: 30, free_delivery: false, delivery_uses: 1, min_order: 0, max_delivery_fee: 1000, coupon_type: 'fixed', coupon_value: 0, coupon_cap: 0, coupon_uses: 1 },
        }); setEditing(row);
    };
    return <Card title="Partner referral promotions" style={{ marginTop: 20 }} extra={<Button onClick={() => setOpen(!open)}>{open ? 'Hide campaigns' : 'Manage campaigns'}</Button>}>
        <p>Only new customers registering after activation and using a Partner code qualify. A direct Partner offer overrides a Master team offer, then the common offer. Existing grants retain their original terms.</p>
        {open && <Space orientation="vertical" style={{ width: '100%' }}>
            {query.isError && <Alert type="info" showIcon message="Campaign configuration service is unavailable. Deploy the coordinated backend migration first." />}
            {query.data && !query.data.enabled && <Alert type="warning" showIcon message="Execution is disabled. You may prepare campaigns, but no benefits will be granted or applied until rollout and Finance checks are complete." />}
            <Button type="primary" disabled={query.isError || query.isLoading} onClick={() => edit(null)}>New referral campaign</Button>
            <Table<Campaign> rowKey="id" dataSource={query.data?.data ?? []} loading={query.isLoading} scroll={{ x: 900 }} columns={[
                { title: 'Campaign', dataIndex: 'name' }, { title: 'Audience', render: (_, r) => r.scope === 'all' ? 'All Partners' : `${r.scope === 'master_team' ? 'Master team' : 'Partner'}: ${partners.find(p => p.partner_id === r.partner_id)?.full_name ?? r.partner_id}` },
                { title: 'Enrollment', render: (_, r) => `${r.enrolled_count} / ${r.max_customers}` }, { title: 'Delivery budget (LKR)', render: (_, r) => `${r.delivery_spent} / ${r.delivery_budget}` },
                { title: 'Enrollment status', render: (_, r) => <Tag color={r.active ? 'green' : 'default'}>{r.active ? 'Enabled within dates' : 'Paused'}</Tag> },
                { title: 'Actions', render: (_, r) => <Button onClick={() => edit(r)}>Edit</Button> },
            ]} />
        </Space>}
        <Modal title={editing ? 'Edit referral campaign' : 'New referral campaign'} open={editing !== undefined} onCancel={() => !mutation.isPending && setEditing(undefined)} onOk={() => form.submit()} confirmLoading={mutation.isPending} width={680} destroyOnHidden>
            <Form form={form} layout="vertical" onFinish={v => mutation.mutate(v)}>
                <Alert type="info" showIcon message="Validity starts when the customer account is registered. 30 days means 30 × 24 hours. Pausing stops new enrollments; existing benefits keep their terms, subject to remaining delivery budget." />
                <Form.Item name="name" label="Customer-facing campaign title" rules={[{ required: true, whitespace: true }]}><Input maxLength={120} /></Form.Item>
                <Form.Item name="scope" label="Eligible Partner codes"><Select options={[{ value: 'all', label: 'All Partners and Master Partners' }, { value: 'partner', label: 'One Partner / Master code only' }, { value: 'master_team', label: 'Master code and their direct Partners' }]} /></Form.Item>
                {scope !== 'all' && <Form.Item name="partner_id" label="Partner / Master Partner" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={partners.filter(p => p.is_active && (scope !== 'master_team' || p.role === 'master_partner' || (!p.role && !p.parent_partner_id))).map(p => ({ value: p.partner_id, label: p.full_name }))} /></Form.Item>}
                <Form.Item name="starts_at" label="Enrollment starts (local time)" rules={[{ required: true }]}><Input type="datetime-local" /></Form.Item>
                <Form.Item name="ends_at" label="Enrollment ends (local time)" rules={[{ required: true }]}><Input type="datetime-local" /></Form.Item>
                <Form.Item name="active" label="Enable new enrollments" valuePropName="checked"><Switch /></Form.Item>
                <Form.Item name="max_customers" label="Maximum new customers" rules={[{ required: true }]}><InputNumber min={1} max={100000} precision={0} /></Form.Item>
                <Form.Item name={['rules', 'valid_days']} label="Benefit validity after customer registration (days)" rules={[{ required: true }]}><InputNumber min={1} max={365} precision={0} /></Form.Item>
                <Form.Item name={['rules', 'min_order']} label="Minimum basket subtotal (LKR)"><InputNumber min={0} precision={2} /></Form.Item>
                <Form.Item name={['rules', 'free_delivery']} label="Include free delivery" valuePropName="checked"><Switch /></Form.Item>
                {free && <>
                    <Form.Item name="unlimited" label="No per-customer count limit during validity period" valuePropName="checked"><Switch /></Form.Item>
                    {!unlimited && <Form.Item name={['rules', 'delivery_uses']} label="Free delivery orders per customer" rules={[{ required: true }]}><InputNumber min={1} max={1000} precision={0} /></Form.Item>}
                    <Form.Item name={['rules', 'max_delivery_fee']} label="Maximum courier fee eligible for fully free delivery (LKR)" rules={[{ required: true }]}><InputNumber min={0.01} precision={2} /></Form.Item>
                </>}
                <Form.Item name="delivery_budget" label="Total delivery campaign budget (LKR)" rules={[{ required: true }]}><InputNumber min={0} precision={2} /></Form.Item>
                <Form.Item name={['rules', 'coupon_type']} label="Coupon type"><Select options={[{ value: 'fixed', label: 'Fixed LKR discount' }, { value: 'percentage', label: 'Percentage discount' }]} /></Form.Item>
                <Form.Item name={['rules', 'coupon_value']} label="Coupon value (0 = no coupon)"><InputNumber min={0} precision={2} /></Form.Item>
                <Form.Item name={['rules', 'coupon_cap']} label="Maximum coupon discount per order (LKR)"><InputNumber min={0} precision={2} /></Form.Item>
                <Form.Item name={['rules', 'coupon_uses']} label="Coupon uses per customer"><InputNumber min={1} max={100} precision={0} /></Form.Item>
            </Form>
        </Modal>
    </Card>;
}
