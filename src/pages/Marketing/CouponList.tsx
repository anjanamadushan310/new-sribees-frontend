/**
 * Coupons / Promotions Management (Super Admin + Marketing Manager)
 * Ant Design table + create/edit modal (RangePicker for validity), backed by
 * TanStack Query against /api/v1/admin/coupons.
 * 
 * Enhanced with Targeted Promotions (Tiers & Whitelist with CSV Import/Export/Sample),
 * Catalog Eligibility, Automated Multi-channel Dispatch Panel, and Financial Safety rules.
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
    Checkbox,
    Alert,
    Upload,
    Row,
    Col,
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
    GlobalOutlined,
    ShopOutlined,
    UploadOutlined,
    DownloadOutlined,
    FileTextOutlined,
    UserAddOutlined,
    CrownOutlined,
    NotificationOutlined,
    MailOutlined,
    MobileOutlined,
    InfoCircleOutlined,
    SendOutlined,
    UserOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { couponsApi } from '../../api/coupons.api';
import type {
    Coupon,
    CouponPayload,
    CouponStatus,
    DiscountType,
    TargetCustomerType,
    WhitelistedCustomer,
} from '../../api/coupons.api';
import { loyaltyApi } from '../../api/loyalty.api';
import { categoriesApi } from '../../api/categories.api';
import { branchesApi } from '../../api/branches.api';
import { usePermissions } from '../../hooks/usePermissions';
import { slt } from '../../utils/datetime';

const { Title, Text } = Typography;
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
 * here. 'depleted' depends on the campaign budget, which only the backend tracks.
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
    branch_scope: 'network' | 'branch';
    branch_id?: string | null;

    // Targeted Promotions
    target_customer_type: TargetCustomerType;
    /** The loyalty level a members-only coupon starts at. */
    min_tier_id?: string;

    // Dispatch Config
    dispatch_enabled?: boolean;
    dispatch_channels?: ('sms' | 'email' | 'push')[];
    dispatch_template?: string;
}

