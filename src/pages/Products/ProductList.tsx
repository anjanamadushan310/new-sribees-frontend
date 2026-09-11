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
    Select,
    Space,
    Tag,
    Image,
    Popconfirm,
    App,
    Typography,
    Segmented,
    Tooltip,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    PictureOutlined,
    ThunderboltOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { productsApi } from '../../api/products.api';
import type { AdminProduct, ProductMovement, StockState } from '../../api/products.api';
import { categoriesApi } from '../../api/categories.api';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuthStore } from '../../store/authStore';
import { AdminRole } from '../../types/admin.types';
import { DebouncedSearchInput } from '../../components/common/DebouncedSearchInput';

const { Title } = Typography;

const formatLKR = (value: number): string =>
    new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(value ?? 0);

const primaryImage = (p: AdminProduct): string | undefined =>
    (p.images.find((img) => img.is_primary) ?? p.images[0])?.image_url;

/**
 * What to show in the price column.
 *
 * Price moved from the global catalog to per-branch inventory, so a product
 * added after that change carries no `price` on its catalog row at all. Read
 * the branch price first and only then fall back, or every such product reads
 * LKR 0.00 here while the branch is in fact selling it.
 *
 * The server already resolves `price` for a branch-scoped viewer; this
 * fallback is the client-side belt to that braces, and also covers an
 * unscoped viewer looking at a catalog row with no global price.
 */
const displayPrice = (p: AdminProduct): number => p.branch_price ?? p.price ?? 0;

/**
 * Sales velocity bands. The thresholds themselves live server-side
 * (sales_velocity_service) — only the labels are here, so the badge and the
 * filter can never disagree about what "slow" means.
 */
const MOVEMENT_META: Record<ProductMovement, { label: string; color: string; hint: string }> = {
    fast: { label: '🚀 Fast-Moving', color: 'green', hint: 'High demand over the last 30 days' },
    steady: { label: '● Steady', color: 'blue', hint: 'Selling at a healthy, unremarkable rate' },
    slow: {
        label: '❄️ Slow-Moving',
        color: 'default',
        hint: 'Barely moving. If it is also perishable, clear it before it spoils.',
    },
    none: { label: '0 Orders', color: 'red', hint: 'Nothing sold from this branch in 30 days' },
};

const STOCK_META: Record<StockState, { color: string; label: (q: number) => string }> = {
    in: { color: '#16a34a', label: (q) => `In Stock (${q})` },
    low: { color: '#d97706', label: (q) => `Low Stock (${q})` },
    out: { color: '#dc2626', label: () => 'Out of Stock (0)' },
};

type MovementTab = 'all' | ProductMovement | StockState | 'quick_sale' | 'perishable';

const MOVEMENT_TABS: { label: string; value: MovementTab }[] = [
    { label: 'All Products', value: 'all' },
    { label: '🚀 Fast-Moving', value: 'fast' },
    { label: '❄️ Slow-Moving', value: 'slow' },
    { label: 'In Stock', value: 'in' },
    { label: 'Low Stock', value: 'low' },
    { label: 'Out of Stock', value: 'out' },
    { label: '⚡ On Quick Sale', value: 'quick_sale' },
    { label: 'Perishable', value: 'perishable' },
];

/** Translate one tab into the query params the server understands. */
const tabToParams = (tab: MovementTab) => {
    if (tab === 'fast' || tab === 'slow' || tab === 'steady' || tab === 'none')
        return { movement: tab as ProductMovement };
    if (tab === 'in' || tab === 'low' || tab === 'out')
        return { stock_state: tab as StockState };
    if (tab === 'quick_sale') return { on_quick_sale: true };
    if (tab === 'perishable') return { perishable_only: true };
    return {};
};

