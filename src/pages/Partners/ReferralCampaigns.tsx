import { Alert, App, Button, DatePicker, Drawer, Form, Input, InputNumber, Modal, Select, Space, Switch } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import apiClient from '../../api/client';
import type { AdminPartner } from '../../api/partners.api';

type Rules = {
    free_delivery: boolean;
    delivery_uses: number | null;
    valid_days: number;
    min_order: number;
    max_delivery_fee: number;
    coupon_type: 'fixed' | 'percentage';
    coupon_value: number;
    coupon_cap: number;
    coupon_uses: number;
};
type Campaign = {
    id: string;
    name: string;
    scope: 'all' | 'partner' | 'master_team';
    partner_id: string | null;
    active: boolean;
    starts_at: string;
    ends_at: string;
    max_customers: number;
    delivery_budget: number;
    rules: Rules;
};
type Values = Omit<Campaign, 'id' | 'starts_at' | 'ends_at'> & {
    dates: [Dayjs, Dayjs];
};
const key = ['admin', 'referral-promotions'];
const path = '/admin/referral-promotions';
const defaults = {
    scope: 'all', active: false,
    rules: { free_delivery: true, valid_days: 30, coupon_type: 'fixed', coupon_value: 0, coupon_cap: 0, coupon_uses: 1 },
};