const CouponList: React.FC = () => {
    const { message } = App.useApp();
    const { isSuperAdmin } = usePermissions();
    const queryClient = useQueryClient();
    const [form] = Form.useForm<CouponFormValues>();
    const discountType = Form.useWatch('discount_type', form);
    const branchScope = Form.useWatch('branch_scope', form);
    const eligibility = Form.useWatch('eligibility', form);
    const targetCustomerType = Form.useWatch('target_customer_type', form);
    const dispatchEnabled = Form.useWatch('dispatch_enabled', form);

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [search, setSearch] = useState('');
    const [selectedBranch, setSelectedBranch] = useState<string | undefined>(undefined);
    const [statusTab, setStatusTab] = useState<CouponStatus | 'all'>('all');
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Coupon | null>(null);

    // Whitelist management state
    const [whitelistedCustomers, setWhitelistedCustomers] = useState<WhitelistedCustomer[]>([]);
    const [custNameInput, setCustNameInput] = useState('');
    const [custPhoneInput, setCustPhoneInput] = useState('');

    const { data, isLoading, isError } = useQuery({
        queryKey: [COUPONS_KEY, { page, pageSize, search, statusTab, selectedBranch }],
        queryFn: () =>
            couponsApi.list({
                page,
                limit: pageSize,
                search: search || undefined,
                status: statusTab === 'all' ? undefined : statusTab,
                branch_id: selectedBranch || undefined,
            }),
        placeholderData: keepPreviousData,
    });

    const branchesQuery = useQuery({
        queryKey: ['admin', 'branches', 'list'],
        queryFn: () => branchesApi.list(),
        enabled: isSuperAdmin,
    });

    const categoriesQuery = useQuery({
        queryKey: ['admin', 'categories', 'for-coupons'],
        queryFn: () => categoriesApi.list(),
        enabled: modalOpen,
    });

    // The real levels, so the list can name a coupon's level and the form can
    // offer exactly the ones checkout enforces.
    const tiersQuery = useQuery({
        queryKey: ['admin', 'loyalty', 'tiers'],
        queryFn: loyaltyApi.listTiers,
    });
    const tierName = (id: string | null | undefined) =>
        (tiersQuery.data ?? []).find((t) => t.tier_id === id)?.name ?? 'a level';

    const invalidate = () => queryClient.invalidateQueries({ queryKey: [COUPONS_KEY] });

    const createMutation = useMutation({
        mutationFn: (payload: CouponPayload) => couponsApi.create(payload),
        onSuccess: () => {
            message.success('Coupon created successfully.');
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
            message.success('Coupon updated successfully.');
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
        setWhitelistedCustomers([]);
        setCustNameInput('');
        setCustPhoneInput('');
        form.resetFields();
        form.setFieldsValue({
            discount_type: 'percentage',
            is_active: true,
            min_order_value: 0,
            per_user_limit: 1,
            is_public: false,
            exclude_quick_sale: false,
            auto_stop_on_budget: true,
            first_order_only: false,
            eligibility: 'all',
            branch_scope: 'network',
            branch_id: null,
            target_customer_type: 'all',
            min_tier_id: undefined,
            dispatch_enabled: false,
            dispatch_channels: ['sms', 'push'],
            dispatch_template: 'Hi {customer_name}! Use promo code {coupon_code} to get {discount_value} OFF your next order. Valid until {validity_date}.',
        });
        setModalOpen(true);
    };

    const openEdit = (c: Coupon) => {
        setEditing(c);
        setWhitelistedCustomers(c.whitelisted_customers ?? []);
        setCustNameInput('');
        setCustPhoneInput('');
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
            validity: [slt(c.valid_from), slt(c.valid_until)],
            is_active: c.is_active,
            budget_cap: c.budget_cap ?? undefined,
            auto_stop_on_budget: c.auto_stop_on_budget,
            exclude_quick_sale: false,
            first_order_only: c.first_order_only,
            eligibility: c.category_ids.length ? 'categories' : 'all',
            category_ids: c.category_ids,
            branch_scope: c.branch_id ? 'branch' : 'network',
            branch_id: c.branch_id ?? undefined,
            // The level is the stored fact; the old 'tier' choice was never
            // saved by the server, so it is not trusted to mean anything.
            target_customer_type: c.min_tier_id
                ? 'tier'
                : c.target_customer_type === 'tier'
                    ? 'all'
                    : (c.target_customer_type ?? 'all'),
            min_tier_id: c.min_tier_id ?? undefined,
            dispatch_enabled: c.dispatch_config?.enabled ?? false,
            dispatch_channels: c.dispatch_config?.channels ?? ['sms', 'push'],
            dispatch_template: c.dispatch_config?.template ?? 'Hi {customer_name}! Use promo code {coupon_code} to get {discount_value} OFF your next order. Valid until {validity_date}.',
        });
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditing(null);
        setWhitelistedCustomers([]);
        setCustNameInput('');
        setCustPhoneInput('');
        form.resetFields();
    };

    // Whitelist chip additions & removals
    const handleAddCustomerChip = () => {
        if (!custNameInput.trim() && !custPhoneInput.trim()) {
            message.warning('Please enter customer name or phone number.');
            return;
        }
        const newCust: WhitelistedCustomer = {
            name: custNameInput.trim() || custPhoneInput.trim(),
            phone: custPhoneInput.trim() || undefined,
        };
        setWhitelistedCustomers((prev) => [...prev, newCust]);
        setCustNameInput('');
        setCustPhoneInput('');
        message.success(`Added ${newCust.name} to whitelist.`);
    };

    const handleRemoveCustomerChip = (index: number) => {
        setWhitelistedCustomers((prev) => prev.filter((_, i) => i !== index));
    };

    // CSV Integration
    const handleImportCSV = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target?.result as string;
            if (!text) return;
            const lines = text.split(/\r?\n/);
            const imported: WhitelistedCustomer[] = [];
            lines.forEach((line, idx) => {
                if (!line.trim()) return;
                const parts = line.split(',').map((p) => p.trim().replace(/^["']|["']$/g, ''));
                if (idx === 0 && (parts[0].toLowerCase().includes('name') || parts[0].toLowerCase().includes('phone'))) {
                    return; // Skip header row
                }
                if (parts.length >= 1 && parts[0]) {
                    imported.push({
                        name: parts[0],
                        phone: parts[1] || undefined,
                        email: parts[2] || undefined,
                    });
                }
            });
            if (imported.length > 0) {
                setWhitelistedCustomers((prev) => [...prev, ...imported]);
                message.success(`Imported ${imported.length} customer(s) from CSV.`);
            } else {
                message.error('No valid customer records found in the CSV file.');
            }
        };
        reader.readAsText(file);
        return false; // Prevent default upload behavior
    };

    const handleExportCSV = () => {
        if (whitelistedCustomers.length === 0) {
            message.warning('No whitelisted customers to export.');
            return;
        }
        const headers = 'Name,Phone,Email\n';
        const rows = whitelistedCustomers
            .map((c) => `"${c.name}","${c.phone || ''}","${c.email || ''}"`)
            .join('\n');
        const blob = new Blob([headers + rows], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'whitelisted_customers.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        message.success('Exported customer whitelist CSV.');
    };

    const handleSampleCSV = () => {
        const content =
            'Name,Phone,Email\nKasun Perera,0771234567,kasun@example.com\nNimali Silva,0719876543,nimali@example.com\nSaman Fernando,0751122334,saman@example.com';
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'sample_customer_whitelist.csv');
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        message.success('Downloaded sample CSV template.');
    };

    // Insert variable helper for notification panel
    const insertVariable = (variable: string) => {
        const currentText = form.getFieldValue('dispatch_template') || '';
        const updatedText = currentText ? `${currentText} ${variable}` : variable;
        form.setFieldsValue({ dispatch_template: updatedText });
    };

    const getLivePreview = () => {
        const tmpl =
            form.getFieldValue('dispatch_template') ||
            'Hi {customer_name}! Use promo code {coupon_code} to get {discount_value} OFF your next order. Valid until {validity_date}.';
        const code = form.getFieldValue('code') || 'SAVE20';
        const discTypeVal = form.getFieldValue('discount_type');
        const discValNum = form.getFieldValue('discount_value') || 10;
        const discStr = discTypeVal === 'percentage' ? `${discValNum}%` : `LKR ${discValNum}`;
        const validityArr = form.getFieldValue('validity');
        const validUntilStr =
            validityArr && validityArr[1] ? validityArr[1].format('YYYY-MM-DD') : '2026-10-31';

        return tmpl
            .replace(/\{customer_name\}/g, 'Kamal')
            .replace(/\{coupon_code\}/g, code.toUpperCase())
            .replace(/\{discount_value\}/g, discStr)
            .replace(/\{validity_date\}/g, validUntilStr);
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
            branch_id: isSuperAdmin
                ? values.branch_scope === 'branch'
                    ? (values.branch_id || null)
                    : null
                : undefined,
            description: values.description?.trim() || null,
            discount_type: values.discount_type,
            discount_value: values.discount_value,
            min_order_value: minOrder,
            max_discount_amount:
                values.discount_type === 'percentage' ? (values.max_discount_amount ?? null) : null,
            usage_limit: values.usage_limit ?? null,
            per_user_limit: values.per_user_limit ?? null,
            is_public: values.is_public ?? false,
            valid_from: from.startOf('day').toISOString(),
            valid_until: to.endOf('day').toISOString(),
            is_active: values.is_active ?? true,
            budget_cap: values.budget_cap ?? null,
            auto_stop_on_budget: values.auto_stop_on_budget ?? true,
            exclude_quick_sale: false,
            first_order_only: values.first_order_only ?? false,
            category_ids: values.eligibility === 'categories' ? (values.category_ids ?? []) : [],

            // Targeted Promotions & Customer Eligibility
            target_customer_type: values.target_customer_type,
            min_tier_id: values.target_customer_type === 'tier' ? (values.min_tier_id ?? null) : null,
            whitelisted_customers:
                values.target_customer_type === 'specific' ? whitelistedCustomers : [],
            dispatch_config: {
                enabled: values.dispatch_enabled ?? false,
                channels: values.dispatch_channels ?? [],
                template: values.dispatch_template ?? '',
            },
        };

        if (minOrder === 0) {
            Modal.confirm({
                title: 'Zero Spend Minimum Warning',
                icon: <ExclamationCircleOutlined style={{ color: '#faad14' }} />,
                content:
                    'Setting Min. Order to LKR 0 allows this coupon to be used on any basket size without a minimum spend threshold. Are you sure you want to proceed?',
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
                        {c.min_tier_id && (
                            <Tag color="cyan" icon={<CrownOutlined />} style={{ marginInlineEnd: 0, fontSize: 11 }}>
                                {tierName(c.min_tier_id)}+
                            </Tag>
                        )}
                        {c.target_customer_type === 'specific' && (
                            <Tag color="gold" style={{ marginInlineEnd: 0, fontSize: 11 }}>
                                Whitelist ({c.whitelisted_customers?.length ?? 0})
                            </Tag>
                        )}
                        {c.is_network_wide ? (
                            <Tag color="gold" icon={<GlobalOutlined />} style={{ marginInlineEnd: 0, fontSize: 11 }}>
                                All branches
                            </Tag>
                        ) : (
                            <Tag color="blue" icon={<ShopOutlined />} style={{ marginInlineEnd: 0, fontSize: 11 }}>
                                {c.branch_name || 'This branch'}
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
                <Tooltip title="Discount given away against campaign budget.">
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
                        <Tooltip title="No cap — this campaign can give away unlimited discount.">
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
                                justifyContent: 'space-between',
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
                <Tooltip title="Net merchandise sales generated by this code.">
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
                    <div>{slt(c.valid_from).format('MMM DD, YYYY')}</div>
                    <div style={{ color: '#94a3b8', fontSize: 11 }}>
                        to {slt(c.valid_until).format('MMM DD, YYYY')}
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
                            <Tooltip title="Already inactive or expired">
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
                        Coupons Management
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

                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                    <Input.Search
                        placeholder="Search code or description…"
                        allowClear
                        enterButton={<SearchOutlined />}
                        style={{ width: 280 }}
                        onSearch={(value) => {
                            setPage(1);
                            setSearch(value);
                        }}
                    />
                    {isSuperAdmin && (
                        <Select
                            allowClear
                            placeholder="Filter by Branch"
                            style={{ width: 230 }}
                            value={selectedBranch}
                            onChange={(val) => {
                                setPage(1);
                                setSelectedBranch(val);
                            }}
                            options={[
                                { label: '🌐 All Branches & Network-wide', value: '' },
                                { label: '⚡ Network-wide only', value: 'network' },
                                ...(branchesQuery.data ?? []).map((b) => ({
                                    label: `🏢 ${b.name}`,
                                    value: b.branch_id,
                                })),
                            ]}
                        />
                    )}
                </div>

                <Table
                    rowKey="coupon_id"
                    columns={columns}
                    dataSource={data?.coupons ?? []}
                    loading={isLoading}
                    locale={{ emptyText: isError ? 'Failed to load coupons.' : 'No coupons yet.' }}
                    scroll={{ x: 'max-content' }}
                    sticky
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
                okText={editing ? 'Save Changes' : 'Create Coupon'}
                confirmLoading={createMutation.isPending || updateMutation.isPending}
                destroyOnHidden
                width={680}
            >
                <Form
                    form={form}
                    layout="vertical"
                    initialValues={{
                        discount_type: 'percentage',
                        is_active: true,
                        min_order_value: 0,
                        target_customer_type: 'all',
                        eligibility: 'all',
                    }}
                >
                    {/* Basic Coupon Details */}
                    <Form.Item
                        label="Coupon Code"
                        name="code"
                        rules={[
                            { required: true, message: 'Code is required' },
                            { min: 2, message: 'At least 2 characters' },
                        ]}
                    >
                        <Input placeholder="e.g. SAVE20, FLASH200" style={{ textTransform: 'uppercase' }} />
                    </Form.Item>

                    <Form.Item label="Description" name="description">
                        <Input.TextArea rows={2} placeholder="Internal note or campaign title" />
                    </Form.Item>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                label="Discount Type"
                                name="discount_type"
                                rules={[{ required: true, message: 'Please select discount type' }]}
                            >
                                <Select
                                    options={[
                                        { label: 'Percentage (%)', value: 'percentage' },
                                        { label: 'Fixed (LKR)', value: 'fixed' },
                                    ]}
                                />
                            </Form.Item>
                        </Col>

                        <Col span={12}>
                            <Form.Item
                                label="Discount Value"
                                name="discount_value"
                                rules={[
                                    { required: true, message: 'Enter value' },
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
                            >
                                <InputNumber
                                    min={0}
                                    step={discountType === 'percentage' ? 1 : 10}
                                    style={{ width: '100%' }}
                                    placeholder={discountType === 'percentage' ? '10' : '500'}
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
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
                            >
                                <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
                            </Form.Item>
                        </Col>

                        <Col span={12}>
                            <Form.Item
                                label="Max Discount Amount"
                                name="max_discount_amount"
                                extra="Cap for percentage discount"
                            >
                                <InputNumber
                                    min={0}
                                    disabled={discountType === 'fixed'}
                                    style={{ width: '100%' }}
                                    placeholder="Unlimited"
                                />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Row gutter={16}>
                        <Col span={12}>
                            <Form.Item
                                label="Usage Limit (total)"
                                name="usage_limit"
                                dependencies={['budget_cap']}
                                rules={[
                                    ({ getFieldValue }) => ({
                                        validator(_, value) {
                                            const budgetCap = getFieldValue('budget_cap');
                                            if ((value == null || value === '') && (budgetCap == null || budgetCap === '')) {
                                                return Promise.reject(
                                                    new Error('Financial Protection: Enter either Usage Limit or Total Campaign Budget')
                                                );
                                            }
                                            return Promise.resolve();
                                        },
                                    }),
                                ]}
                                extra="Leave blank for unlimited"
                            >
                                <InputNumber min={1} style={{ width: '100%' }} placeholder="Unlimited" />
                            </Form.Item>
                        </Col>

                        <Col span={12}>
                            <Form.Item
                                label="Per-customer Limit"
                                name="per_user_limit"
                                extra="Max uses per customer (blank = unlimited)"
                            >
                                <InputNumber min={1} style={{ width: '100%' }} placeholder="Unlimited" />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item
                        label="Show in app (collectible offer)"
                        name="is_public"
                        valuePropName="checked"
                        extra="Public: Visible in mobile app 'Available Offers'. Private: Only usable when code is typed."
                    >
                        <Switch checkedChildren="Public" unCheckedChildren="Private" />
                    </Form.Item>

                    {/* Targeted Promotions & Customer Eligibility */}
                    <Divider titlePlacement="start">
                        <span style={{ fontSize: 12, color: '#2563eb', fontWeight: 700 }}>
                            <CrownOutlined /> CUSTOMER ELIGIBILITY &amp; TARGETED PROMOTIONS
                        </span>
                    </Divider>

                    <Form.Item label="Target Customers" name="target_customer_type">
                        <Segmented
                            options={[
                                { label: 'All Customers', value: 'all' },
                                { label: 'Specific Customers (Whitelist)', value: 'specific' },
                                { label: 'Customer Tier', value: 'tier' },
                            ]}
                        />
                    </Form.Item>

                    {targetCustomerType === 'tier' && (
                        <Card size="small" style={{ background: '#f8fafc', marginBottom: 16 }}>
                            <Form.Item
                                label="Members from this level up"
                                name="min_tier_id"
                                rules={[{ required: true, message: 'Select a loyalty level' }]}
                                extra="Levels and their point thresholds are set by the Super Admin under Settings → Loyalty Levels."
                            >
                                <Select
                                    placeholder="Choose a loyalty level"
                                    loading={tiersQuery.isLoading}
                                    options={(tiersQuery.data ?? []).map((t) => ({
                                        label: `${t.name} (from ${t.min_points.toLocaleString()} points)${t.is_active ? '' : ' — switched off'}`,
                                        value: t.tier_id,
                                    }))}
                                />
                            </Form.Item>
                            <Alert
                                type="info"
                                showIcon
                                icon={<InfoCircleOutlined />}
                                message="Members only"
                                description="Only customers at this level or above see this offer in the app, and checkout refuses it for anyone else. Guests never see it."
                            />
                        </Card>
                    )}

                    {targetCustomerType === 'specific' && (
                        <Card size="small" style={{ background: '#f8fafc', marginBottom: 16 }}>
                            <div style={{ marginBottom: 12 }}>
                                <Text strong style={{ display: 'block', marginBottom: 6 }}>
                                    Search &amp; Add Whitelist Customers:
                                </Text>
                                <Space style={{ display: 'flex', marginBottom: 8 }} wrap>
                                    <Input
                                        placeholder="Customer Name"
                                        value={custNameInput}
                                        onChange={(e) => setCustNameInput(e.target.value)}
                                        prefix={<UserOutlined />}
                                        style={{ width: 180 }}
                                    />
                                    <Input
                                        placeholder="Phone Number"
                                        value={custPhoneInput}
                                        onChange={(e) => setCustPhoneInput(e.target.value)}
                                        prefix={<MobileOutlined />}
                                        style={{ width: 180 }}
                                    />
                                    <Button
                                        type="primary"
                                        icon={<UserAddOutlined />}
                                        onClick={handleAddCustomerChip}
                                    >
                                        Add
                                    </Button>
                                </Space>
                            </div>

                            {/* Customer Chip Tags */}
                            <div style={{ marginBottom: 12 }}>
                                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                                    Whitelisted Customers ({whitelistedCustomers.length}):
                                </Text>
                                <div
                                    style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        gap: 6,
                                        maxHeight: 120,
                                        overflowY: 'auto',
                                        padding: 8,
                                        background: '#fff',
                                        border: '1px solid #e2e8f0',
                                        borderRadius: 6,
                                    }}
                                >
                                    {whitelistedCustomers.length === 0 ? (
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            No whitelisted customers added yet. Use search/add or import CSV below.
                                        </Text>
                                    ) : (
                                        whitelistedCustomers.map((cust, idx) => (
                                            <Tag
                                                key={idx}
                                                closable
                                                onClose={() => handleRemoveCustomerChip(idx)}
                                                color="blue"
                                                style={{ marginInlineEnd: 0, padding: '2px 8px' }}
                                            >
                                                {cust.name} {cust.phone ? `(${cust.phone})` : ''}
                                            </Tag>
                                        ))
                                    )}
                                </div>
                            </div>

                            {/* CSV Actions */}
                            <Space size="middle" style={{ marginTop: 8 }} wrap>
                                <Upload
                                    beforeUpload={handleImportCSV}
                                    showUploadList={false}
                                    accept=".csv"
                                >
                                    <Button size="small" icon={<UploadOutlined />}>
                                        Import CSV
                                    </Button>
                                </Upload>
                                <Button
                                    size="small"
                                    icon={<DownloadOutlined />}
                                    onClick={handleExportCSV}
                                    disabled={whitelistedCustomers.length === 0}
                                >
                                    Export CSV
                                </Button>
                                <Button
                                    size="small"
                                    type="link"
                                    icon={<FileTextOutlined />}
                                    onClick={handleSampleCSV}
                                >
                                    Sample CSV
                                </Button>
                            </Space>
                        </Card>
                    )}

                    {/* Catalog Eligibility */}
                    <Divider titlePlacement="start">
                        <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>
                            CATALOG ELIGIBILITY
                        </span>
                    </Divider>

                    <Form.Item label="Catalog Scope" name="eligibility">
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
                            label="Eligible Categories"
                            name="category_ids"
                            rules={[{ required: true, message: 'Select at least one category' }]}
                            extra="Only items in selected categories receive discount & count toward minimum order."
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

                    {/* Automated Dispatch & Notification Panel */}
                    <Divider titlePlacement="start">
                        <span style={{ fontSize: 12, color: '#16a34a', fontWeight: 700 }}>
                            <SendOutlined /> AUTOMATED DISPATCH &amp; NOTIFICATION PANEL
                        </span>
                    </Divider>

                    <Form.Item
                        name="dispatch_enabled"
                        valuePropName="checked"
                        extra="Automatically send promo details to eligible target customers when saved."
                    >
                        <Switch
                            checkedChildren="Send promo code directly via SMS / Email / Push"
                            unCheckedChildren="Manual / No auto dispatch"
                        />
                    </Form.Item>

                    {dispatchEnabled && (
                        <Card size="small" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', marginBottom: 16 }}>
                            <Form.Item
                                label="Select Dispatch Channels"
                                name="dispatch_channels"
                                rules={[{ required: true, message: 'Choose at least one channel' }]}
                            >
                                <Checkbox.Group
                                    options={[
                                        { label: <span><MobileOutlined /> SMS</span>, value: 'sms' },
                                        { label: <span><MailOutlined /> Email</span>, value: 'email' },
                                        { label: <span><NotificationOutlined /> App Push</span>, value: 'push' },
                                    ]}
                                />
                            </Form.Item>

                            <Form.Item
                                label="Notification Message Template"
                                name="dispatch_template"
                                rules={[{ required: true, message: 'Enter a notification template' }]}
                                extra="Click variable chips below to insert dynamic tokens into your message."
                            >
                                <Input.TextArea rows={3} placeholder="Notification template text..." />
                            </Form.Item>

                            {/* Dynamic Variable Chips */}
                            <div style={{ marginBottom: 12 }}>
                                <Text type="secondary" style={{ display: 'block', marginBottom: 4, fontSize: 12 }}>
                                    Insert Dynamic Variables:
                                </Text>
                                <Space wrap>
                                    <Tag
                                        color="green"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => insertVariable('{customer_name}')}
                                    >
                                        + {'{customer_name}'}
                                    </Tag>
                                    <Tag
                                        color="green"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => insertVariable('{coupon_code}')}
                                    >
                                        + {'{coupon_code}'}
                                    </Tag>
                                    <Tag
                                        color="green"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => insertVariable('{discount_value}')}
                                    >
                                        + {'{discount_value}'}
                                    </Tag>
                                    <Tag
                                        color="green"
                                        style={{ cursor: 'pointer' }}
                                        onClick={() => insertVariable('{validity_date}')}
                                    >
                                        + {'{validity_date}'}
                                    </Tag>
                                </Space>
                            </div>

                            {/* Message Live Preview */}
                            <Alert
                                type="success"
                                showIcon
                                message="Message Live Preview"
                                description={<Text style={{ fontSize: 12 }}>"{getLivePreview()}"</Text>}
                            />
                        </Card>
                    )}

                    {/* Financial Protection */}
                    <Divider titlePlacement="start">
                        <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 700 }}>
                            FINANCIAL PROTECTION &amp; SCOPE
                        </span>
                    </Divider>

                    <Form.Item
                        label="Total campaign budget"
                        name="budget_cap"
                        dependencies={['usage_limit']}
                        rules={[
                            ({ getFieldValue }) => ({
                                validator(_, value) {
                                    const usageLimit = getFieldValue('usage_limit');
                                    if ((value == null || value === '') && (usageLimit == null || usageLimit === '')) {
                                        return Promise.reject(
                                            new Error('Financial Protection: Enter either Total Campaign Budget or Usage Limit')
                                        );
                                    }
                                    return Promise.resolve();
                                },
                            }),
                        ]}
                        extra="Maximum total discount amount allocated to this campaign."
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
                        extra="Deactivates coupon immediately once budget limit is reached."
                    >
                        <Switch
                            checkedChildren="Auto-stop at budget"
                            unCheckedChildren="Keep running"
                        />
                    </Form.Item>

                    {isSuperAdmin && !editing && (
                        <>
                            <Form.Item label="Branch Scope" name="branch_scope">
                                <Radio.Group
                                    options={[
                                        { label: 'All Branches (Network-wide)', value: 'network' },
                                        { label: 'Specific Branch', value: 'branch' },
                                    ]}
                                    optionType="button"
                                />
                            </Form.Item>

                            {branchScope === 'branch' && (
                                <Form.Item
                                    label="Target Branch"
                                    name="branch_id"
                                    rules={[{ required: true, message: 'Select a branch' }]}
                                >
                                    <Select
                                        placeholder="Choose branch"
                                        loading={branchesQuery.isLoading}
                                        options={(branchesQuery.data ?? []).map((b) => ({
                                            label: b.name,
                                            value: b.branch_id,
                                        }))}
                                    />
                                </Form.Item>
                            )}
                        </>
                    )}

                    <Form.Item
                        name="first_order_only"
                        valuePropName="checked"
                        extra="Acquisition offer: Restricts coupon to new customers with no prior completed orders."
                    >
                        <Switch
                            checkedChildren="First order only"
                            unCheckedChildren="Any order"
                        />
                    </Form.Item>

                    <Form.Item
                        label="Validity Period"
                        name="validity"
                        rules={[{ required: true, message: 'Select validity range' }]}
                    >
                        <RangePicker style={{ width: '100%' }} format="YYYY-MM-DD" />
                    </Form.Item>

                    <Form.Item label="Active Status" name="is_active" valuePropName="checked">
                        <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default CouponList;
