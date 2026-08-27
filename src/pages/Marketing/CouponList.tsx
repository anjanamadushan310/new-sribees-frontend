/**
 * Coupons / Promotions Management (Super Admin + Marketing Manager)
 * Ant Design table + create/edit modal (RangePicker for validity), backed by
 * TanStack Query against /api/v1/admin/coupons.
 */
import React, { useState } from 'react';
import {
    Card,
    Table,
    Button,
    Space,
    Tag,
    Input,
    Select,
    Modal,
    Form,
    Switch,
    InputNumber,
    DatePicker,
    Popconfirm,
    App,
    Typography,
    Tooltip,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    StopOutlined,
    SearchOutlined,
    TagOutlined,
    DeleteOutlined,
    ExclamationCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { couponsApi } from '../../api/coupons.api';
import type { Coupon, CouponPayload, DiscountType } from '../../api/coupons.api';

const { Title } = Typography;
const { RangePicker } = DatePicker;

const COUPONS_KEY = 'coupons';

const formatLKR = (value: number): string =>
    new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR', maximumFractionDigits: 0 }).format(
        value ?? 0
    );

const discountLabel = (c: Coupon): string => {
    if (c.discount_type === 'percentage') {
        return c.max_discount_amount
            ? `${c.discount_value}% (Cap: ${formatLKR(c.max_discount_amount)})`
            : `${c.discount_value}%`;
    }
    return formatLKR(c.discount_value);
};

// Derived display status from is_active + validity window + usage.
const couponStatus = (c: Coupon): { label: string; color: string } => {
    if (!c.is_active) return { label: 'Inactive', color: 'default' };
    const now = dayjs();
    if (now.isBefore(dayjs(c.valid_from))) return { label: 'Scheduled', color: 'blue' };
    if (now.isAfter(dayjs(c.valid_until))) return { label: 'Expired', color: 'red' };
    if (c.usage_limit != null && c.used_count >= c.usage_limit)
        return { label: 'Used Up', color: 'orange' };
    return { label: 'Active', color: 'green' };
};

interface CouponFormValues {
    code: string;
    description?: string;
    discount_type: DiscountType;
    discount_value: number;
    min_order_value?: number;
    max_discount_amount?: number | null;
    usage_limit?: number | null;
    validity: [Dayjs, Dayjs];
    is_active: boolean;
}

