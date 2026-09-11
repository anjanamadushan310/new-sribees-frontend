/**
 * Home Banners (Branch Manager / Marketing Manager / Super Admin)
 *
 * Curates the promotional carousel on the mobile app's home screen. The server
 * scopes writes to the caller's branch, so a manager here is editing exactly
 * what their own customers see. Platform-wide banners (created by a Super Admin)
 * appear in the list read-only, because every branch shows them.
 */
import React, { useState } from 'react';
import {
    Card,
    Table,
    Tag,
    Space,
    Button,
    Modal,
    Form,
    Input,
    InputNumber,
    Switch,
    Select,
    Upload,
    Popconfirm,
    App,
    Typography,
    Tooltip,
    Image,
    Divider,
    DatePicker,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    PictureOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { UploadChangeParam, UploadFile } from 'antd/es/upload';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs, { Dayjs } from 'dayjs';
import { categoriesApi } from '../../api/categories.api';
import { marketingApi } from '../../api/marketing.api';
import { bannersApi } from '../../api/banners.api';
import type { Banner, BannerPayload } from '../../api/banners.api';
import { branchesApi } from '../../api/branches.api';
import { usePermissions } from '../../hooks/usePermissions';

const { Title, Text } = Typography;

const BANNERS_KEY = 'admin-banners';

interface BannerFormValues {
    title: string;
    subtitle?: string;
    sort_order: number;
    is_active: boolean;
    branch_scope?: 'branch' | 'platform';
    /** 'none' is the form's way of saying link_type = null. */
    link_type: BannerLinkType | 'none';
    target_id?: string;
    always_active: boolean;
    schedule?: [Dayjs, Dayjs];
}

const STATUS_META: Record<BannerStatus, { label: string; color: string; hint: string }> = {
    live: { label: 'Live', color: 'green', hint: 'On customers’ home screens right now' },
    scheduled: { label: 'Scheduled', color: 'blue', hint: 'Starts at its scheduled time' },
    expired: {
        label: 'Expired',
        color: 'red',
        hint: 'Its end time has passed — hidden automatically, nobody switched it off',
    },
    inactive: { label: 'Inactive', color: 'default', hint: 'Switched off by an admin' },
};

/** What the customer's tap opens. */
const DESTINATION_LABEL: Record<BannerLinkType, string> = {
    quick_sale: 'Quick Sale feed',
    category: 'Category',
    product: 'Product',
};

/**
 * Below this many impressions in the window, a CTR percentage is noise — one
 * click out of three views is not a 33% click-through rate, and showing it as
 * one would have managers retiring banners nobody has seen yet.
 */
const MIN_IMPRESSIONS_FOR_CTR = 50;

const BannerList: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const { isSuperAdmin } = usePermissions();
    const [form] = Form.useForm<BannerFormValues>();

    const [branchId, setBranchId] = useState<string | undefined>(undefined);
    const [editing, setEditing] = useState<Banner | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [uploading, setUploading] = useState(false);
    const linkType = Form.useWatch('link_type', form);
    const alwaysActive = Form.useWatch('always_active', form);

    const { data: branches = [] } = useQuery({
        queryKey: ['admin', 'branches'],
        queryFn: branchesApi.list,
        enabled: isSuperAdmin,
    });

    const { data, isLoading, isError } = useQuery({
        queryKey: [BANNERS_KEY, branchId],
        queryFn: () => bannersApi.list(branchId),
    });

    const banners = data?.banners ?? [];
    const scope = data?.scope;

    const invalidate = () =>
        queryClient.invalidateQueries({ queryKey: [BANNERS_KEY] });

    const saveMutation = useMutation({
        mutationFn: (payload: BannerPayload) =>
            editing
                ? bannersApi.update(editing.banner_id, payload)
                : bannersApi.create(payload),
        onSuccess: () => {
            message.success(editing ? 'Banner updated.' : 'Banner created.');
            closeModal();
            invalidate();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to save banner.'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => bannersApi.remove(id),
        onSuccess: () => {
            message.success('Banner deleted.');
            invalidate();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to delete banner.'),
    });

    const openCreate = () => {
        setEditing(null);
        setImageUrl(null);
        form.resetFields();
        form.setFieldsValue({
            sort_order: banners.length + 1,
            is_active: true,
            branch_scope: 'branch',
            link_type: 'none',
            always_active: true,
        });
        setModalOpen(true);
    };

    const openEdit = (banner: Banner) => {
        setEditing(banner);
        setImageUrl(banner.image_url);
        form.setFieldsValue({
            title: banner.title,
            subtitle: banner.subtitle ?? undefined,
            sort_order: banner.sort_order,
            is_active: banner.is_active,
            branch_scope: banner.is_platform_wide ? 'platform' : 'branch',
            link_type: banner.link_type ?? 'none',
            target_id: banner.target_id ?? undefined,
            always_active: banner.is_always_active,
            schedule:
                banner.starts_at && banner.ends_at
                    ? [dayjs(banner.starts_at), dayjs(banner.ends_at)]
                    : undefined,
        });
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditing(null);
        setImageUrl(null);
        form.resetFields();
    };

    const handleUpload = async (info: UploadChangeParam<UploadFile>) => {
        const file = info.file.originFileObj ?? (info.file as unknown as File);
        if (!file) return;
        setUploading(true);
        try {
            const url = await bannersApi.uploadImage(file as File);
            setImageUrl(url);
            message.success('Image uploaded.');
        } catch {
            message.error('Image upload failed.');
        } finally {
            setUploading(false);
        }
    };

    const handleSave = async () => {
        const values = await form.validateFields();
        const linkType = values.link_type === 'none' ? null : values.link_type;
        const payload: BannerPayload = {
            title: values.title,
            subtitle: values.subtitle || null,
            image_url: imageUrl,
            sort_order: values.sort_order ?? 0,
            is_active: values.is_active,
            link_type: linkType,
            // Quick Sale opens a fixed screen and must carry NO target; sending
            // a stale one is rejected by the server, and rightly so — an edit
            // that switched away from a product banner would otherwise leave
            // the old product id behind.
            target_id:
                linkType === 'category' || linkType === 'product'
                    ? (values.target_id ?? null)
                    : null,
            // Always sent, including as nulls: that is how a scheduled banner
            // is turned back into an always-on one.
            starts_at: values.always_active
                ? null
                : (values.schedule?.[0]?.toISOString() ?? null),
            ends_at: values.always_active
                ? null
                : (values.schedule?.[1]?.toISOString() ?? null),
        };
        // Only a Super Admin gets to choose; the server pins everyone else to
        // their own branch regardless of what we send.
        if (isSuperAdmin && !editing) {
            payload.branch_id =
                values.branch_scope === 'platform' ? null : branchId ?? null;
        }
        saveMutation.mutate(payload);
    };

    // A scoped manager may only edit their own branch's rows; platform-wide
    // banners are shown so they know what their customers see, but are locked.
    // Names for the Destination column. A raw UUID tells a manager nothing
    // about where their banner sends people.
    const categoriesQuery = useQuery({
        queryKey: ['admin', 'categories', 'for-banners'],
        queryFn: () => categoriesApi.list(),
    });
    const productsQuery = useQuery({
        queryKey: ['admin', 'marketing', 'products', 'for-banners'],
        queryFn: () => marketingApi.listProducts({ limit: 100 }),
    });

    const categoryNames = React.useMemo(
        () => new Map((categoriesQuery.data ?? []).map((c) => [c.category_id, c.name])),
        [categoriesQuery.data],
    );
    const productNames = React.useMemo(
        () =>
            new Map(
                (productsQuery.data?.products ?? []).map((p) => [p.product_id, p.name]),
            ),
        [productsQuery.data],
    );

    const canModify = (b: Banner) => (scope?.is_super_admin ?? isSuperAdmin) || !b.is_platform_wide;

    const columns: ColumnsType<Banner> = [
        {
            title: 'Image',
            key: 'image',
            width: 110,
            render: (_, record) =>
                record.image_url ? (
                    <Image
                        src={record.image_url}
                        alt={record.title}
                        width={84}
                        height={48}
                        style={{ objectFit: 'cover', borderRadius: 6 }}
                    />
                ) : (
                    <div
                        style={{
                            width: 84,
                            height: 48,
                            borderRadius: 6,
                            background: '#f0f0f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#bbb',
                        }}
                    >
                        <PictureOutlined />
                    </div>
                ),
        },
        {
            title: 'Title',
            key: 'title',
            render: (_, record) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{record.title}</Text>
                    {record.subtitle && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {record.subtitle}
                        </Text>
                    )}
                </Space>
            ),
        },
        {
            title: 'Scope',
            key: 'scope',
            width: 150,
            render: (_, record) =>
                record.is_platform_wide ? (
                    <Tooltip title="Shown in every branch. Managed by a Super Admin.">
                        <Tag color="purple">All branches</Tag>
                    </Tooltip>
                ) : (
                    <Tag color="geekblue">This branch</Tag>
                ),
        },
        {
            title: 'Destination',
            key: 'destination',
            width: 200,
            render: (_, record) => {
                if (!record.link_type) {
                    return (
                        <Tooltip title="Informational banner — tapping it does nothing.">
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                No tap action
                            </Text>
                        </Tooltip>
                    );
                }
                const name =
                    record.link_type === 'category'
                        ? categoryNames.get(record.target_id ?? '')
                        : record.link_type === 'product'
                          ? productNames.get(record.target_id ?? '')
                          : null;
                return (
                    <Text style={{ fontSize: 12, color: '#1e40af', fontWeight: 500 }}>
                        → {DESTINATION_LABEL[record.link_type]}
                        {name ? `: ${name}` : ''}
                    </Text>
                );
            },
        },
        {
            title: (
                <Tooltip title="Clicks ÷ impressions over the last 7 days, counted in your branch. A platform-wide banner reports how it performs here, not network-wide.">
                    <span>Performance (CTR)</span>
                </Tooltip>
            ),
            key: 'performance',
            width: 165,
            render: (_, record) => (
                <div>
                    {record.ctr != null ? (
                        <div
                            style={{
                                fontWeight: 600,
                                color:
                                    record.ctr >= 7
                                        ? '#16a34a'
                                        : record.ctr < 3
                                          ? '#dc2626'
                                          : '#1e293b',
                            }}
                        >
                            {record.ctr.toFixed(1)}% CTR
                        </div>
                    ) : (
                        <Tooltip
                            title={`Needs at least ${MIN_IMPRESSIONS_FOR_CTR} impressions before a rate means anything.`}
                        >
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Collecting data
                            </Text>
                        </Tooltip>
                    )}
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>
                        {record.clicks.toLocaleString()} clicks /{' '}
                        {record.impressions.toLocaleString()} views
                    </div>
                </div>
            ),
        },
        {
            title: 'Validity',
            key: 'validity',
            width: 180,
            render: (_, record) =>
                record.is_always_active ? (
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        Always active
                    </Text>
                ) : (
                    <div style={{ fontSize: 12 }}>
                        {record.ends_at && (
                            <div style={{ fontWeight: 500 }}>
                                Ends: {dayjs(record.ends_at).format('MMM D, h:mm A')}
                            </div>
                        )}
                        {record.starts_at && (
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>
                                From: {dayjs(record.starts_at).format('MMM D, h:mm A')}
                            </div>
                        )}
                    </div>
                ),
        },
        {
            title: 'Order',
            dataIndex: 'sort_order',
            key: 'sort_order',
            width: 80,
            align: 'right',
        },
        {
            title: 'Status',
            key: 'status',
            width: 120,
            render: (_, record) => {
                // Server-derived, so "Expired" (its own end time passed) is
                // distinguishable from "Inactive" (a person switched it off).
                // Conflating them makes an admin re-enable a finished campaign.
                const meta = STATUS_META[record.status] ?? STATUS_META.inactive;
                return (
                    <Tooltip title={meta.hint}>
                        <Tag color={meta.color}>{meta.label}</Tag>
                    </Tooltip>
                );
            },
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 170,
            render: (_, record) => {
                const allowed = canModify(record);
                return (
                    <Space>
                        <Tooltip
                            title={allowed ? undefined : 'Only a Super Admin can edit this.'}
                        >
                            <Button
                                type="link"
                                icon={<EditOutlined />}
                                disabled={!allowed}
                                onClick={() => openEdit(record)}
                            >
                                Edit
                            </Button>
                        </Tooltip>
                        <Popconfirm
                            title="Delete this banner?"
                            description="It disappears from the app immediately."
                            onConfirm={() => deleteMutation.mutate(record.banner_id)}
                            disabled={!allowed}
                        >
                            <Button
                                type="link"
                                danger
                                icon={<DeleteOutlined />}
                                disabled={!allowed}
                            />
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
                    alignItems: 'flex-start',
                }}
            >
                <div>
                    <Title level={3} style={{ margin: 0 }}>
                        <Space>
                            <PictureOutlined />
                            Home Banners
                        </Space>
                    </Title>
                    <Text type="secondary">
                        The promotional carousel on the app's home screen — customers in
                        your branch see these.
                    </Text>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                    Add Banner
                </Button>
            </div>

            {isSuperAdmin && (
                <Card size="small" style={{ marginBottom: 16 }}>
                    <Space>
                        <Text>Branch</Text>
                        <Select
                            placeholder="All branches (platform-wide only)"
                            style={{ width: 280 }}
                            allowClear
                            value={branchId}
                            onChange={setBranchId}
                            options={branches.map((b) => ({ label: b.name, value: b.branch_id }))}
                        />
                    </Space>
                </Card>
            )}

            <Card>
                <Table
                    rowKey="banner_id"
                    columns={columns}
                    dataSource={banners}
                    loading={isLoading}
                    pagination={false}
                    locale={{
                        emptyText: isError
                            ? 'Failed to load banners.'
                            : 'No banners yet — add one to fill the carousel.',
                    }}
                />
            </Card>

            <Modal
                title={editing ? 'Edit Banner' : 'Add Banner'}
                open={modalOpen}
                onOk={handleSave}
                onCancel={closeModal}
                okText={editing ? 'Save' : 'Create'}
                confirmLoading={saveMutation.isPending}
                destroyOnHidden
            >
                <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
                    <Form.Item
                        label="Title"
                        name="title"
                        rules={[{ required: true, message: 'Enter a title' }]}
                    >
                        <Input placeholder="e.g. Fresh Farm Produce" maxLength={120} />
                    </Form.Item>

                    <Form.Item label="Subtitle" name="subtitle">
                        <Input placeholder="e.g. Delivered straight to you." maxLength={200} />
                    </Form.Item>

                    <Form.Item
                        label="Image"
                        extra="Optional. Without one the app renders a colour gradient behind the text."
                    >
                        <Space direction="vertical" style={{ width: '100%' }}>
                            {imageUrl && (
                                <Image
                                    src={imageUrl}
                                    alt="Banner preview"
                                    width="100%"
                                    height={120}
                                    style={{ objectFit: 'cover', borderRadius: 8 }}
                                />
                            )}
                            <Upload
                                accept="image/*"
                                maxCount={1}
                                showUploadList={false}
                                customRequest={({ onSuccess }) =>
                                    setTimeout(() => onSuccess?.('ok'), 0)
                                }
                                onChange={handleUpload}
                            >
                                <Button icon={<UploadOutlined />} loading={uploading}>
                                    {imageUrl ? 'Replace image' : 'Upload image'}
                                </Button>
                            </Upload>
                        </Space>
                    </Form.Item>

                    {isSuperAdmin && !editing && (
                        <Form.Item
                            label="Show in"
                            name="branch_scope"
                            extra={
                                branchId
                                    ? undefined
                                    : 'Select a branch above to target a single branch.'
                            }
                        >
                            <Select
                                options={[
                                    {
                                        label: 'All branches (platform-wide)',
                                        value: 'platform',
                                    },
                                    {
                                        label: 'Selected branch only',
                                        value: 'branch',
                                        disabled: !branchId,
                                    },
                                ]}
                            />
                        </Form.Item>
                    )}

                    <Form.Item
                        label="Order"
                        name="sort_order"
                        extra="Lower numbers appear first in the carousel."
                    >
                        <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>

                    {/* ============ Click destination ============
                        A banner with no destination is decoration. This is what
                        turns the carousel into a route into the catalog. */}
                    <Divider orientation="left" orientationMargin={0}>
                        <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>
                            CLICK ACTION (DESTINATION)
                        </span>
                    </Divider>

                    <Form.Item
                        label="What opens when a customer taps this?"
                        name="link_type"
                    >
                        <Select
                            options={[
                                { label: 'Nothing — informational only', value: 'none' },
                                { label: 'Quick Sale feed', value: 'quick_sale' },
                                { label: 'A category', value: 'category' },
                                { label: 'A specific product', value: 'product' },
                            ]}
                        />
                    </Form.Item>

                    {linkType === 'category' && (
                        <Form.Item
                            label="Category"
                            name="target_id"
                            rules={[{ required: true, message: 'Pick the category to open' }]}
                        >
                            <Select
                                showSearch
                                optionFilterProp="label"
                                loading={categoriesQuery.isLoading}
                                placeholder="Choose a category"
                                options={(categoriesQuery.data ?? []).map((c) => ({
                                    label: c.name,
                                    value: c.category_id,
                                }))}
                            />
                        </Form.Item>
                    )}

                    {linkType === 'product' && (
                        <Form.Item
                            label="Product"
                            name="target_id"
                            rules={[{ required: true, message: 'Pick the product to open' }]}
                        >
                            <Select
                                showSearch
                                optionFilterProp="label"
                                loading={productsQuery.isLoading}
                                placeholder="Choose a product stocked in your branch"
                                options={(productsQuery.data?.products ?? []).map((p) => ({
                                    label: p.name,
                                    value: p.product_id,
                                }))}
                            />
                        </Form.Item>
                    )}

                    {/* ============ Schedule ============ */}
                    <Divider orientation="left" orientationMargin={0}>
                        <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>
                            SCHEDULE
                        </span>
                    </Divider>

                    <Form.Item
                        name="always_active"
                        valuePropName="checked"
                        extra="Off = the banner appears and hides itself at the times below, with nobody having to remember."
                    >
                        <Switch
                            checkedChildren="Always active"
                            unCheckedChildren="Scheduled"
                        />
                    </Form.Item>

                    {!alwaysActive && (
                        <Form.Item
                            label="Live from → until"
                            name="schedule"
                            rules={[{ required: true, message: 'Pick a start and end time' }]}
                        >
                            <DatePicker.RangePicker
                                showTime={{ format: 'HH:mm' }}
                                format="YYYY-MM-DD HH:mm"
                                style={{ width: '100%' }}
                            />
                        </Form.Item>
                    )}

                    <Form.Item label="Live" name="is_active" valuePropName="checked">
                        <Switch checkedChildren="Live" unCheckedChildren="Hidden" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default BannerList;
