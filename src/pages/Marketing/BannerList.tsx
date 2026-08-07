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
}

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
        form.setFieldsValue({ sort_order: banners.length + 1, is_active: true, branch_scope: 'branch' });
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
        const payload: BannerPayload = {
            title: values.title,
            subtitle: values.subtitle || null,
            image_url: imageUrl,
            sort_order: values.sort_order ?? 0,
            is_active: values.is_active,
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
            title: 'Order',
            dataIndex: 'sort_order',
            key: 'sort_order',
            width: 80,
            align: 'right',
        },
        {
            title: 'Status',
            dataIndex: 'is_active',
            key: 'is_active',
            width: 100,
            render: (v: boolean) =>
                v ? <Tag color="green">Live</Tag> : <Tag>Hidden</Tag>,
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

                    <Form.Item label="Live" name="is_active" valuePropName="checked">
                        <Switch checkedChildren="Live" unCheckedChildren="Hidden" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default BannerList;