const ProductList: React.FC = () => {
    const navigate = useNavigate();
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    // Support staff (and any role without products write) get a read-only
    // catalog: no Add / Edit / Delete, only View Details (B5).
    const { canCreate, canUpdate, canDelete } = usePermissions();
    // A branch-level viewer is looking at what THEIR branch sells, so the
    // column is their selling price, not the network's base price. Super
    // Admin and Customer Support have no single branch and do see the base.
    const role = useAuthStore((state) => state.user?.role);
    const isBranchScoped =
        role !== undefined &&
        role !== AdminRole.SUPER_ADMIN &&
        role !== AdminRole.CUSTOMER_SUPPORT;

    const canAddProduct = canCreate('products');
    const canEditProduct = canUpdate('products');
    const canDeleteProduct = canDelete('products');

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [search, setSearch] = useState('');
    const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
    const [isActive, setIsActive] = useState<boolean | undefined>(undefined);
    const [movementTab, setMovementTab] = useState<MovementTab>('all');

    // Category options for the filter dropdown
    const { data: categories = [] } = useQuery({
        queryKey: ['admin', 'categories'],
        queryFn: categoriesApi.list,
    });

    const listKey = [
        'admin',
        'products',
        { page, pageSize, search, categoryId, isActive, movementTab },
    ];

    const { data, isLoading, isError } = useQuery({
        queryKey: listKey,
        queryFn: () =>
            productsApi.list({
                page,
                limit: pageSize,
                search: search || undefined,
                category_id: categoryId,
                is_active: isActive,
                ...tabToParams(movementTab),
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
        ...(isBranchScoped
            ? ([
                  {
                      title: 'Branch Stock',
                      key: 'stock',
                      width: 140,
                      render: (_: unknown, record: AdminProduct) => {
                          const state = record.stock_state ?? 'in';
                          const meta = STOCK_META[state];
                          return (
                              <span
                                  style={{
                                      color: meta.color,
                                      fontWeight: 600,
                                      fontSize: 12.5,
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 6,
                                  }}
                              >
                                  <span
                                      style={{
                                          width: 6,
                                          height: 6,
                                          borderRadius: '50%',
                                          background: meta.color,
                                      }}
                                  />
                                  {meta.label(record.stock_quantity)}
                              </span>
                          );
                      },
                      sorter: (a: AdminProduct, b: AdminProduct) =>
                          a.stock_quantity - b.stock_quantity,
                  },
                  {
                      title: (
                          <Tooltip title="Units delivered from your branch in the last 30 days. Cancelled orders do not count — they moved nothing off a shelf.">
                              <span>Sales (30 Days)</span>
                          </Tooltip>
                      ),
                      key: 'velocity',
                      width: 160,
                      render: (_: unknown, record: AdminProduct) => {
                          const meta = MOVEMENT_META[record.movement ?? 'none'];
                          return (
                              <div>
                                  <div style={{ fontWeight: 700 }}>
                                      {record.units_sold_30d ?? 0} sold
                                  </div>
                                  <Tooltip title={meta.hint}>
                                      <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>
                                          {meta.label}
                                      </Tag>
                                  </Tooltip>
                              </div>
                          );
                      },
                      sorter: (a: AdminProduct, b: AdminProduct) =>
                          (a.units_sold_30d ?? 0) - (b.units_sold_30d ?? 0),
                  },
              ] as ColumnsType<AdminProduct>)
            : []),
        {
            title: isBranchScoped ? 'Selling Price' : 'Base Price',
            key: 'price',
            render: (_, record) => (
                <div>
                    <div style={{ fontWeight: 600 }}>{formatLKR(displayPrice(record))}</div>
                    {isBranchScoped && record.branch_price == null ? (
                        <div style={{ fontSize: 12, color: '#999' }}>Catalog price</div>
                    ) : null}
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
            // Read-only badge, never a toggle. A Marketing Manager holds
            // products:read and nothing more — rendering a switch they cannot
            // action would be a button that fails, which is worse than no button.
            title: 'Status',
            dataIndex: 'is_active',
            key: 'is_active',
            width: 110,
            render: (active: boolean, record) => (
                <Space direction="vertical" size={2}>
                    <Tag color={active ? 'green' : 'default'}>
                        {active ? 'Active' : 'Inactive'}
                    </Tag>
                    {record.is_perishable && <Tag color="orange">Perishable</Tag>}
                </Space>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: isBranchScoped ? 280 : 180,
            render: (_, record) => (
                <Space>
                    {/* The whole point of the velocity column: having spotted
                        slow-moving or perishable stock, act on it here rather
                        than memorising a SKU and hunting for it on another
                        page. */}
                    {isBranchScoped &&
                        (record.is_on_quick_sale ? (
                            <Tooltip title="Already discounted in your Quick Sale feed.">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<ThunderboltOutlined />}
                                    style={{ color: '#16a34a' }}
                                    onClick={() => navigate('/quick-sale')}
                                >
                                    In Deal
                                </Button>
                            </Tooltip>
                        ) : record.stock_quantity <= 0 ? (
                            <Tooltip title="Nothing on the shelf to clear.">
                                <Button
                                    type="text"
                                    size="small"
                                    disabled
                                    icon={<ThunderboltOutlined />}
                                >
                                    Add Deal
                                </Button>
                            </Tooltip>
                        ) : (
                            <Button
                                type="text"
                                size="small"
                                icon={<ThunderboltOutlined />}
                                style={{ color: '#7c3aed' }}
                                onClick={() =>
                                    navigate(
                                        `/quick-sale?action=new_deal&sku=${encodeURIComponent(
                                            record.sku ?? record.product_id,
                                        )}`,
                                    )
                                }
                            >
                                Add Deal
                            </Button>
                        ))}
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
                {/* Branch-derived bands, so only a branch-scoped viewer gets
                    them — a Super Admin is looking at the global catalog and
                    has no single shelf to report on. */}
                {isBranchScoped && (
                    <Segmented
                        value={movementTab}
                        onChange={(value) => {
                            setPage(1);
                            setMovementTab(value as MovementTab);
                        }}
                        options={MOVEMENT_TABS}
                        style={{ marginBottom: 16 }}
                    />
                )}
                <Space wrap style={{ marginBottom: 16 }}>
                    <DebouncedSearchInput
                        placeholder="Search name, SKU…"
                        value={search}
                        onChange={(v) => {
                            setPage(1);
                            setSearch(v);
                        }}
                        urlParam="q"
                        style={{ width: 300 }}
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
