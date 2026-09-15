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
    Progress,
    Segmented,
    Divider,
    Radio,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    StopOutlined,
    SearchOutlined,
    TagOutlined,
    DeleteOutlined,
    ExclamationCircleOutlined,
    WalletOutlined,
    RiseOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { couponsApi } from '../../api/coupons.api';
import type { Coupon, CouponPayload, CouponStatus, DiscountType } from '../../api/coupons.api';
import { categoriesApi } from '../../api/categories.api';

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

/**
 * Status comes from the server (`Coupon.status`) rather than being re-derived
 * here. It has to: 'depleted' depends on the campaign budget, which only the
 * backend tracks, and a second copy of these rules in TypeScript would drift
 * from the one checkout actually enforces.
 */
const STATUS_META: Record<CouponStatus, { label: string; color: string; hint: string }> = {
    active: { label: 'Active', color: 'green', hint: 'Live and redeemable now' },
    scheduled: { label: 'Scheduled', color: 'blue', hint: 'Starts on its valid-from date' },
    expired: { label: 'Expired', color: 'red', hint: 'Past its end date' },
    inactive: { label: 'Inactive', color: 'default', hint: 'Switched off by an admin' },
    depleted: {
        label: 'Budget Depleted',
        color: 'orange',
        hint: 'Gave away its whole campaign budget — it worked, it just ran out',
    },
};

const FILTER_TABS: { label: string; value: CouponStatus | 'all' }[] = [
    { label: 'All Coupons', value: 'all' },
    { label: 'Active', value: 'active' },
    { label: 'Budget Depleted', value: 'depleted' },
    { label: 'Expired', value: 'expired' },
    { label: 'Inactive', value: 'inactive' },
];

/** Blue below 70%, amber to 95%, red at the ceiling. */
const budgetColor = (pct: number): string =>
    pct >= 95 ? '#dc2626' : pct >= 70 ? '#d97706' : '#1677ff';

interface CouponFormValues {
    code: string;
    description?: string;
    discount_type: DiscountType;
    discount_value: number;
    min_order_value?: number;
    max_discount_amount?: number | null;
    usage_limit?: number | null;
    per_user_limit?: number | null;
    is_public?: boolean;
    validity: [Dayjs, Dayjs];
    is_active: boolean;
    budget_cap?: number | null;
    auto_stop_on_budget?: boolean;
    exclude_quick_sale?: boolean;
    first_order_only?: boolean;
    eligibility: 'all' | 'categories';
    category_ids?: string[];
}

