/**
 * Category Management (Admin Module 7.4)
 * Paginated table of categories with modal-based create/edit and delete.
 * Data layer is TanStack Query against /api/v1/admin/categories.
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
    Select,
    Segmented,
    Switch,
    Popconfirm,
    Alert,
    App,
    Typography,
    Tabs,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    PictureOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { categoriesApi } from '../../api/categories.api';
import type { Category, CategoryPayload } from '../../api/categories.api';
import CategoryImageUpload from '../../components/categories/CategoryImageUpload';
import { usePermissions } from '../../hooks/usePermissions';
import { DebouncedSearchInput } from '../../components/common/DebouncedSearchInput';

const { Title, Text } = Typography;

/**
 * The hierarchy is exactly two levels, so a category is one of two things. This
 * is modelled as an explicit choice rather than inferred from whether a generic
 * "Parent Category" dropdown happens to be filled in — that was ambiguous, and
 * it gave no hint that nesting stops at two levels.
 *
 * The choice also decides whether an image applies: only a Top-Level category
 * gets a tile on the mobile home screen, so only it can carry an image.
 */
type CategoryKind = 'top' | 'sub';

// "Organic Fruits" -> "organic-fruits"
const slugify = (text: string): string =>
    text
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

const CATEGORIES_KEY = ['admin', 'categories'];

