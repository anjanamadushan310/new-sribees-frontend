/**
 * Partner Management (Super Admin only)
 *
 * CRUD for the professional referral team, plus a per-partner commission
 * ledger with an out-of-band "mark as paid" action. Partners have no
 * wallet — settlement happens by bank transfer etc, and this screen is
 * where that gets recorded so "Ready" money doesn't sit unaccounted for.
 *
 * Structurally a copy of Users/AdminUserList.tsx (table + create/edit
 * modal); the commission drawer is the one thing that page doesn't need.
 */
import React, { useState } from 'react';
import {
    Card,
    Table,
    Button,
    Space,
    Tag,
    Input,
    Modal,
    Form,
    App,
    Typography,
    Popconfirm,
    Drawer,
    Alert,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    SearchOutlined,
    TeamOutlined,
    StopOutlined,
    CheckCircleOutlined,
    WalletOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { partnersApi } from '../../api/partners.api';
import type {
    AdminPartner,
    CreatePartnerPayload,
    UpdatePartnerPayload,
    PartnerCommission,
} from '../../api/partners.api';

const { Title, Text } = Typography;

const PARTNERS_KEY = ['admin', 'partners'];

const money = (v: number) =>
    `Rs ${v.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const shortDate = (v: string | null) => (v ? new Date(v).toLocaleDateString('en-LK') : '—');

const commissionStatusTag = (s: PartnerCommission['status']) => {
    const map: Record<string, { colour: string; label: string }> = {
        pending: { colour: 'gold', label: 'Pending' },
        claimable: { colour: 'green', label: 'Ready' },
        paid: { colour: 'default', label: 'Paid' },
        reversed: { colour: 'red', label: 'Cancelled' },
    };
    const m = map[s] ?? map.pending;
    return <Tag color={m.colour}>{m.label}</Tag>;
};

interface PartnerFormValues {
    full_name: string;
    email: string;
    password?: string;
    phone?: string;
}

const PartnerList: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [form] = Form.useForm<PartnerFormValues>();

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<AdminPartner | null>(null);
    const [search, setSearch] = useState('');
    const [ledgerPartner, setLedgerPartner] = useState<AdminPartner | null>(null);
    const [selectedCommissionIds, setSelectedCommissionIds] = useState<string[]>([]);

    const { data: partners = [], isLoading, isError } = useQuery({
        queryKey: PARTNERS_KEY,
        queryFn: partnersApi.list,
    });

    const invalidate = () => queryClient.invalidateQueries({ queryKey: PARTNERS_KEY });

    const createMutation = useMutation({
        mutationFn: (payload: CreatePartnerPayload) => partnersApi.create(payload),
        onSuccess: () => {
            message.success('Partner created.');
            closeModal();
            invalidate();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to create partner.'),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: UpdatePartnerPayload }) =>
            partnersApi.update(id, payload),
        onSuccess: () => {
            message.success('Partner updated.');
            closeModal();
            invalidate();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to update partner.'),
    });

    const toggleActiveMutation = useMutation({
        mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
            partnersApi.update(id, { is_active }),
        onSuccess: (_data, vars) => {
            message.success(vars.is_active ? 'Partner activated.' : 'Partner deactivated.');
            invalidate();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to update partner.'),
    });

    const {
        data: ledgerCommissions = [],
        isLoading: ledgerLoading,
    } = useQuery({
        queryKey: ['admin', 'partners', ledgerPartner?.partner_id, 'commissions'],
        queryFn: () => partnersApi.commissions(ledgerPartner!.partner_id),
        enabled: !!ledgerPartner,
    });

    const markPaidMutation = useMutation({
        mutationFn: (commissionIds: string[]) =>
            partnersApi.markPaid(ledgerPartner!.partner_id, commissionIds),
        onSuccess: (result) => {
            message.success(`${result.count} commission(s) marked paid.`);
            setSelectedCommissionIds([]);
            queryClient.invalidateQueries({
                queryKey: ['admin', 'partners', ledgerPartner?.partner_id, 'commissions'],
            });
            invalidate();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to mark commissions paid.'),
    });

    const openCreate = () => {
        setEditing(null);
        form.resetFields();
        setModalOpen(true);
    };

    const openEdit = (partner: AdminPartner) => {
        setEditing(partner);
        form.setFieldsValue({
            full_name: partner.full_name,
            email: partner.email,
            password: undefined,
            phone: partner.phone ?? undefined,
        });
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditing(null);
        form.resetFields();
    };

    const handleSubmit = async () => {
        const values = await form.validateFields();
        if (editing) {
            const payload: UpdatePartnerPayload = {
                full_name: values.full_name.trim(),
                phone: values.phone?.trim() || null,
            };
            if (values.password) payload.password = values.password;
            updateMutation.mutate({ id: editing.partner_id, payload });
        } else {
            createMutation.mutate({
                full_name: values.full_name.trim(),
                email: values.email.trim(),
                password: values.password!,
                phone: values.phone?.trim() || null,
            });
        }
    };

    const filtered = partners.filter(
        (p) =>
            p.full_name.toLowerCase().includes(search.toLowerCase()) ||
            p.email.toLowerCase().includes(search.toLowerCase())
    );

    const claimableCommissionIds = ledgerCommissions
        .filter((c) => c.status === 'claimable')
        .map((c) => c.commission_id);

    const columns: ColumnsType<AdminPartner> = [
        {
            title: 'Partner',
            key: 'partner',
            render: (_, record) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{record.full_name}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {record.email}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Recruited by',
            dataIndex: 'recruited_by',
            key: 'recruited_by',
            render: (name: string | null) =>
                name ? <Tag>{name}</Tag> : <Text type="secondary">Top level</Text>,
        },
        {
            title: 'Code',
            dataIndex: 'referral_code',
            key: 'referral_code',
            render: (v: string | null) => v ?? '—',
        },
        {
            title: 'Ready to pay',
            dataIndex: 'claimable_total',
            key: 'claimable_total',
            align: 'right' as const,
            render: (v: number) => (
                <Text strong style={{ color: v > 0 ? '#0F766E' : undefined }}>
                    {money(v)}
                </Text>
            ),
        },
        {
            title: 'Paid to date',
            dataIndex: 'paid_total',
            key: 'paid_total',
            align: 'right' as const,
            render: (v: number) => money(v),
        },
        {
            title: 'Status',
            dataIndex: 'is_active',
            key: 'is_active',
            width: 110,
            render: (active: boolean) => (
                <Tag color={active ? 'green' : 'default'}>{active ? 'Active' : 'Inactive'}</Tag>
            ),
            filters: [
                { text: 'Active', value: true },
                { text: 'Inactive', value: false },
            ],
            onFilter: (val, record) => record.is_active === val,
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 280,
            render: (_, record) => (
                <Space>
                    <Button
                        type="link"
                        icon={<WalletOutlined />}
                        onClick={() => {
                            setLedgerPartner(record);
                            setSelectedCommissionIds([]);
                        }}
                    >
                        Ledger
                    </Button>
                    <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                        Edit
                    </Button>
                    {record.is_active ? (
                        <Popconfirm
                            title="Deactivate this partner?"
                            okText="Deactivate"
                            okButtonProps={{ danger: true }}
                            onConfirm={() =>
                                toggleActiveMutation.mutate({
                                    id: record.partner_id,
                                    is_active: false,
                                })
                            }
                        >
                            <Button type="link" danger icon={<StopOutlined />}>
                                Deactivate
                            </Button>
                        </Popconfirm>
                    ) : (
                        <Button
                            type="link"
                            icon={<CheckCircleOutlined />}
                            onClick={() =>
                                toggleActiveMutation.mutate({
                                    id: record.partner_id,
                                    is_active: true,
                                })
                            }
                        >
                            Activate
                        </Button>
                    )}
                </Space>
            ),
        },
    ];

    const commissionColumns: ColumnsType<PartnerCommission> = [
        { title: 'Date', dataIndex: 'date', key: 'date', render: shortDate },
        {
            title: 'Order',
            dataIndex: 'order_number',
            key: 'order_number',
            render: (v: string | null) => v ?? '—',
        },
        {
            title: 'Level',
            dataIndex: 'level',
            key: 'level',
            render: (v: number) => <Tag color={v === 1 ? 'blue' : 'purple'}>L{v}</Tag>,
        },
        {
            title: 'Amount',
            dataIndex: 'amount',
            key: 'amount',
            align: 'right' as const,
            render: (v: number) => <Text strong>{money(v)}</Text>,
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: commissionStatusTag,
        },
    ];

    return (
        <div>
            <div
                style={{
                    marginBottom: 16,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}
            >
                <Title level={3} style={{ margin: 0 }}>
                    <Space>
                        <TeamOutlined />
                        Partners
                    </Space>
                </Title>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                    Add Partner
                </Button>
            </div>

            <Card>
                <Input
                    placeholder="Search by name or email"
                    allowClear
                    prefix={<SearchOutlined />}
                    style={{ width: 320, marginBottom: 16 }}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />

                <Table
                    rowKey="partner_id"
                    columns={columns}
                    dataSource={filtered}
                    loading={isLoading}
                    locale={{ emptyText: isError ? 'Failed to load partners.' : 'No partners yet.' }}
                    pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `Total ${t} partners` }}
                />
            </Card>

            <Modal
                title={editing ? 'Edit Partner' : 'New Partner (top level)'}
                open={modalOpen}
                onOk={handleSubmit}
                onCancel={closeModal}
                okText={editing ? 'Save' : 'Create'}
                confirmLoading={createMutation.isPending || updateMutation.isPending}
                destroyOnHidden
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        label="Full Name"
                        name="full_name"
                        rules={[{ required: true, message: 'Name is required' }]}
                    >
                        <Input placeholder="e.g. Chandima Wijetunga" />
                    </Form.Item>

                    <Form.Item
                        label="Email"
                        name="email"
                        rules={[
                            { required: true, message: 'Email is required' },
                            { type: 'email', message: 'Enter a valid email' },
                        ]}
                    >
                        <Input placeholder="partner@sribeesonline.lk" disabled={!!editing} />
                    </Form.Item>

                    <Form.Item label="Phone" name="phone">
                        <Input placeholder="+94 7XX XXX XXX" />
                    </Form.Item>

                    <Form.Item
                        label={editing ? 'Password (leave blank to keep current)' : 'Password'}
                        name="password"
                        rules={
                            editing
                                ? [{ min: 8, message: 'At least 8 characters' }]
                                : [
                                      { required: true, message: 'Password is required' },
                                      { min: 8, message: 'At least 8 characters' },
                                  ]
                        }
                    >
                        <Input.Password placeholder={editing ? '••••••••' : 'Min 8 characters'} />
                    </Form.Item>

                    {!editing && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            Created here as a top-level partner (no upline). Partners recruit
                            their own team from the Partner Portal.
                        </Text>
                    )}
                </Form>
            </Modal>

            <Drawer
                title={ledgerPartner ? `${ledgerPartner.full_name} — Commission Ledger` : 'Ledger'}
                open={!!ledgerPartner}
                onClose={() => setLedgerPartner(null)}
                width={640}
            >
                {ledgerPartner && (
                    <>
                        <Alert
                            type="info"
                            showIcon
                            style={{ marginBottom: 16 }}
                            message="Partners have no in-app wallet."
                            description="Settle claimable commissions by bank transfer (or however finance pays out), then select the paid rows below and mark them paid so the ledger matches reality."
                        />
                        <Space style={{ marginBottom: 12 }}>
                            <Button
                                type="primary"
                                disabled={selectedCommissionIds.length === 0}
                                loading={markPaidMutation.isPending}
                                onClick={() => markPaidMutation.mutate(selectedCommissionIds)}
                            >
                                Mark selected as paid ({selectedCommissionIds.length})
                            </Button>
                            <Button
                                disabled={claimableCommissionIds.length === 0}
                                loading={markPaidMutation.isPending}
                                onClick={() => markPaidMutation.mutate(claimableCommissionIds)}
                            >
                                Mark all ready ({claimableCommissionIds.length})
                            </Button>
                        </Space>
                        <Table<PartnerCommission>
                            rowKey="commission_id"
                            size="small"
                            loading={ledgerLoading}
                            columns={commissionColumns}
                            dataSource={ledgerCommissions}
                            rowSelection={{
                                selectedRowKeys: selectedCommissionIds,
                                onChange: (keys) => setSelectedCommissionIds(keys as string[]),
                                getCheckboxProps: (record) => ({
                                    disabled: record.status !== 'claimable',
                                }),
                            }}
                            locale={{ emptyText: 'No commission recorded yet.' }}
                        />
                    </>
                )}
            </Drawer>
        </div>
    );
};

export default PartnerList;