export default function ReferralCampaigns({ partners }: { partners: AdminPartner[] }) {
    const [open, setOpen] = useState(false);
    const [extending, setExtending] = useState<Campaign | null>(null);
    const [newEnd, setNewEnd] = useState<Dayjs | null>(null);
    const [editing, setEditing] = useState<string | null>(null);
    const [form] = Form.useForm<Values>();
    const scope = Form.useWatch('scope', form);
    const delivery = Form.useWatch(['rules', 'free_delivery'], form);
    const coupon = Form.useWatch(['rules', 'coupon_value'], form);
    const { message } = App.useApp();
    const client = useQueryClient();
    const campaigns = useQuery({
        queryKey: key, enabled: open,
        queryFn: async () => (await apiClient.get<{ enabled: boolean; data: Campaign[] }>(path)).data,
    });
    const save = useMutation({
        mutationFn: async ({ dates, ...values }: Values) => {
            const body = {
                ...values,
                rules: { ...values.rules, delivery_uses: values.rules.delivery_uses ?? null, coupon_value: values.rules.coupon_value ?? 0 },
                partner_id: values.scope === 'all' ? null : values.partner_id,
                starts_at: dates[0].toISOString(), ends_at: dates[1].toISOString(),
                active: values.active,
                delivery_budget: values.rules.free_delivery ? values.delivery_budget : 0,
            };
            return editing ? apiClient.put(path + '/' + editing, body) : apiClient.post(path, body);
        },
        onSuccess: async () => {
            message.success('Referral campaign saved');
            reset();
            await client.invalidateQueries({ queryKey: key });
        },
        onError: (error: unknown) => {
            const detail = (error as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
            message.error(typeof detail === 'string' ? detail : 'Could not save the campaign. Check the dates, offer and limits.');
        },
    });
    const extension = useMutation({
        mutationFn: ({ id, end }: { id: string; end: Dayjs }) =>
            apiClient.patch(path + '/' + id + '/extend', { ends_at: end.toISOString() }),
        onSuccess: async (_, { id, end }) => {
            const dates = form.getFieldValue('dates');
            if (editing === id && dates?.[0]) form.setFieldValue('dates', [dates[0], end]);
            setExtending(null);
            message.success('Campaign enrollment extended');
            await client.invalidateQueries({ queryKey: key });
        },
        onError: () => message.error('Could not extend the campaign. Reload and check the current end date.'),
    });
    function reset() {
        setEditing(null);
        form.resetFields();
    }
    function edit(campaign: Campaign) {
        setEditing(campaign.id);
        form.setFieldsValue({ ...campaign, dates: [dayjs(campaign.starts_at), dayjs(campaign.ends_at)] });
    }
    return <>
        <Button onClick={() => setOpen(true)}>Referral campaigns</Button>
        <Drawer title="Partner referral campaigns" open={open} onClose={() => setOpen(false)} size="large">
            {campaigns.isError && <Alert type="error" message="Could not load campaigns" />}
            {campaigns.data && !campaigns.data.enabled &&
                <Alert type="info" message="Referral offers are disabled on the server. You can save drafts." />}
            <Space direction="vertical" style={{ marginBlock: 16 }}>
                {campaigns.data?.data.map(campaign => (
                    <Space key={campaign.id} wrap>
                        <Button onClick={() => edit(campaign)}>
                            {campaign.name} · {campaign.active ? 'Enabled' : 'Draft or paused'}
                        </Button>
                        <Button onClick={() => { setNewEnd(null); setExtending(campaign); }}>Extend</Button>
                    </Space>
                ))}
                {editing && <Button onClick={reset}>New campaign</Button>}
            </Space>
            <Form form={form} layout="vertical" initialValues={defaults} onFinish={values => save.mutate(values)}>
                <Form.Item name="name" label="Offer name" rules={[{ required: true }]}><Input maxLength={120} /></Form.Item>
                <Form.Item name="scope" label="Eligible invite codes">
                    <Select onChange={() => form.setFieldValue('partner_id', null)} options={[
                        { value: 'all', label: 'All Partners' },
                        { value: 'partner', label: 'One Partner' },
                        { value: 'master_team', label: 'Master Partner and direct team' },
                    ]} />
                </Form.Item>
                {scope && scope !== 'all' && <Form.Item name="partner_id" label="Partner" rules={[{ required: true }]}>
                    <Select showSearch optionFilterProp="label" options={partners
                        .filter(p => p.is_active && (scope !== 'master_team' || p.role === 'master_partner'))
                        .map(p => ({ value: p.partner_id, label: p.full_name }))} />
                </Form.Item>}
                <Form.Item name="dates" label="Enrollment period" rules={[{ required: true }]}><DatePicker.RangePicker showTime /></Form.Item>
                <Form.Item name="max_customers" label="Maximum enrolled customers" rules={[{ required: true }]}><InputNumber min={1} max={100000} precision={0} /></Form.Item>
                <Form.Item name={['rules', 'valid_days']} label="Valid days after registration" rules={[{ required: true }]}><InputNumber min={1} max={365} precision={0} /></Form.Item>
                <Form.Item name={['rules', 'min_order']} label="Minimum order (LKR)" rules={[{ required: true }]}><InputNumber min={0} precision={2} /></Form.Item>
                <Form.Item name={['rules', 'free_delivery']} label="Free delivery" valuePropName="checked"><Switch /></Form.Item>
                {delivery && <>
                    <Form.Item name={['rules', 'delivery_uses']} label="Free deliveries per customer (blank for unlimited)"><InputNumber min={1} max={1000} precision={0} /></Form.Item>
                    <Form.Item name={['rules', 'max_delivery_fee']} label="Maximum fee per delivery (LKR)" rules={[{ required: true }]}><InputNumber min={0.01} precision={2} /></Form.Item>
                    <Form.Item name="delivery_budget" label="Total delivery budget (LKR)" rules={[{ required: true }]}><InputNumber min={0.01} precision={2} /></Form.Item>
                </>}
                <Form.Item name={['rules', 'coupon_value']} label="Coupon value (0 for no coupon)"><InputNumber min={0} precision={2} /></Form.Item>
                {!!coupon && <>
                    <Form.Item name={['rules', 'coupon_type']} label="Coupon type"><Select options={[
                        { value: 'fixed', label: 'Fixed amount (LKR)' }, { value: 'percentage', label: 'Percentage' },
                    ]} /></Form.Item>
                    <Form.Item name={['rules', 'coupon_cap']} label="Maximum discount per use (LKR)" rules={[{ required: true }]}><InputNumber min={0.01} precision={2} /></Form.Item>
                    <Form.Item name={['rules', 'coupon_uses']} label="Coupon uses per customer" rules={[{ required: true }]}><InputNumber min={1} max={100} precision={0} /></Form.Item>
                </>}
                <Form.Item name="active" label="Enroll new customers" valuePropName="checked"><Switch disabled={!campaigns.data?.enabled && !form.getFieldValue('active')} /></Form.Item>
                <Button type="primary" htmlType="submit" loading={save.isPending} disabled={!campaigns.data}>Save campaign</Button>
            </Form>
        </Drawer>
        <Modal title="Extend campaign enrollment" open={!!extending}
            onCancel={() => setExtending(null)} confirmLoading={extension.isPending}
            okText="Extend" okButtonProps={{ disabled: !extending || !newEnd ||
                !newEnd.isAfter(dayjs(extending.ends_at)) || !newEnd.isAfter(dayjs()) }}
            onOk={() => { if (extending && newEnd) extension.mutate({ id: extending.id, end: newEnd }); }}>
            <p>{extending?.name}</p>
            <p>Current end: {extending && dayjs(extending.ends_at).format('DD MMM YYYY, HH:mm')} (local time)</p>
            <label htmlFor="referral-extension-end">New enrollment end (local time)</label>
            <DatePicker id="referral-extension-end" showTime value={newEnd} onChange={setNewEnd}
                style={{ display: 'block', marginTop: 8 }} />
        </Modal>
    </>;
}
