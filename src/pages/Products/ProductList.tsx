/**
 * Product List (Admin Module 7.2)
 * Global-catalog product table with search, category filter and row actions.
 * Data layer is TanStack Query against /api/v1/admin/products.
 */
import React, { useState } from 'react';
import {
    Card,
    Table,
    Button,
    Input,
    Select,
    Space,
    Tag,
    Image,
    Popconfirm,
    App,
    Typography,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    SearchOutlined,
    PictureOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { productsApi } from '../../api/products.api';
import type { AdminProduct } from '../../api/products.api';
import { categoriesApi } from '../../api/categories.api';
import { usePermissions } from '../../hooks/usePermissions';

const { Title } = Typography;

const formatLKR = (value: number): string =>
    new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(value ?? 0);

const primaryImage = (p: AdminProduct): string | undefined =>
    (p.images.find((img) => img.is_primary) ?? p.images[0])?.image_url;

const ProductList: React.FC = () => {
    const navigate = useNavigate();
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    // Support staff (and any role without products write) get a read-only
    // catalog: no Add / Edit / Delete, only View Details (B5).
    const { canCreate, canUpdate, canDelete } = usePermissions();
    const canAddProduct = canCreate('products');
    const canEditProduct = canUpdate('products');
    const canDeleteProduct = canDelete('products');

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [search, setSearch] = useState('');
    const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
    const [isActive, setIsActive] = useState<boolean | undefined>(undefined);

    // Category options for the filter dropdown
    const { data: categories = [] } = useQuery({
        queryKey: ['admin', 'categories'],
        queryFn: categoriesApi.list,
    });

    const listKey = ['admin', 'products', { page, pageSize, search, categoryId, isActive }];

    const { data, isLoading, isError } = useQuery({
        queryKey: listKey,
        queryFn: () =>
            productsApi.list({
                page,
                limit: pageSize,
                search: search || undefined,
                category_id: categoryId,
                is_active: isActive,
            }),
        placeholderData: keepPreviousData,
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => productsApi.remove(id),
        onSuccess: () => {
            message.success('Product deleted.');
            queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to delete product.'),
    });

    const columns: ColumnsType<AdminProduct> = [
        {
            title: 'Image',
            key: 'image',
            width: 72,
            render: (_, record) => {
                const url = primaryImage(record);
                return url ? (
                    <Image
                        src={url}
                        width={48}
                        height={48}
                        style={{ objectFit: 'cover', borderRadius: 4 }}
                        preview={{ mask: null }}
                    />
                ) : (
                    <div
                        style={{
                            width: 48,
                            height: 48,
                            borderRadius: 4,
                            background: '#f0f0f0',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#bbb',
                        }}
                    >
                        <PictureOutlined />
                    </div>
                );
            },
        },
        {
            title: 'Name',
            dataIndex: 'name',
            key: 'name',
            render: (name: string, record) => (
                <a onClick={() => navigate(`/products/${record.product_id}/edit`)}>{name}</a>
            ),
        },
        {
            title: 'SKU',
            dataIndex: 'sku',
            key: 'sku',
            render: (sku: string | null) => sku || <span style={{ color: '#bbb' }}>—</span>,
        },
        {
            title: 'Category',
            key: 'category',
            render: (_, record) =>
                record.category ? (
                    <Tag color="geekblue">{record.category.name}</Tag>
                ) : (
                    <span style={{ color: '#bbb' }}>Uncategorized</span>
                ),
        },
        {
            title: 'Base Price',
            key: 'price',
            render: (_, record) => (
                <div>
                    <div style={{ fontWeight: 600 }}>{formatLKR(record.price)}</div>
                    {record.compare_at_price ? (
                        <div
                            style={{
                                fontSize: 12,
                                color: '#999',
                                textDecoration: 'line-through',
                            }}
                        >
                            {formatLKR(record.compare_at_price)}
                        </div>
                    ) : null}
                </div>
            ),
        },
        {
            title: 'Status',
            dataIndex: 'is_active',
            key: 'is_active',
            width: 110,
            render: (active: boolean) => (
                <Tag color={active ? 'green' : 'default'}>{active ? 'Active' : 'Inactive'}</Tag>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 180,
            render: (_, record) => (
                <Space>
                    <Button
                        type="link"
                        icon={<EyeOutlined />}
                        onClick={() => navigate(`/products/${record.product_id}/edit`)}
                    >
                        View
                    </Button>
                    {canEditProduct && (
                        <Button
                            type="link"
                            icon={<EditOutlined />}
                            onClick={() => navigate(`/products/${record.product_id}/edit`)}
                        >
                            Edit
                        </Button>
                    )}
                    {canDeleteProduct && (
                        <Popconfirm
                            title="Delete product"
                            description="This permanently removes the product."
                            okText="Delete"
                            okButtonProps={{ danger: true }}
                            onConfirm={() => deleteMutation.mutate(record.product_id)}
                        >
                            <Button type="link" danger icon={<DeleteOutlined />}>
                                Delete
                            </Button>
                        </Popconfirm>
                    )}
                </Space>
            ),
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
                    Products
                </Title>
                {canAddProduct && (
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/products/new')}>
                        Add Product
                    </Button>
                )}
            </div>

            <Card>
                <Space wrap style={{ marginBottom: 16 }}>
                    <Input.Search
                        placeholder="Search by name…"
                        allowClear
                        enterButton={<SearchOutlined />}
                        style={{ width: 300 }}
                        onSearch={(value) => {
                            setPage(1);
                            setSearch(value);
                        }}
                    />
                    <Select
                        placeholder="All categories"
                        style={{ width: 200 }}
                        allowClear
                        value={categoryId}
                        onChange={(value) => {
                            setPage(1);
                            setCategoryId(value);
                        }}
                        options={categories.map((c) => ({ label: c.name, value: c.category_id }))}
                    />
                    <Select
                        placeholder="All statuses"
                        style={{ width: 150 }}
                        allowClear
                        value={isActive}
                        onChange={(value) => {
                            setPage(1);
                            setIsActive(value);
                        }}
                        options={[
                            { label: 'Active', value: true },
                            { label: 'Inactive', value: false },
                        ]}
                    />
                </Space>

                <Table
                    rowKey="product_id"
                    columns={columns}
                    dataSource={data?.products ?? []}
                    loading={isLoading}
                    locale={{
                        emptyText: isError ? 'Failed to load products.' : 'No products found.',
                    }}
                    scroll={{ x: 'max-content' }}
                    pagination={{
                        current: page,
                        pageSize,
                        total: data?.total ?? 0,
                        showSizeChanger: true,
                        showTotal: (t) => `Total ${t} products`,
                        onChange: (nextPage, nextSize) => {
                            setPage(nextPage);
                            setPageSize(nextSize);
                        },
                    }}
                />
            </Card>
        </div>
    );
};

export default ProductList;