const CouponList: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [form] = Form.useForm<CouponFormValues>();
    const discountType = Form.useWatch('discount_type', form);

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [search, setSearch] = useState('');
    const [statusTab, setStatusTab] = useState<CouponStatus | 'all'>('all');
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Coupon | null>(null);
    const eligibility = Form.useWatch('eligibility', form);

    const { data, isLoading, isError } = useQuery({
        queryKey: [COUPONS_KEY, { page, pageSize, search, statusTab }],
        queryFn: () =>
            couponsApi.list({
                page,
                limit: pageSize,
                search: search || undefined,
                status: statusTab === 'all' ? undefined : statusTab,
            }),
        placeholderData: keepPreviousData,
    });

    // For the catalog-eligibility picker. Only fetched while the modal is open.
    const categoriesQuery = useQuery({
        queryKey: ['admin', 'categories', 'for-coupons'],
        queryFn: () => categoriesApi.list(),
        enabled: modalOpen,
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
        form.setFieldsValue({
            discount_type: 'percentage',
            is_active: true,
            min_order_value: 0,
            per_user_limit: 1,
            is_public: false,
            // Defaults that protect the branch. A new campaign excludes
            // clearance stock and stops itself at its budget unless someone
            // deliberately says otherwise.
            exclude_quick_sale: true,
            auto_stop_on_budget: true,
            first_order_only: false,
            eligibility: 'all',
        });
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
            per_user_limit: c.per_user_limit ?? undefined,
            is_public: c.is_public,
            validity: [dayjs(c.valid_from), dayjs(c.valid_until)],
            is_active: c.is_active,
            budget_cap: c.budget_cap ?? undefined,
            auto_stop_on_budget: c.auto_stop_on_budget,
            exclude_quick_sale: c.exclude_quick_sale,
            first_order_only: c.first_order_only,
            eligibility: c.category_ids.length ? 'categories' : 'all',
            category_ids: c.category_ids,
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
            per_user_limit: values.per_user_limit ?? null,
            is_public: values.is_public ?? false,
            valid_from: from.startOf('day').toISOString(),
            // End of day, so a coupon dated "to 17 Sep" works all of the 17th
            // rather than dying at midnight the night before.
            valid_until: to.endOf('day').toISOString(),
            is_active: values.is_active ?? true,
            budget_cap: values.budget_cap ?? null,
            auto_stop_on_budget: values.auto_stop_on_budget ?? true,
            exclude_quick_sale: values.exclude_quick_sale ?? true,
            first_order_only: values.first_order_only ?? false,
            // Always sent, including as an empty array: that is the only way to
            // widen a coupon back to the whole catalog once it was narrowed.
            category_ids:
                values.eligibility === 'categories' ? (values.category_ids ?? []) : [],
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
            width: 170,
            render: (code: string, c) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}>
                    <Tag color="geekblue" style={{ fontWeight: 600, marginInlineEnd: 0 }}>
                        {code}
                    </Tag>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {c.is_public && (
                            <Tag color="purple" style={{ marginInlineEnd: 0, fontSize: 11 }}>
                                In app
                            </Tag>
                        )}
                        {c.is_network_wide ? (
                            <Tag color="gold" style={{ marginInlineEnd: 0, fontSize: 11 }}>
                                All branches
                            </Tag>
                        ) : (
                            <Tag color="blue" style={{ marginInlineEnd: 0, fontSize: 11 }}>
                                This branch
                            </Tag>
                        )}
                    </div>
                </div>
            ),
        },
        {
            title: 'Type',
            dataIndex: 'discount_type',
            key: 'discount_type',
            width: 100,
            render: (t: DiscountType) => (
                <span style={{ whiteSpace: 'nowrap' }}>
                    {t === 'percentage' ? 'Percentage' : 'Fixed'}
                </span>
            ),
        },
        {
            title: 'Value',
            key: 'value',
            width: 110,
            render: (_, c) => <strong style={{ whiteSpace: 'nowrap' }}>{discountLabel(c)}</strong>,
        },
        {
            title: 'Min. Order',
            dataIndex: 'min_order_value',
            key: 'min_order_value',
            width: 110,
            render: (v: number) => (
                <span style={{ whiteSpace: 'nowrap' }}>{v > 0 ? formatLKR(v) : '—'}</span>
            ),
        },
        {
            title: 'Usage',
            key: 'usage',
            width: 120,
            render: (_, c) => (
                <div style={{ whiteSpace: 'nowrap' }}>
                    <div>
                        {c.used_count} / {c.usage_limit ?? '∞'}
                    </div>
                    <div style={{ color: '#999', fontSize: 11 }}>
                        {c.per_user_limit ?? '∞'}/customer
                    </div>
                </div>
            ),
        },
        {
            title: (
                <Tooltip title="Discount given away, against the campaign's budget. Usage limits cap how MANY redemptions; this caps what they COST.">
                    <span style={{ whiteSpace: 'nowrap' }}>
                        <WalletOutlined /> Budget Spend
                    </span>
                </Tooltip>
            ),
            key: 'budget',
            width: 160,
            render: (_, c) => {
                if (c.budget_cap == null) {
                    return (
                        <Tooltip title="No cap — this campaign can give away an unlimited amount of discount.">
                            <span style={{ color: '#94a3b8', fontSize: 12, whiteSpace: 'nowrap' }}>
                                No budget cap
                            </span>
                        </Tooltip>
                    );
                }
                const pct = c.budget_used_percent ?? 0;
                return (
                    <div style={{ minWidth: 140 }}>
                        <div
                            style={{
                                display: 'flex',
                                justify-content: 'space-between',
                                fontSize: 11.5,
                                marginBottom: 2,
                            }}
                        >
                            <span>{formatLKR(c.budget_spent)}</span>
                            <strong>{pct}%</strong>
                        </div>
                        <Progress
                            percent={Math.min(100, pct)}
                            showInfo={false}
                            size="small"
                            strokeColor={budgetColor(pct)}
                        />
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                            of {formatLKR(c.budget_cap)}
                        </div>
                    </div>
                );
            },
        },
        {
            title: (
                <Tooltip title="Gross sales placed with this code. The other half of the budget figure: Rs 30,000 of discount that pulled in Rs 612,000 of sales is a campaign worth repeating.">
                    <span style={{ whiteSpace: 'nowrap' }}>
                        <RiseOutlined /> Revenue
                    </span>
                </Tooltip>
            ),
            key: 'revenue',
            width: 140,
            render: (_, c) =>
                c.orders_count > 0 ? (
                    <div style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ fontWeight: 600, color: '#16a34a' }}>
                            {formatLKR(c.revenue_generated)}
                        </div>
                        <div style={{ fontSize: 11, color: '#94a3b8' }}>
                            {c.orders_count.toLocaleString()} order
                            {c.orders_count === 1 ? '' : 's'}
                        </div>
                    </div>
                ) : (
                    <span style={{ color: '#94a3b8' }}>—</span>
                ),
        },
        {
            title: 'Validity',
            key: 'validity',
            width: 180,
            render: (_, c) => (
                <div style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                    <div>{dayjs(c.valid_from).format('MMM DD, YYYY')}</div>
                    <div style={{ color: '#94a3b8', fontSize: 11 }}>
                        to {dayjs(c.valid_until).format('MMM DD, YYYY')}
                    </div>
                </div>
            ),
        },
        {
            title: 'Status',
            key: 'status',
            width: 110,
            render: (_, c) => {
                const meta = STATUS_META[c.status] ?? STATUS_META.inactive;
                return (
                    <Tooltip title={meta.hint}>
                        <Tag color={meta.color} style={{ marginInlineEnd: 0, whiteSpace: 'nowrap' }}>
                            {meta.label}
                        </Tag>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 190,
            render: (_, c) => {
                const canDeactivate = c.status === 'active' || c.status === 'scheduled';

                const getDeactivateReason = () => {
                    if (c.status === 'expired') return 'Already past its end date';
                    if (c.status === 'depleted')
                        return 'Campaign budget is spent — it has already stopped itself';
                    return 'Coupon is already inactive';
                };

                return (
                    <Space size={2} style={{ whiteSpace: 'nowrap' }}>
                        <Button
                            size="small"
                            type="link"
                            icon={<EditOutlined />}
                            onClick={() => openEdit(c)}
                        >
                            Edit
                        </Button>
                        {canDeactivate ? (
                            <Popconfirm
                                title="Deactivate this coupon?"
                                okText="Deactivate"
                                okButtonProps={{ danger: true }}
                                onConfirm={() => deactivateMutation.mutate(c.coupon_id)}
                            >
                                <Button size="small" type="link" danger icon={<StopOutlined />}>
                                    Deactivate
                                </Button>
                            </Popconfirm>
                        ) : c.is_active ? (
                            <Tooltip title={getDeactivateReason()}>
                                <Button size="small" type="link" danger disabled icon={<StopOutlined />}>
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
                            <Button size="small" type="link" danger icon={<DeleteOutlined />}>
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
                <Segmented
                    value={statusTab}
                    onChange={(value) => {
                        setPage(1);
                        setStatusTab(value as CouponStatus | 'all');
                    }}
                    options={FILTER_TABS}
                    style={{ marginBottom: 16 }}
                />

                <div>
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
                </div>

                <Table
                    rowKey="coupon_id"
                    columns={columns}
                    dataSource={data?.coupons ?? []}
                    loading={isLoading}
                    locale={{ emptyText: isError ? 'Failed to load coupons.' : 'No coupons yet.' }}
                    scroll={{ x: 'max-content' }}
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
                            label="Usage Limit (total)"
                            name="usage_limit"
                            extra="Leave blank for unlimited"
                            style={{ width: 200 }}
                        >
                            <InputNumber min={1} style={{ width: '100%' }} placeholder="Unlimited" />
                        </Form.Item>

                        <Form.Item
                            label="Per-customer Limit"
                            name="per_user_limit"
                            extra="Max uses per customer (blank = unlimited)"
                            style={{ width: 200 }}
                        >
                            <InputNumber min={1} style={{ width: '100%' }} placeholder="Unlimited" />
                        </Form.Item>
                    </Space>

                    <Form.Item
                        label="Show in app (collectible offer)"
                        name="is_public"
                        valuePropName="checked"
                        extra="Customers see this in “Available Offers” and must collect it before applying. Off = private code."
                    >
                        <Switch checkedChildren="Public" unCheckedChildren="Private" />
                    </Form.Item>

                    {/* ============ Financial protection ============
                        The two controls that stop a promotion becoming a loss.
                        Usage limits cap how many redemptions; these cap what
                        they cost, and what they are allowed to be spent on. */}
                    <Divider titlePlacement="start">
                        <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>
                            FINANCIAL PROTECTION
                        </span>
                    </Divider>

                    <Form.Item
                        name="exclude_quick_sale"
                        valuePropName="checked"
                        extra="Clearance items are already sold at or below cost. With this on, they count toward neither the discount nor the minimum order value."
                    >
                        <Switch
                            checkedChildren="Excluding Quick Sale"
                            unCheckedChildren="Quick Sale included"
                        />
                    </Form.Item>

                    <Form.Item
                        label="Total campaign budget"
                        name="budget_cap"
                        extra="The most discount this coupon may ever give away. Blank = uncapped, which means a usage limit is the only thing between you and an unbounded bill."
                    >
                        <InputNumber
                            min={1}
                            step={1000}
                            addonBefore="LKR"
                            style={{ width: '100%' }}
                            placeholder="e.g. 50000"
                        />
                    </Form.Item>

                    <Form.Item
                        name="auto_stop_on_budget"
                        valuePropName="checked"
                        extra="Switches the coupon off the moment the budget is gone, rather than leaving a code that reads Active but refuses every customer."
                    >
                        <Switch
                            checkedChildren="Auto-stop at budget"
                            unCheckedChildren="Keep running"
                        />
                    </Form.Item>

                    {/* ============ Scope & eligibility ============ */}
                    <Divider titlePlacement="start">
                        <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>
                            SCOPE &amp; ELIGIBILITY
                        </span>
                    </Divider>

                    <Form.Item
                        name="first_order_only"
                        valuePropName="checked"
                        extra="Acquisition offer: only a customer with no previous completed order from this branch can use it."
                    >
                        <Switch
                            checkedChildren="First order only"
                            unCheckedChildren="Any order"
                        />
                    </Form.Item>

                    <Form.Item label="Catalog eligibility" name="eligibility">
                        <Radio.Group
                            options={[
                                { label: 'Entire catalog', value: 'all' },
                                { label: 'Specific categories', value: 'categories' },
                            ]}
                            optionType="button"
                        />
                    </Form.Item>

                    {eligibility === 'categories' && (
                        <Form.Item
                            label="Eligible categories"
                            name="category_ids"
                            rules={[{ required: true, message: 'Pick at least one category' }]}
                            extra="Only lines in these categories are discounted, and only they count toward the minimum order."
                        >
                            <Select
                                mode="multiple"
                                allowClear
                                loading={categoriesQuery.isLoading}
                                placeholder="Choose categories"
                                optionFilterProp="label"
                                options={(categoriesQuery.data ?? []).map((c) => ({
                                    label: c.name,
                                    value: c.category_id,
                                }))}
                            />
                        </Form.Item>
                    )}

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