const CategoryList: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [form] = Form.useForm<CategoryPayload>();
    // Support staff get a read-only Categories screen (B5).
    const { canCreate, canUpdate, canDelete } = usePermissions();
    const canWrite = canCreate('categories') || canUpdate('categories');
    const canRemove = canDelete('categories');

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Category | null>(null);
    const [search, setSearch] = useState('');
    const [slugTouched, setSlugTouched] = useState(false);
    const [kind, setKind] = useState<CategoryKind>('top');
    const [imageUrl, setImageUrl] = useState<string | null>(null);

    const {
        data: categories = [],
        isLoading,
        isError,
    } = useQuery({
        queryKey: CATEGORIES_KEY,
        queryFn: categoriesApi.list,
    });

    const invalidate = () => queryClient.invalidateQueries({ queryKey: CATEGORIES_KEY });

    const createMutation = useMutation({
        mutationFn: (payload: CategoryPayload) => categoriesApi.create(payload),
        onSuccess: () => {
            message.success('Category created.');
            closeModal();
            invalidate();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to create category.'),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: Partial<CategoryPayload> }) =>
            categoriesApi.update(id, payload),
        onSuccess: () => {
            message.success('Category updated.');
            closeModal();
            invalidate();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to update category.'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => categoriesApi.remove(id),
        onSuccess: () => {
            message.success('Category deleted.');
            invalidate();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to delete category.'),
    });

    // Categories are exactly two levels deep (the backend rejects deeper
    // nesting), so a parent is always a root and a sub-category never has one.
    const rootCategories = categories.filter((c) => !c.parent_category_id);

    // Demoting a category that already has sub-categories would push them to a
    // third level, which cannot exist — so that switch is locked.
    const hasChildren =
        !!editing &&
        categories.some((c) => c.parent_category_id === editing.category_id);

    /** Open the modal to create a category, or a sub-category under `parent`. */
    const openCreate = (parent?: Category) => {
        setEditing(null);
        setSlugTouched(false);
        setKind(parent ? 'sub' : 'top');
        setImageUrl(null);
        form.resetFields();
        form.setFieldsValue({
            is_active: true,
            parent_category_id: parent?.category_id ?? null,
        });
        setModalOpen(true);
    };

    const openEdit = (record: Category) => {
        setEditing(record);
        setSlugTouched(true); // don't auto-overwrite an existing slug
        setKind(record.parent_category_id ? 'sub' : 'top');
        setImageUrl(record.image_url ?? null);
        form.setFieldsValue({
            name: record.name,
            name_si: record.name_si ?? '',
            name_ta: record.name_ta ?? '',
            slug: record.slug,
            description: record.description ?? '',
            description_si: record.description_si ?? '',
            description_ta: record.description_ta ?? '',
            parent_category_id: record.parent_category_id ?? null,
            is_active: record.is_active,
        });
        setModalOpen(true);
    };

    /**
     * Switching kind must also drop whatever the other kind owned, or the form
     * would submit a contradiction: a sub-category carrying an image (which the
     * API rejects), or a top-level category still pointing at a parent.
     */
    const onKindChange = (next: CategoryKind) => {
        setKind(next);
        if (next === 'top') {
            form.setFieldsValue({ parent_category_id: null });
        } else {
            setImageUrl(null);
        }
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditing(null);
        setKind('top');
        setImageUrl(null);
        form.resetFields();
    };

    const handleSubmit = async () => {
        const values = await form.validateFields();
        const isSub = kind === 'sub';
        const payload: CategoryPayload = {
            name: values.name.trim(),
            slug: (values.slug || slugify(values.name)).trim(),
            description: values.description?.trim() || null,
            // Blank translations go as null, not "", so the backend treats them
            // as absent and customers fall back to the English copy.
            name_si: values.name_si?.trim() || null,
            name_ta: values.name_ta?.trim() || null,
            description_si: values.description_si?.trim() || null,
            description_ta: values.description_ta?.trim() || null,
            // The kind is the source of truth, not whatever is left in the
            // fields: a top-level category never sends a parent, and a
            // sub-category never sends an image (the API rejects that pairing).
            parent_category_id: isSub ? values.parent_category_id || null : null,
            image_url: isSub ? null : imageUrl,
            is_active: values.is_active ?? true,
        };
        if (editing) {
            updateMutation.mutate({ id: editing.category_id, payload });
        } else {
            createMutation.mutate(payload);
        }
    };

    const matches = (c: Category) => {
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (
            c.name.toLowerCase().includes(q) ||
            c.slug.toLowerCase().includes(q) ||
            (c.description ?? '').toLowerCase().includes(q)
        );
    };

    // Nest sub-categories under their parent. antd renders a `children` array as
    // expandable rows, but an empty one still draws an expand caret — so the key
    // is only attached when the category actually has sub-categories.
    // A parent is kept when it matches OR any of its children do, so searching
    // for a sub-category doesn't hide the branch it lives on.
    const treeData: Category[] = rootCategories
        .map((root) => {
            const children = categories.filter(
                (c) => c.parent_category_id === root.category_id && matches(c)
            );
            const keep = matches(root) || children.length > 0;
            if (!keep) return null;

            const visibleChildren = matches(root)
                ? categories.filter((c) => c.parent_category_id === root.category_id)
                : children;

            return visibleChildren.length > 0
                ? { ...root, children: visibleChildren }
                : { ...root };
        })
        .filter((c): c is Category => c !== null);

    const columns = [
        {
            title: 'Image',
            dataIndex: 'image_url',
            key: 'image_url',
            width: 80,
            render: (url: string | null, record) => {
                // Only top-level categories get a home-screen tile, so a blank
                // cell on a sub-category is expected, not missing data.
                if (record.parent_category_id) {
                    return <Text type="secondary">—</Text>;
                }
                return url ? (
                    <img
                        src={url}
                        alt={record.name}
                        style={{
                            width: 44,
                            height: 44,
                            objectFit: 'cover',
                            borderRadius: 6,
                            border: '1px solid #f0f0f0',
                        }}
                    />
                ) : (
                    <PictureOutlined style={{ fontSize: 22, color: '#d9d9d9' }} />
                );
            },
        },
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (name: string, record) => (
                <Space>
                    <Text strong={!record.parent_category_id}>{name}</Text>
                    {record.parent_category_id && <Tag color="purple">Sub</Tag>}
                </Space>
            ),
        },
        {
            title: 'Slug',
            dataIndex: 'slug',
            key: 'slug',
            render: (slug: string) => <Tag>{slug}</Tag>,
        },
        {
            title: 'Description',
            dataIndex: 'description',
            key: 'description',
            width: 280,
            render: (d: string | null) =>
                d ? (
                    <div style={{ maxWidth: 280, wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                        {d}
                    </div>
                ) : (
                    <span style={{ color: '#bbb' }}>—</span>
                ),
        },
        {
            title: 'Products',
            dataIndex: 'product_count',
            key: 'product_count',
            width: 100,
            align: 'center',
            render: (count: number = 0) => <Tag color="geekblue">{count}</Tag>,
            sorter: (a, b) => (a.product_count ?? 0) - (b.product_count ?? 0),
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
        ...(canWrite || canRemove
            ? [{
                title: 'Actions',
                key: 'actions',
                width: 260,
                render: (_: unknown, record: Category) => (
                    <Space>
                        {/* Only a root category can take sub-categories — the
                            tree is capped at two levels. */}
                        {canWrite && !record.parent_category_id && (
                            <Button
                                type="link"
                                icon={<PlusOutlined />}
                                onClick={() => openCreate(record)}
                            >
                                Sub-category
                            </Button>
                        )}
                        {canWrite && (
                            <Button
                                type="link"
                                icon={<EditOutlined />}
                                onClick={() => openEdit(record)}
                            >
                                Edit
                            </Button>
                        )}
                        {canRemove && (
                            <Popconfirm
                                title="Delete category"
                                description="Categories with products or sub-categories cannot be deleted."
                                okText="Delete"
                                okButtonProps={{ danger: true }}
                                onConfirm={() => deleteMutation.mutate(record.category_id)}
                            >
                                <Button type="link" danger icon={<DeleteOutlined />}>
                                    Delete
                                </Button>
                            </Popconfirm>
                        )}
                    </Space>
                ),
            }]
            : []),
    ] as ColumnsType<Category>;

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
                    Categories
                </Title>
                {canCreate('categories') && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => openCreate()}>
                        Add Category
                    </Button>
                )}
            </div>

            <Card>
                <div style={{ marginBottom: 16 }}>
                    <DebouncedSearchInput
                        placeholder="Search name, slug, description…"
                        value={search}
                        onChange={setSearch}
                        style={{ width: 320 }}
                    />
                </div>

                <Table
                    rowKey="category_id"
                    columns={columns}
                    dataSource={treeData}
                    loading={isLoading}
                    locale={{
                        emptyText: isError ? 'Failed to load categories.' : 'No categories yet.',
                    }}
                    expandable={{ defaultExpandAllRows: true }}
                    scroll={{ x: 'max-content' }}
                    pagination={{
                        pageSize: 10,
                        showSizeChanger: true,
                        showTotal: (t) => `Total ${t} categories`,
                    }}
                />
            </Card>

            <Modal
                title={editing ? 'Edit Category' : 'New Category'}
                open={modalOpen}
                onOk={handleSubmit}
                onCancel={closeModal}
                okText={editing ? 'Save' : 'Create'}
                confirmLoading={createMutation.isPending || updateMutation.isPending}
                destroyOnHidden
            >
                <Form form={form} layout="vertical" initialValues={{ is_active: true }}>
                    <Form.Item label="Category Type">
                        <Segmented<CategoryKind>
                            block
                            value={kind}
                            onChange={onKindChange}
                            // A category that already has children cannot become a
                            // sub-category — that would nest three levels deep.
                            disabled={hasChildren}
                            options={[
                                { label: 'Top-Level Category', value: 'top' },
                                { label: 'Sub-category', value: 'sub' },
                            ]}
                        />
                    </Form.Item>

                    {hasChildren && (
                        <Alert
                            type="info"
                            showIcon
                            style={{ marginBottom: 16 }}
                            message="This category has sub-categories."
                            description="It must stay top-level — the hierarchy is only two levels deep, so it cannot itself be nested under another category."
                        />
                    )}

                    {kind === 'sub' ? (
                        <Form.Item
                            label="Parent Category"
                            name="parent_category_id"
                            rules={[{ required: true, message: 'Pick the parent category' }]}
                            extra="Sub-categories sit one level under a top-level category. They cannot be nested further."
                        >
                            <Select
                                placeholder="Select the parent category"
                                showSearch
                                optionFilterProp="label"
                                options={rootCategories
                                    // A category can't parent itself.
                                    .filter((c) => c.category_id !== editing?.category_id)
                                    .map((c) => ({ label: c.name, value: c.category_id }))}
                            />
                        </Form.Item>
                    ) : (
                        <Form.Item label="Category Image">
                            <CategoryImageUpload value={imageUrl} onChange={setImageUrl} />
                        </Form.Item>
                    )}

                    {/* One tab per language. English is the fallback every
                        other language degrades to, so it is the only required
                        one; Sinhala and Tamil can be added later. */}
                    <Tabs
                        defaultActiveKey="en"
                        tabBarExtraContent={
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                Sinhala/Tamil optional — blank falls back to English
                            </Typography.Text>
                        }
                        items={[
                            {
                                key: 'en',
                                label: 'English',
                                children: (
                                    <>
                                        <Form.Item
                                            label="Name"
                                            name="name"
                                            rules={[{ required: true, message: 'Name is required' }]}
                                        >
                                            <Input
                                                placeholder="e.g. Fresh Fruits"
                                                onChange={(e) => {
                                                    if (!slugTouched) {
                                                        form.setFieldValue(
                                                            'slug',
                                                            slugify(e.target.value)
                                                        );
                                                    }
                                                }}
                                            />
                                        </Form.Item>
                                        <Form.Item label="Description" name="description">
                                            <Input.TextArea rows={3} placeholder="Optional description" />
                                        </Form.Item>
                                    </>
                                ),
                            },
                            {
                                key: 'si',
                                label: 'සිංහල',
                                children: (
                                    <>
                                        <Form.Item
                                            label="Name (Sinhala)"
                                            name="name_si"
                                            rules={[{ max: 100, message: 'Max 100 characters' }]}
                                        >
                                            <Input placeholder="උදා. නැවුම් පලතුරු" />
                                        </Form.Item>
                                        <Form.Item label="Description (Sinhala)" name="description_si">
                                            <Input.TextArea rows={3} placeholder="විස්තරය (අත්‍යවශ්‍ය නොවේ)" />
                                        </Form.Item>
                                    </>
                                ),
                            },
                            {
                                key: 'ta',
                                label: 'தமிழ்',
                                children: (
                                    <>
                                        <Form.Item
                                            label="Name (Tamil)"
                                            name="name_ta"
                                            rules={[{ max: 100, message: 'Max 100 characters' }]}
                                        >
                                            <Input placeholder="எ.கா. புதிய பழங்கள்" />
                                        </Form.Item>
                                        <Form.Item label="Description (Tamil)" name="description_ta">
                                            <Input.TextArea rows={3} placeholder="விவரம் (விருப்பத்தேர்வு)" />
                                        </Form.Item>
                                    </>
                                ),
                            },
                        ]}
                    />

                    <Form.Item
                        label="Slug"
                        name="slug"
                        rules={[
                            { required: true, message: 'Slug is required' },
                            {
                                pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
                                message: 'Lowercase letters, numbers and hyphens only',
                            },
                        ]}
                        extra="Used in URLs. Auto-generated from the name; edit if needed."
                    >
                        <Input
                            placeholder="fresh-fruits"
                            onChange={() => setSlugTouched(true)}
                        />
                    </Form.Item>

                    <Form.Item label="Active" name="is_active" valuePropName="checked">
                        <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default CategoryList;
