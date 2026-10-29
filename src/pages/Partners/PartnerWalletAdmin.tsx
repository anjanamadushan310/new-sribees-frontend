import { useState } from 'react';
import { Alert, App, Button, Card, Form, Input, Modal, Select, Space, Table, Tag, Tabs } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../api/client';
import type { AdminPartner } from '../../api/partners.api';

interface Application { id: string; name: string; email: string; userId: string; status: string; note?: string; }
interface Withdrawal { id: string; partnerId: string; amount: string; status: string; bankName: string; branchName: string; accountName: string; accountNumber: string; paymentReference?: string; }
interface Decision { url: string; title: string; kind: 'upgrade' | 'withdrawal'; decision: string; }
interface Values { master_partner_id?: string; note?: string; payment_reference?: string; }

export default function PartnerWalletAdmin({ partners }: { partners: AdminPartner[] }) {
    const [open, setOpen] = useState(false);
    const [decision, setDecision] = useState<Decision | null>(null);
    const [form] = Form.useForm<Values>();
    const { message } = App.useApp();
    const cache = useQueryClient();
    const applications = useQuery({ queryKey: ['partner-applications'], enabled: open,
        queryFn: async () => (await api.get<{ data: Application[] }>('/admin/partners/applications')).data.data });
    const withdrawals = useQuery({ queryKey: ['partner-withdrawals'], enabled: open,
        queryFn: async () => (await api.get<{ data: Withdrawal[] }>('/admin/partners/withdrawals')).data.data });
    const mutation = useMutation({
        mutationFn: async (values: Values) => api.post(decision!.url, { decision: decision!.decision, ...values }),
        onSuccess: async () => {
            setDecision(null); form.resetFields(); message.success('Decision recorded.');
            await Promise.all([cache.invalidateQueries({ queryKey: ['partner-applications'] }),
                cache.invalidateQueries({ queryKey: ['partner-withdrawals'] }), cache.invalidateQueries({ queryKey: ['admin', 'partners'] })]);
        },
        onError: () => message.error('Could not save the decision. Refresh to check its current status before retrying.'),
    });
    const choose = (kind: Decision['kind'], id: string, value: string, title: string) => {
        form.resetFields(); setDecision({ kind, decision: value, title, url: `/admin/partners/${kind === 'upgrade' ? 'applications' : 'withdrawals'}/${id}/decision` });
    };
    return <Card title="Linked Partner Wallet" style={{ marginTop: 20 }} extra={<Button onClick={() => setOpen(!open)}>{open ? 'Hide approvals' : 'Open approvals'}</Button>}>
        <p>Customer upgrades require Super Admin approval. Withdrawal requests reserve Partner Wallet funds; make the bank transfer separately before marking paid.</p>
        {open && <>
            {(applications.isError || withdrawals.isError) && <Alert type="info" showIcon message="Partner Wallet rollout is not enabled or the service is unavailable." />}
            <Tabs items={[
                { key: 'applications', label: 'Partner applications', children: <Table<Application> rowKey="id" dataSource={applications.data ?? []} loading={applications.isLoading} scroll={{ x: 700 }} columns={[
                    { title: 'Customer', dataIndex: 'name' }, { title: 'Email', dataIndex: 'email' },
                    { title: 'Status', dataIndex: 'status', render: (v: string) => <Tag>{v}</Tag> },
                    { title: 'Actions', render: (_, row) => row.status === 'pending' && <Space><Button onClick={() => choose('upgrade', row.id, 'approve', `Approve ${row.name} as Partner`)}>Approve</Button><Button danger onClick={() => choose('upgrade', row.id, 'reject', 'Reject application')}>Reject</Button></Space> },
                ]} /> },
                { key: 'withdrawals', label: 'Bank withdrawals', children: <Table<Withdrawal> rowKey="id" dataSource={withdrawals.data ?? []} loading={withdrawals.isLoading} scroll={{ x: 900 }} columns={[
                    { title: 'Partner', render: (_, row) => partners.find(p => p.partner_id === row.partnerId)?.full_name ?? row.partnerId },
                    { title: 'Amount (LKR)', dataIndex: 'amount' }, { title: 'Bank details', render: (_, r) => <span>{r.bankName} · {r.branchName}<br />{r.accountName}<br />{r.accountNumber}</span> },
                    { title: 'Status', dataIndex: 'status' },
                    { title: 'Actions', render: (_, row) => row.status === 'pending' && <Space><Button onClick={() => choose('withdrawal', row.id, 'paid', `Record completed bank payment: LKR ${row.amount}`)}>Mark paid</Button><Button danger onClick={() => choose('withdrawal', row.id, 'reject', 'Reject and release reserved funds')}>Reject</Button></Space> },
                ]} /> },
            ]} />
        </>}
        <Modal title={decision?.title} open={!!decision} onCancel={() => !mutation.isPending && setDecision(null)} onOk={() => form.submit()} confirmLoading={mutation.isPending} destroyOnHidden>
            <Form form={form} layout="vertical" onFinish={values => mutation.mutate(values)}>
                {decision?.kind === 'upgrade' && decision.decision === 'approve' && <>
                    <Alert type="info" message="The invite code and existing referred customers are retained. Existing Sribees Wallet credit is not converted to cash." />
                    <Form.Item name="master_partner_id" label="Assign Master Partner (optional)"><Select allowClear options={partners.filter(p => p.is_active && (p.role === 'master_partner' || (!p.role && !p.parent_partner_id))).map(p => ({ value: p.partner_id, label: p.full_name }))} /></Form.Item>
                </>}
                {decision?.kind === 'withdrawal' && decision.decision === 'paid' && <>
                    <Alert type="warning" message="This does not send a bank transfer. Confirm the bank payment has completed before saving." />
                    <Form.Item label="Bank payment reference" name="payment_reference" rules={[{ required: true, whitespace: true }]}><Input maxLength={160} /></Form.Item>
                </>}
                <Form.Item label="Decision note" name="note" rules={decision?.decision === 'reject' ? [{ required: true, whitespace: true }] : []}><Input.TextArea maxLength={500} rows={3} /></Form.Item>
            </Form>
        </Modal>
    </Card>;
}
