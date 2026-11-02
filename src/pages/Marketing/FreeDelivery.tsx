/**
 * Free Delivery (Super Admin)
 *
 * Branches: switch the offer on or off per branch, with its months and minimum
 * order. It covers everyone that branch delivers to, and the months count from
 * the moment it is switched on, so switching off and on again restarts them.
 *
 * Chosen customers: give named customers free delivery until a chosen date.
 */
import React, { useState } from 'react';
import {
    Alert,
    App,
    Button,
    Card,
    DatePicker,
    Form,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Select,
    Space,
    Switch,
    Table,
    Tag,
    Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import { branchesApi } from '../../api/branches.api';
import { customersApi } from '../../api/customers.api';
import {
    freeDeliveryApi,
    type BranchOffer,
    type BranchOfferPayload,
    type FreeDeliveryGrant,
} from '../../api/freeDelivery.api';

const BRANCHES_KEY = ['free-delivery', 'branches'];
const GRANTS_KEY = ['free-delivery', 'grants'];

const day = (value: string | null) => (value ? dayjs(value).format('YYYY-MM-DD') : '-');

/** One branch's settings, editable until saved. */
const OfferDraft: React.FC<{
    offer: BranchOffer;
    saving: boolean;
    onSave: (payload: BranchOfferPayload) => void;
}> = ({ offer, saving, onSave }) => {
    const [months, setMonths] = useState(offer.months);
    const [minOrder, setMinOrder] = useState(offer.min_order);
    const changed = months !== offer.months || minOrder !== offer.min_order;
    return (
        <Space wrap>
            <InputNumber
                aria-label={`Months for ${offer.branch_name}`}
                min={1}
                max={24}
                value={months}
                addonAfter="months"
                onChange={(v) => setMonths(v ?? 1)}
            />
            <InputNumber
                aria-label={`Minimum order for ${offer.branch_name}`}
                min={0}
                value={minOrder}
                addonBefore="Min. order Rs"
                onChange={(v) => setMinOrder(v ?? 0)}
            />
            <Button
                disabled={!changed}
                loading={saving}
                onClick={() => onSave({ enabled: offer.enabled, months, min_order: minOrder })}
            >
                Save
            </Button>
        </Space>
    );
};

interface GrantForm {
    user_ids: string[];
    ends_at: Dayjs;
    branch_id?: string;
    min_order?: number;
    note?: string;
}

const GrantModal: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [form] = Form.useForm<GrantForm>();
    const [search, setSearch] = useState('');
    const customers = useQuery({
        queryKey: ['free-delivery', 'customers', search],
        queryFn: () => customersApi.list({ search, limit: 20 }),
        enabled: open && search.trim().length >= 2,
    });
    const branches = useQuery({ queryKey: ['branches'], queryFn: branchesApi.list, enabled: open });
    const create = useMutation({
        mutationFn: (values: GrantForm) =>
            freeDeliveryApi.createGrants({
                user_ids: values.user_ids,
                ends_at: values.ends_at.endOf('day').toISOString(),
                branch_id: values.branch_id,
                min_order: values.min_order ?? 0,
                note: values.note,
            }),
        onSuccess: (granted) => {
            message.success(`Free delivery given to ${granted} customer(s)`);
            queryClient.invalidateQueries({ queryKey: GRANTS_KEY });
            form.resetFields();
            onClose();
        },
        onError: () => message.error('Could not give free delivery. Try again.'),
    });
    return (
        <Modal
            title="Give free delivery to customers"
            open={open}
            onCancel={onClose}
            okText="Give free delivery"
            confirmLoading={create.isPending}
            onOk={() => form.submit()}
            destroyOnHidden
        >
            <Form form={form} layout="vertical" onFinish={(values) => create.mutate(values)}>
                <Form.Item name="user_ids" label="Customers" rules={[{ required: true, message: 'Choose at least one customer' }]}>
                    <Select
                        mode="multiple"
                        showSearch
                        filterOption={false}
                        onSearch={setSearch}
                        loading={customers.isFetching}
                        placeholder="Search by name, phone or email"
                        options={(customers.data?.customers ?? []).map((c) => ({
                            value: c.user_id,
                            label: `${c.full_name ?? c.email} ${c.phone ?? ''}`.trim(),
                        }))}
                    />
                </Form.Item>
                <Form.Item name="ends_at" label="Free until" rules={[{ required: true, message: 'Choose the last day' }]}>
                    <DatePicker
                        style={{ width: '100%' }}
                        disabledDate={(d) => d.isBefore(dayjs(), 'day')}
                    />
                </Form.Item>
                <Form.Item name="branch_id" label="Branch" extra="Leave empty for every branch">
                    <Select
                        allowClear
                        placeholder="Every branch"
                        options={(branches.data ?? []).map((b) => ({ value: b.branch_id, label: b.name }))}
                    />
                </Form.Item>
                <Form.Item name="min_order" label="Minimum order (Rs)">
                    <InputNumber min={0} style={{ width: '100%' }} placeholder="0 = no minimum" />
                </Form.Item>
                <Form.Item name="note" label="Note">
                    <Input maxLength={200} placeholder="Why this customer (only admins see this)" />
                </Form.Item>
            </Form>
        </Modal>
    );
};

