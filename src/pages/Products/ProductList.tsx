/**
 * Product List (Admin Module 7.2)
 * Global-catalog product table with search, category filter, velocity analysis, and row actions.
 * Data layer is TanStack Query against /api/v1/admin/products.
 * Redesigned to executive modern SaaS standard (Shopify / Stripe aesthetics).
 */
import React, { useState, useMemo } from 'react';
import {
    Table,
    Button,
    Select,
    Space,
    Tag,
    Image,
    Popconfirm,
    App,
    Segmented,
    Tooltip,
    Row,
    Col,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    PictureOutlined,
    ThunderboltOutlined,
    ReloadOutlined,
    ShoppingOutlined,
    CheckCircleOutlined,
    AlertOutlined,
    FireOutlined,
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

const formatLKR = (value: number): string =>
    new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(value ?? 0);

const primaryImage = (p: AdminProduct): string | undefined =>
    (p.images?.find((img) => img.is_primary) ?? p.images?.[0])?.image_url;

/**
 * What to show in the price column.
 * Price moved from the global catalog to per-branch inventory, so a product
 * added after that change carries no `price` on its catalog row at all.
 */
const displayPrice = (p: AdminProduct): number => p.branch_price ?? p.price ?? 0;

/** Sales velocity badges configuration */
const MOVEMENT_META: Record<ProductMovement, { label: string; color: string; bg: string; hint: string }> = {
    fast: { label: '🚀 Fast-Moving', color: '#059669', bg: '#ecfdf5', hint: 'High customer demand over the last 30 days' },
    steady: { label: '● Steady', color: '#2563eb', bg: '#eff6ff', hint: 'Selling at a healthy, consistent pace' },
    slow: {
        label: '❄️ Slow-Moving',
        color: '#d97706',
        bg: '#fffbeb',
        hint: 'Barely moving. If also perishable, consider a Quick Sale deal.',
    },
    none: { label: '0 Orders', color: '#dc2626', bg: '#fef2f2', hint: 'No units sold from this branch in the last 30 days' },
};

const STOCK_META: Record<StockState, { color: string; bg: string; label: (q: number) => string }> = {
    in: { color: '#059669', bg: '#ecfdf5', label: (q) => `In Stock (${q})` },
    low: { color: '#d97706', bg: '#fffbeb', label: (q) => `Low Stock (${q})` },
    out: { color: '#dc2626', bg: '#fef2f2', label: () => 'Out of Stock (0)' },
};

type MovementTab = 'all' | ProductMovement | StockState | 'quick_sale' | 'perishable' | 'review_unset';

const MOVEMENT_TABS: { label: string; value: MovementTab }[] = [
    { label: 'All Products', value: 'all' },
    { label: '🚀 Fast-Moving', value: 'fast' },
    { label: '❄️ Slow-Moving', value: 'slow' },
    { label: 'In Stock', value: 'in' },
    { label: 'Low Stock', value: 'low' },
    { label: 'Out of Stock', value: 'out' },
    { label: '⚡ On Quick Sale', value: 'quick_sale' },
    { label: 'Perishable', value: 'perishable' },
    { label: 'No Price Review', value: 'review_unset' },
];

/** Translate movement tab into query params */
const tabToParams = (tab: MovementTab) => {
    if (tab === 'fast' || tab === 'slow' || tab === 'steady' || tab === 'none')
        return { movement: tab as ProductMovement };
    if (tab === 'in' || tab === 'low' || tab === 'out')
        return { stock_state: tab as StockState };
    if (tab === 'quick_sale') return { on_quick_sale: true };
    if (tab === 'perishable') return { perishable_only: true };
    if (tab === 'review_unset') return { price_review_level: 'unset' as const };
    return {};
};

const productListStyles = `
.product-page-container {
    padding-bottom: 32px;
}
.product-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 24px;
}
.product-header-titles h2 {
    margin: 0;
    font-weight: 800;
    font-size: 26px;
    color: #0f172a;
    letter-spacing: -0.02em;
}
.product-header-sub {
    font-size: 13.5px;
    color: #64748b;
    margin-top: 4px;
    font-weight: 500;
}
.product-kpi-card {
    background: #ffffff;
    border-radius: 18px;
    padding: 16px 20px;
    border: 1px solid #ECEAF0;
    box-shadow: 0 2px 12px rgba(15, 23, 42, 0.03);
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    gap: 16px;
}
.product-kpi-card:hover {
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.06);
    transform: translateY(-1px);
}
.product-kpi-icon {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}
.product-kpi-value {
    font-size: 22px;
    font-weight: 800;
    color: #0f172a;
    line-height: 1.2;
}
.product-kpi-label {
    font-size: 12px;
    font-weight: 600;
    color: #64748b;
    margin-top: 2px;
}
.product-table-card {
    background: #ffffff;
    border-radius: 20px;
    border: 1px solid #ECEAF0;
    box-shadow: 0 4px 24px rgba(15, 23, 42, 0.04);
    overflow: hidden;
}
.product-filter-bar {
    padding: 20px 24px;
    border-bottom: 1px solid #F1F5F9;
    background: #ffffff;
}
.product-table-custom .ant-table-thead > tr > th {
    background: #f8fafc !important;
    color: #475569 !important;
    font-size: 11.5px !important;
    font-weight: 700 !important;
    text-transform: uppercase !important;
    letter-spacing: 0.05em !important;
    border-bottom: 1px solid #e2e8f0 !important;
    padding: 14px 16px !important;
}
.product-table-custom .ant-table-tbody > tr > td {
    padding: 14px 16px !important;
    border-bottom: 1px solid #f1f5f9 !important;
    vertical-align: middle !important;
}
.product-table-custom .ant-table-tbody > tr:hover > td {
    background: #fcfdfe !important;
}
.product-name-link {
    font-weight: 700;
    font-size: 14px;
    color: #0f172a;
    transition: color 0.15s ease;
    display: block;
    line-height: 1.35;
}
.product-name-link:hover {
    color: #D81B60;
}
.product-sku-pill {
    display: inline-block;
    font-family: monospace;
    font-size: 11px;
    color: #64748b;
    background: #f1f5f9;
    padding: 2px 6px;
    border-radius: 6px;
    font-weight: 600;
    margin-top: 3px;
}
.product-thumb-container {
    width: 48px;
    height: 48px;
    border-radius: 10px;
    overflow: hidden;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 1px 4px rgba(0,0,0,0.04);
    flex-shrink: 0;
}
.product-stock-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 700;
}
.product-price-main {
    font-weight: 800;
    font-size: 14.5px;
    color: #0f172a;
}
.product-price-strike {
    font-size: 11.5px;
    color: #94a3b8;
    text-decoration: line-through;
    font-weight: 500;
    margin-top: 1px;
}
.product-action-btn {
    border-radius: 8px;
    font-weight: 600;
    font-size: 12.5px;
    padding: 4px 10px;
}
`;

const ProductList: React.FC = () => {
    const navigate = useNavigate();
    const { message } = App.useApp();
    const queryClient = useQueryClient();

    const { canCreate, canUpdate, canDelete } = usePermissions();
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
    const [subcategoryId, setSubcategoryId] = useState<string | undefined>(undefined);
    const [isActive, setIsActive] = useState<boolean | undefined>(undefined);
    const [movementTab, setMovementTab] = useState<MovementTab>('all');

    // Category options for filter
    const { data: categories = [] } = useQuery({
        queryKey: ['admin', 'categories'],
        queryFn: categoriesApi.list,
    });

    const rootCategories = useMemo(
        () => categories.filter((c) => !c.parent_category_id),
        [categories]
    );

    const subcategories = useMemo(
        () => (categoryId ? categories.filter((c) => c.parent_category_id === categoryId) : []),
        [categories, categoryId]
    );

    const listKey = [
        'admin',
        'products',
        { page, pageSize, search, categoryId, subcategoryId, isActive, movementTab },
    ];

    const { data, isLoading, isError } = useQuery({
        queryKey: listKey,
        queryFn: () =>
            productsApi.list({
                page,
                limit: pageSize,
                search: search || undefined,
                category_id: categoryId,
                subcategory_id: subcategoryId,
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
        onError: (err: unknown) => {
            const apiErr = err as { response?: { data?: { detail?: string } } };
            message.error(apiErr.response?.data?.detail || 'Failed to delete product.');
        },
    });

    // KPI Metrics derived from current results
    const totalCount = data?.total ?? 0;
    const activeCount = useMemo(
        () => (data?.products ?? []).filter((p) => p.is_active).length,
        [data?.products]
    );
    const stockAlertCount = useMemo(
        () => (data?.products ?? []).filter((p) => p.stock_quantity <= 0 || p.stock_state === 'low' || p.stock_state === 'out').length,
        [data?.products]
    );
    const dealsCount = useMemo(
        () => (data?.products ?? []).filter((p) => p.is_on_quick_sale || p.movement === 'fast').length,
        [data?.products]
    );

    const hasActiveFilters = Boolean(
        search || categoryId || subcategoryId || isActive !== undefined || movementTab !== 'all'
    );

    const handleResetFilters = () => {
        setPage(1);
        setSearch('');
        setCategoryId(undefined);
        setSubcategoryId(undefined);
        setIsActive(undefined);
        setMovementTab('all');
    };

    const columns: ColumnsType<AdminProduct> = [
        {
            title: 'Product',
            key: 'product_info',
            width: 280,
            render: (_, record) => {
                const url = primaryImage(record);
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div className="product-thumb-container">
                            {url ? (
                                <Image
                                    src={url}
                                    width={48}
                                    height={48}
                                    style={{ objectFit: 'cover', borderRadius: 8 }}
                                    preview={{ mask: null }}
                                />
                            ) : (
                                <PictureOutlined style={{ fontSize: 20, color: '#94a3b8' }} />
                            )}
                        </div>
                        <div style={{ minWidth: 0, flex: 1 }}>
                            <a
                                className="product-name-link"
                                onClick={() => navigate(`/products/${record.product_id}/edit`)}
                                title={record.name}
                            >
                                {record.name}
                            </a>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                {record.sku ? (
                                    <span className="product-sku-pill">{record.sku}</span>
                                ) : (
                                    <span style={{ fontSize: 11, color: '#cbd5e1' }}>No SKU</span>
                                )}
                            </div>
                        </div>
                    </div>
                );
            },
        },
        {
            title: 'Category',
            key: 'category',
            width: 170,
            render: (_, record) =>
                record.category ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <Tag
                            color="blue"
                            style={{
                                borderRadius: 8,
                                fontWeight: 600,
                                margin: 0,
                                background: '#eff6ff',
                                color: '#1d4ed8',
                                border: '1px solid #bfdbfe',
                                alignSelf: 'flex-start',
                            }}
                        >
                            {record.category.name}
                        </Tag>
                        {record.subcategory && (
                            <Tag
                                color="purple"
                                style={{
                                    borderRadius: 8,
                                    fontWeight: 500,
                                    margin: 0,
                                    background: '#faf5ff',
                                    color: '#7e22ce',
                                    border: '1px solid #e9d5ff',
                                    fontSize: 11,
                                    alignSelf: 'flex-start',
                                }}
                            >
                                {record.subcategory.name}
                            </Tag>
                        )}
                    </div>
                ) : (
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>Uncategorized</span>
                ),
        },
        {
            title: 'Weight / Size',
            key: 'weight',
            width: 130,
            render: (_, record: AdminProduct) => {
                if (record.weight !== null && record.weight !== undefined) {
                    const unit = record.weight_unit || 'kg';
                    return (
                        <span
                            style={{
                                background: '#f0fdfa',
                                color: '#0f766e',
                                border: '1px solid #ccfbf1',
                                padding: '3px 8px',
                                borderRadius: 8,
                                fontWeight: 600,
                                fontSize: 12,
                            }}
                        >
                            {record.weight} {unit}
                        </span>
                    );
                }
                return <span style={{ color: '#cbd5e1' }}>—</span>;
            },
        },
        ...(isBranchScoped
            ? ([
                  {
                      title: 'Branch Stock',
                      key: 'stock',
                      width: 145,
                      render: (_: unknown, record: AdminProduct) => {
                          const state = record.stock_state ?? 'in';
                          const meta = STOCK_META[state];
                          return (
                              <div
                                  className="product-stock-badge"
                                  style={{ background: meta.bg, color: meta.color }}
                              >
                                  <span
                                      style={{
                                          width: 6,
                                          height: 6,
                                          borderRadius: '50%',
                                          background: meta.color,
                                      }}
                                  />
                                  <span>{meta.label(record.stock_quantity)}</span>
                              </div>
                          );
                      },
                      sorter: (a: AdminProduct, b: AdminProduct) =>
                          a.stock_quantity - b.stock_quantity,
                  },
                  {
                      title: (
                          <Tooltip title="Units delivered from your branch in the last 30 days. Cancelled orders do not count.">
                              <span>Sales (30 Days)</span>
                          </Tooltip>
                      ),
                      key: 'velocity',
                      width: 165,
                      render: (_: unknown, record: AdminProduct) => {
                          const meta = MOVEMENT_META[record.movement ?? 'none'];
                          return (
                              <div>
                                  <div style={{ fontWeight: 800, fontSize: 13, color: '#0f172a' }}>
                                      {record.units_sold_30d ?? 0} sold
                                  </div>
                                  <Tooltip title={meta.hint}>
                                      <span
                                          style={{
                                              display: 'inline-block',
                                              fontSize: 11,
                                              fontWeight: 600,
                                              color: meta.color,
                                              background: meta.bg,
                                              padding: '1px 8px',
                                              borderRadius: 12,
                                              marginTop: 2,
                                          }}
                                      >
                                          {meta.label}
                                      </span>
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
            width: 140,
            render: (_, record) => (
                <div>
                    <div className="product-price-main">{formatLKR(displayPrice(record))}</div>
                    {isBranchScoped && record.branch_price == null ? (
                        <span style={{ fontSize: 10.5, color: '#64748b', background: '#f8fafc', padding: '1px 5px', borderRadius: 4 }}>
                            Catalog price
                        </span>
                    ) : null}
                    {record.compare_at_price ? (
                        <div className="product-price-strike">
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
            width: 120,
            render: (active: boolean, record) => (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            padding: '3px 8px',
                            borderRadius: 16,
                            fontSize: 11.5,
                            fontWeight: 700,
                            background: active ? '#ecfdf5' : '#f1f5f9',
                            color: active ? '#059669' : '#64748b',
                            alignSelf: 'flex-start',
                        }}
                    >
                        <span
                            style={{
                                width: 5,
                                height: 5,
                                borderRadius: '50%',
                                background: active ? '#10b981' : '#94a3b8',
                            }}
                        />
                        {active ? 'Active' : 'Inactive'}
                    </span>
                    {record.is_perishable && (
                        <Tag
                            color="orange"
                            style={{
                                borderRadius: 8,
                                fontWeight: 600,
                                fontSize: 10.5,
                                margin: 0,
                                alignSelf: 'flex-start',
                            }}
                        >
                            Perishable
                        </Tag>
                    )}
                </div>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: isBranchScoped ? 260 : 160,
            render: (_, record) => (
                <Space size={6}>
                    {isBranchScoped &&
                        (record.is_on_quick_sale ? (
                            <Tooltip title="Already discounted in your Quick Sale feed.">
                                <Button
                                    type="text"
                                    size="small"
                                    icon={<ThunderboltOutlined />}
                                    style={{
                                        color: '#059669',
                                        background: '#ecfdf5',
                                        fontWeight: 700,
                                        borderRadius: 8,
                                        fontSize: 12,
                                    }}
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
                                    style={{ borderRadius: 8, fontSize: 12 }}
                                >
                                    Add Deal
                                </Button>
                            </Tooltip>
                        ) : (
                            <Button
                                type="text"
                                size="small"
                                icon={<ThunderboltOutlined />}
                                style={{
                                    color: '#7c3aed',
                                    background: '#f5f3ff',
                                    fontWeight: 700,
                                    borderRadius: 8,
                                    fontSize: 12,
                                }}
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
                    {isBranchScoped ? (
                        <Button
                            type="text"
                            size="small"
                            icon={<EyeOutlined />}
                            style={{ color: '#2563eb', background: '#eff6ff', borderRadius: 8, fontWeight: 600 }}
                            onClick={() => navigate(`/products/${record.product_id}/edit`)}
                        >
                            View
                        </Button>
                    ) : canEditProduct ? (
                        <Button
                            type="text"
                            size="small"
                            icon={<EditOutlined />}
                            style={{ color: '#2563eb', background: '#eff6ff', borderRadius: 8, fontWeight: 600 }}
                            onClick={() => navigate(`/products/${record.product_id}/edit`)}
                        >
                            Edit
                        </Button>
                    ) : (
                        <Button
                            type="text"
                            size="small"
                            icon={<EyeOutlined />}
                            style={{ color: '#475569', background: '#f1f5f9', borderRadius: 8, fontWeight: 600 }}
                            onClick={() => navigate(`/products/${record.product_id}/edit`)}
                        >
                            View
                        </Button>
                    )}
                    {canDeleteProduct && (
                        <Popconfirm
                            title="Delete product"
                            description="This permanently removes the product from the catalog."
                            okText="Yes, Delete"
                            okButtonProps={{ danger: true }}
                            onConfirm={() => deleteMutation.mutate(record.product_id)}
                        >
                            <Button
                                type="text"
                                size="small"
                                danger
                                icon={<DeleteOutlined />}
                                style={{ borderRadius: 8, fontWeight: 600 }}
                            >
                                Delete
                            </Button>
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <div className="product-page-container">
            <style>{productListStyles}</style>

            {/* Executive Header Row */}
            <div className="product-header-row">
                <div className="product-header-titles">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <h2>Product Catalog</h2>
                        <span
                            style={{
                                background: '#f1f5f9',
                                color: '#475569',
                                fontWeight: 700,
                                fontSize: 12,
                                padding: '3px 10px',
                                borderRadius: 12,
                            }}
                        >
                            {totalCount} Items
                        </span>
                    </div>
                    <div className="product-header-sub">
                        Manage global catalog inventory, branch selling prices, categories, and sales velocity.
                    </div>
                </div>
                {canAddProduct && (
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => navigate('/products/new')}
                        style={{
                            background: 'linear-gradient(135deg, #E11D48 0%, #D81B60 100%)',
                            border: 'none',
                            borderRadius: 12,
                            height: 42,
                            padding: '0 20px',
                            fontWeight: 700,
                            fontSize: 13.5,
                            boxShadow: '0 4px 14px rgba(216, 27, 96, 0.25)',
                        }}
                    >
                        Add Product
                    </Button>
                )}
            </div>

            {/* Quick Overview Metric Cards (Shopify Style) */}
            <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
                <Col xs={12} sm={6}>
                    <div className="product-kpi-card">
                        <div className="product-kpi-icon" style={{ background: '#EFF6FF', color: '#2563EB' }}>
                            <ShoppingOutlined style={{ fontSize: 20 }} />
                        </div>
                        <div>
                            <div className="product-kpi-value">{totalCount.toLocaleString()}</div>
                            <div className="product-kpi-label">Total Products</div>
                        </div>
                    </div>
                </Col>
                <Col xs={12} sm={6}>
                    <div className="product-kpi-card">
                        <div className="product-kpi-icon" style={{ background: '#ECFDF5', color: '#059669' }}>
                            <CheckCircleOutlined style={{ fontSize: 20 }} />
                        </div>
                        <div>
                            <div className="product-kpi-value">{activeCount}</div>
                            <div className="product-kpi-label">Active / Live</div>
                        </div>
                    </div>
                </Col>
                <Col xs={12} sm={6}>
                    <div className="product-kpi-card">
                        <div className="product-kpi-icon" style={{ background: '#FFFBEB', color: '#D97706' }}>
                            <AlertOutlined style={{ fontSize: 20 }} />
                        </div>
                        <div>
                            <div className="product-kpi-value">{stockAlertCount}</div>
                            <div className="product-kpi-label">Low / Out of Stock</div>
                        </div>
                    </div>
                </Col>
                <Col xs={12} sm={6}>
                    <div className="product-kpi-card">
                        <div className="product-kpi-icon" style={{ background: '#FAF5FF', color: '#7C3AED' }}>
                            <FireOutlined style={{ fontSize: 20 }} />
                        </div>
                        <div>
                            <div className="product-kpi-value">{dealsCount}</div>
                            <div className="product-kpi-label">Fast / Deals</div>
                        </div>
                    </div>
                </Col>
            </Row>

            {/* Main Table Card with Filters */}
            <div className="product-table-card">
                {/* Branch-derived Velocity Tabs */}
                {isBranchScoped && (
                    <div style={{ padding: '16px 24px 0 24px', background: '#ffffff' }}>
                        <Segmented
                            value={movementTab}
                            onChange={(value) => {
                                setPage(1);
                                setMovementTab(value as MovementTab);
                            }}
                            options={MOVEMENT_TABS}
                            style={{
                                background: '#f1f5f9',
                                padding: 3,
                                borderRadius: 12,
                                fontWeight: 600,
                            }}
                        />
                    </div>
                )}

                {/* Filter and Search Bar */}
                <div className="product-filter-bar">
                    <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                        <Space wrap size={12}>
                            <DebouncedSearchInput
                                placeholder="Search by name, SKU or barcode…"
                                value={search}
                                onChange={(v) => {
                                    setPage(1);
                                    setSearch(v);
                                }}
                                urlParam="q"
                                style={{ width: 280, borderRadius: 10 }}
                            />
                            <Select<string>
                                placeholder="All categories"
                                style={{ width: 190 }}
                                allowClear
                                value={categoryId}
                                onChange={(value) => {
                                    setPage(1);
                                    setCategoryId(value);
                                    setSubcategoryId(undefined);
                                }}
                                options={rootCategories.map((c) => ({ label: c.name, value: c.category_id }))}
                            />
                            <Select<string>
                                placeholder={categoryId ? 'All subcategories' : 'Select category first'}
                                style={{ width: 190 }}
                                allowClear
                                disabled={!categoryId}
                                value={subcategoryId}
                                onChange={(value) => {
                                    setPage(1);
                                    setSubcategoryId(value);
                                }}
                                options={subcategories.map((c) => ({ label: c.name, value: c.category_id }))}
                            />
                            <Select<boolean, { label: string; value: boolean }>
                                placeholder="All statuses"
                                style={{ width: 140 }}
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

                        {hasActiveFilters && (
                            <Button
                                type="text"
                                icon={<ReloadOutlined />}
                                onClick={handleResetFilters}
                                style={{ color: '#64748b', fontWeight: 600 }}
                            >
                                Reset Filters
                            </Button>
                        )}
                    </Space>
                </div>

                {/* Data Table */}
                <Table
                    className="product-table-custom"
                    rowKey="product_id"
                    columns={columns}
                    dataSource={data?.products ?? []}
                    loading={isLoading}
                    locale={{
                        emptyText: isError ? 'Failed to load products.' : 'No products found.',
                    }}
                    scroll={{ x: 'max-content' }}
                    sticky
                    pagination={{
                        current: page,
                        pageSize,
                        total: totalCount,
                        showSizeChanger: true,
                        showTotal: (total, range) => (
                            <span style={{ fontSize: 13, color: '#64748b', fontWeight: 500 }}>
                                Showing {range[0]}–{range[1]} of <strong>{total}</strong> products
                            </span>
                        ),
                        onChange: (nextPage, nextSize) => {
                            setPage(nextPage);
                            setPageSize(nextSize);
                        },
                    }}
                />
            </div>
        </div>
    );
};

export default ProductList;