const CouponList: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [form] = Form.useForm<CouponFormValues>();
    const discountType = Form.useWatch('discount_type', form);

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [search, setSearch] = useState('');
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Coupon | null>(null);

    const { data, isLoading, isError } = useQuery({
        queryKey: [COUPONS_KEY, { page, pageSize, search }],
        queryFn: () => couponsApi.list({ page, limit: pageSize, search: search || undefined }),
        placeholderData: keepPreviousData,
    });

    const invalidate = () => queryClient.invalidateQueries({ queryKey: [COUPONS_KEY] });

    const createMutation = useMutation({
        mutationFn: (payload: CouponPayload) => couponsApi.create(payload),
        onSuccess: () => {
            message.success('Coupon created.');
            closeModal();
            invalidate();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to create coupon.'),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: Partial<CouponPayload> }) =>
            couponsApi.update(id, payload),
        onSuccess: () => {
            message.success('Coupon updated.');
            closeModal();
            invalidate();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to update coupon.'),
    });

    const deactivateMutation = useMutation({
        mutationFn: (id: string) => couponsApi.deactivate(id),
        onSuccess: () => {
            message.success('Coupon deactivated.');
            invalidate();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to deactivate coupon.'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => couponsApi.delete(id),
        onSuccess: () => {
            message.success('Coupon deleted permanently.');
            invalidate();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to delete coupon.'),
    });

    const openCreate = () => {
        setEditing(null);
        form.resetFields();
        form.setFieldsValue({ discount_type: 'percentage', is_active: true, min_order_value: 0 });
        setModalOpen(true);
    };

    const openEdit = (c: Coupon) => {
        setEditing(c);
        form.setFieldsValue({
            code: c.code,
            description: c.description ?? undefined,
            discount_type: c.discount_type,
            discount_value: c.discount_value,
            min_order_value: c.min_order_value,
            max_discount_amount: c.max_discount_amount ?? undefined,
            usage_limit: c.usage_limit ?? undefined,
            validity: [dayjs(c.valid_from), dayjs(c.valid_until)],
            is_active: c.is_active,
        });
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditing(null);
        form.resetFields();
    };

    const executeSubmit = (payload: CouponPayload) => {
        if (editing) {
            updateMutation.mutate({ id: editing.coupon_id, payload });
        } else {
            createMutation.mutate(payload);
        }
    };

    const handleSubmit = async () => {
        const values = await form.validateFields();
        const [from, to] = values.validity;
        const minOrder = values.min_order_value ?? 0;
        const payload: CouponPayload = {
            code: values.code.trim().toUpperCase(),
            description: values.description?.trim() || null,
            discount_type: values.discount_type,
            discount_value: values.discount_value,
            min_order_value: minOrder,
            max_discount_amount: values.discount_type === 'percentage' ? (values.max_discount_amount ?? null) : null,
            usage_limit: values.usage_limit ?? null,
            valid_from: from.startOf('day').toISOString(),
            valid_until: to.endOf('day').toISOString(),
            is_active: values.is_active ?? true,
        };

        if (minOrder === 0) {
            Modal.confirm({
                title: 'Zero Spend Minimum Warning',
                icon: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
                content: 'Setting Min. Order to LKR 0 allows this coupon to be used on any basket size without a minimum spend threshold. Are you sure you want to proceed?',
                okText: 'Yes, Save Coupon',
                cancelText: 'Go Back',
                onOk: () => executeSubmit(payload),
            });
        } else {
            executeSubmit(payload);
        }
    };

    const columns: ColumnsType<Coupon> = [
        {
            title: 'Code',
            dataIndex: 'code',
            key: 'code',
            render: (code: string) => <Tag color="geekblue">{code}</Tag>,
        },
        {
            title: 'Type',
            dataIndex: 'discount_type',
            key: 'discount_type',
            render: (t: DiscountType) => (t === 'percentage' ? 'Percentage' : 'Fixed'),
        },
        {
            title: 'Value',
            key: 'value',
            render: (_, c) => <strong>{discountLabel(c)}</strong>,
        },
        {
            title: 'Min. Order',
            dataIndex: 'min_order_value',
            key: 'min_order_value',
            render: (v: number) => (v > 0 ? formatLKR(v) : '—'),
        },
        {
            title: 'Usage',
            key: 'usage',
            render: (_, c) => (
                <span>
                    {c.used_count} / {c.usage_limit ?? '∞'}
                </span>
            ),
        },
        {
            title: 'Validity',
            key: 'validity',
            render: (_, c) => (
                <span style={{ fontSize: 12 }}>
                    {dayjs(c.valid_from).format('MMM DD, YYYY')} →{' '}
                    {dayjs(c.valid_until).format('MMM DD, YYYY')}
                </span>
            ),
        },
        {
            title: 'Status',
            key: 'status',
            width: 120,
            render: (_, c) => {
                const s = couponStatus(c);
                return <Tag color={s.color}>{s.label}</Tag>;
            },
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 240,
            render: (_, c) => {
                const isExpired = dayjs().isAfter(dayjs(c.valid_until));
                const isUsedUp = c.usage_limit != null && c.used_count >= c.usage_limit;
                const canDeactivate = c.is_active && !isExpired && !isUsedUp;

                const getDeactivateReason = () => {
                    if (isExpired) return 'Coupon is expired and cannot be deactivated';
                    if (isUsedUp) return 'Coupon usage limit reached (Used Up)';
                    return 'Coupon is inactive';
                };

                return (
                    <Space>
                        <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(c)}>
                            Edit
                        </Button>
                        {canDeactivate ? (
                            <Popconfirm
                                title="Deactivate this coupon?"
                                okText="Deactivate"
                                okButtonProps={{ danger: true }}
                                onConfirm={() => deactivateMutation.mutate(c.coupon_id)}
                            >
                                <Button type="link" danger icon={<StopOutlined />}>
                                    Deactivate
                                </Button>
                            </Popconfirm>
                        ) : c.is_active ? (
                            <Tooltip title={getDeactivateReason()}>
                                <Button type="link" danger disabled icon={<StopOutlined />}>
                                    Deactivate
                                </Button>
                            </Tooltip>
                        ) : null}
                        <Popconfirm
                            title="Delete coupon permanently?"
                            description={`Are you sure you want to permanently delete "${c.code}"?`}
                            okText="Delete"
                            okButtonProps={{ danger: true }}
                            onConfirm={() => deleteMutation.mutate(c.coupon_id)}
                        >
                            <Button type="link" danger icon={<DeleteOutlined />}>
                                Delete
                            </Button>
                        </Popconfirm>
                    </Space>
                );
            },
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
                        <TagOutlined />
                        Coupons
                    </Space>
                </Title>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                    Add Coupon
                </Button>
            </div>

            <Card>
                <Input.Search
                    placeholder="Search code or description…"
                    allowClear
                    enterButton={<SearchOutlined />}
                    style={{ width: 320, marginBottom: 16 }}
                    onSearch={(value) => {
                        setPage(1);
                        setSearch(value);
                    }}
                />

                <Table
                    rowKey="coupon_id"
                    columns={columns}
                    dataSource={data?.coupons ?? []}
                    loading={isLoading}
                    locale={{ emptyText: isError ? 'Failed to load coupons.' : 'No coupons yet.' }}
                    pagination={{
                        current: page,
                        pageSize,
                        total: data?.total ?? 0,
                        showSizeChanger: true,
                        showTotal: (t) => `Total ${t} coupons`,
                        onChange: (p, s) => {
                            setPage(p);
                            setPageSize(s);
                        },
                    }}
                />
            </Card>

            <Modal
                title={editing ? 'Edit Coupon' : 'New Coupon'}
                open={modalOpen}
                onOk={handleSubmit}
                onCancel={closeModal}
                okText={editing ? 'Save' : 'Create'}
                confirmLoading={createMutation.isPending || updateMutation.isPending}
                destroyOnHidden
                width={560}
            >
                <Form
                    form={form}
                    layout="vertical"
                    initialValues={{ discount_type: 'percentage', is_active: true, min_order_value: 0 }}
                >
                    <Form.Item
                        label="Coupon Code"
                        name="code"
                        rules={[
                            { required: true, message: 'Code is required' },
                            { min: 2, message: 'At least 2 characters' },
                        ]}
                    >
                        <Input placeholder="e.g. SAVE20" style={{ textTransform: 'uppercase' }} />
                    </Form.Item>

                    <Form.Item label="Description" name="description">
                        <Input.TextArea rows={2} placeholder="Optional internal note / campaign name" />
                    </Form.Item>

                    <Space style={{ display: 'flex' }} align="start">
                        <Form.Item
                            label="Discount Type"
                            name="discount_type"
                            rules={[{ required: true }]}
                            style={{ width: 200 }}
                        >
                            <Select
                                options={[
                                    { label: 'Percentage (%)', value: 'percentage' },
                                    { label: 'Fixed (LKR)', value: 'fixed' },
                                ]}
                            />
                        </Form.Item>

                        <Form.Item
                            label="Discount Value"
                            name="discount_value"
                            rules={[
                                { required: true, message: 'Enter a value' },
                                {
                                    validator: (_, v) => {
                                        if (v == null) return Promise.resolve();
                                        if (v <= 0) return Promise.reject('Must be greater than 0');
                                        if (discountType === 'percentage' && v > 100)
                                            return Promise.reject('Max 100%');
                                        return Promise.resolve();
                                    },
                                },
                            ]}
                            style={{ width: 200 }}
                        >
                            <InputNumber
                                min={0}
                                step={discountType === 'percentage' ? 1 : 10}
                                style={{ width: '100%' }}
                                addonAfter={discountType === 'percentage' ? '%' : 'LKR'}
                            />
                        </Form.Item>
                    </Space>

                    <Space style={{ display: 'flex' }} align="start" wrap>
                        <Form.Item
                            label="Min. Order Value"
                            name="min_order_value"
                            dependencies={['discount_type', 'discount_value']}
                            rules={[
                                ({ getFieldValue }) => ({
                                    validator(_, value) {
                                        const type = getFieldValue('discount_type');
                                        const discVal = getFieldValue('discount_value');
                                        if (type === 'fixed' && value != null && discVal != null && value < discVal) {
                                            return Promise.reject(
                                                new Error(`Min. Order must be at least LKR ${discVal} for fixed discounts`)
                                            );
                                        }
                                        return Promise.resolve();
                                    },
                                }),
                            ]}
                            style={{ width: 200 }}
                        >
                            <InputNumber min={0} style={{ width: '100%' }} addonBefore="LKR" />
                        </Form.Item>

                        {discountType === 'percentage' && (
                            <Form.Item
                                label="Max Discount Amount"
                                name="max_discount_amount"
                                extra="Cap for percentage discount"
                                style={{ width: 200 }}
                            >
                                <InputNumber min={0} style={{ width: '100%' }} addonBefore="LKR" placeholder="Unlimited" />
                            </Form.Item>
                        )}

                        <Form.Item
                            label="Usage Limit"
                            name="usage_limit"
                            extra="Leave blank for unlimited"
                            style={{ width: 200 }}
                        >
                            <InputNumber min={1} style={{ width: '100%' }} placeholder="Unlimited" />
                        </Form.Item>
                    </Space>

                    <Form.Item
                        label="Validity Period"
                        name="validity"
                        rules={[{ required: true, message: 'Select a validity range' }]}
                    >
                        <RangePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                    </Form.Item>

                    <Form.Item label="Active" name="is_active" valuePropName="checked">
                        <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default CouponList;