const FreeDelivery: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [granting, setGranting] = useState(false);
    const branches = useQuery({ queryKey: BRANCHES_KEY, queryFn: freeDeliveryApi.branches });
    const grants = useQuery({ queryKey: GRANTS_KEY, queryFn: freeDeliveryApi.grants });

    const save = useMutation({
        mutationFn: ({ branchId, payload }: { branchId: string; payload: BranchOfferPayload }) =>
            freeDeliveryApi.saveBranch(branchId, payload),
        onSuccess: () => {
            message.success('Saved');
            queryClient.invalidateQueries({ queryKey: BRANCHES_KEY });
        },
        onError: () => message.error('Could not save. Try again.'),
    });
    const revoke = useMutation({
        mutationFn: freeDeliveryApi.revokeGrant,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: GRANTS_KEY }),
        onError: () => message.error('Could not stop it. Try again.'),
    });

    const branchColumns: ColumnsType<BranchOffer> = [
        { title: 'Branch', dataIndex: 'branch_name' },
        {
            title: 'Offer',
            key: 'enabled',
            render: (_, offer) => (
                <Popconfirm
                    title={offer.enabled ? 'Switch this offer off?' : 'Switch this offer on?'}
                    description={
                        offer.enabled
                            ? 'Everyone in this branch pays delivery again from now.'
                            : `Everyone in this branch gets free delivery for ${offer.months} months from now.`
                    }
                    onConfirm={() =>
                        save.mutate({
                            branchId: offer.branch_id,
                            payload: { enabled: !offer.enabled, months: offer.months, min_order: offer.min_order },
                        })
                    }
                >
                    <Switch aria-label={`Free delivery in ${offer.branch_name}`} checked={offer.enabled} />
                </Popconfirm>
            ),
        },
        {
            title: 'Settings',
            key: 'settings',
            render: (_, offer) => (
                <OfferDraft
                    key={`${offer.months}-${offer.min_order}`}
                    offer={offer}
                    saving={save.isPending}
                    onSave={(payload) => save.mutate({ branchId: offer.branch_id, payload })}
                />
            ),
        },
        {
            title: 'Period',
            key: 'period',
            render: (_, offer) => {
                if (!offer.enabled) return <Tag>Off</Tag>;
                if (offer.expired) return <Tag color="orange">Ended {day(offer.ends_at)}</Tag>;
                return <Tag color="green">{`${day(offer.enabled_at)} to ${day(offer.ends_at)}`}</Tag>;
            },
        },
    ];

    const grantColumns: ColumnsType<FreeDeliveryGrant> = [
        { title: 'Customer', dataIndex: 'customer' },
        { title: 'Phone', dataIndex: 'phone' },
        { title: 'Branch', dataIndex: 'branch_name', render: (name: string | null) => name ?? 'Every branch' },
        { title: 'Free until', dataIndex: 'ends_at', render: day },
        { title: 'Min. order', dataIndex: 'min_order', render: (v: number) => (v ? `Rs ${v}` : '-') },
        { title: 'Note', dataIndex: 'note' },
        {
            title: 'Status',
            key: 'status',
            render: (_, grant) => {
                if (grant.revoked_at) return <Tag>Stopped</Tag>;
                if (dayjs(grant.ends_at).isBefore(dayjs())) return <Tag>Ended</Tag>;
                return (
                    <Popconfirm title="Stop free delivery for this customer?" onConfirm={() => revoke.mutate(grant.grant_id)}>
                        <Button size="small" danger>Stop</Button>
                    </Popconfirm>
                );
            },
        },
    ];

    return (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div>
                <Typography.Title level={3} style={{ marginBottom: 4 }}>Free Delivery</Typography.Title>
                <Typography.Text type="secondary">
                    The customer pays no delivery. The courier is still paid, and the business carries that cost.
                </Typography.Text>
            </div>
            {(branches.isError || grants.isError) && <Alert type="error" showIcon message="Could not load free delivery." />}
            <Card title="Branches">
                <Table
                    rowKey="branch_id"
                    columns={branchColumns}
                    dataSource={branches.data}
                    loading={branches.isLoading}
                    pagination={false}
                    scroll={{ x: true }}
                />
            </Card>
            <Card
                title="Chosen customers"
                extra={<Button type="primary" onClick={() => setGranting(true)}>Give free delivery</Button>}
            >
                <Table
                    rowKey="grant_id"
                    columns={grantColumns}
                    dataSource={grants.data}
                    loading={grants.isLoading}
                    scroll={{ x: true }}
                />
            </Card>
            <GrantModal open={granting} onClose={() => setGranting(false)} />
        </Space>
    );
};

export default FreeDelivery;
