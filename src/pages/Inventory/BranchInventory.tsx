/**
 * Branch Inventory (Module 7.5)
 *
 * Branch-scoped stock table. The server (inject_branch_filter) already limits
 * rows to the caller's branch for Branch/Inventory Managers and returns all
 * branches for Super Admins; the response's `scope` tells us whether to show
 * the Branch column.
 */
import React, { useState, useMemo } from 'react';
import {
    Card,
    Table,
    Tag,
    Space,
    Button,
    Drawer,
    Divider,
    Form,
    InputNumber,
    Modal,
    Switch,
    Select,
    Tooltip,
    App,
    Typography,
    Descriptions,
} from 'antd';
import {
    EditOutlined,
    InboxOutlined,
    PlusOutlined,
    InfoCircleOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { inventoryApi } from '../../api/inventory.api';
import type {
    InventoryItem,
    InventoryUpdatePayload,
    StockableProduct,
    InventoryStockState,
} from '../../api/inventory.api';
import { branchesApi } from '../../api/branches.api';
import { categoriesApi } from '../../api/categories.api';
import { PRICE_REVIEW_LEVELS } from '../../api/products.api';
import type { PriceReviewLevel } from '../../api/products.api';
import { referralCommissionApi, apiDetailMessage } from '../../api/referralCommission.api';
import { usePermissions } from '../../hooks/usePermissions';
import { BranchWeightRows } from '../../components/products/BranchWeightPrices';
import { saveBranchWeightPrices, useBranchWeightRows } from '../../components/products/branchWeightRows';
import { DebouncedSearchInput } from '../../components/common/DebouncedSearchInput';

const { Title, Text } = Typography;

const money = (v: number) =>
    `Rs ${v.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const statusTag = (item: InventoryItem) => {
    if (!item.is_active) return <Tag>Hidden</Tag>;
    if (item.stock_quantity <= 0) return <Tag color="red">Out of Stock</Tag>;
    if (item.is_low_stock) return <Tag color="red">Low Stock</Tag>;
    return <Tag color="green">In Stock</Tag>;
};

/**
 * Show what a customer in this branch actually pays, and make the source of
 * that number obvious: a local override is called out, otherwise the row is
 * quietly inheriting the global catalog price.
 */
const priceCell = (item: InventoryItem) => {
    const overridden = item.branch_price !== null;
    return (
        <Space direction="vertical" size={0} style={{ lineHeight: 1.3 }}>
            <Text strong>{money(item.effective_price)}</Text>
            {overridden ? (
                <Space size={4}>
                    <Tag color="gold" style={{ marginInlineEnd: 0 }}>
                        Local
                    </Tag>
                    <Text type="secondary" delete style={{ fontSize: 12 }}>
                        {money(item.global_price)}
                    </Text>
                </Space>
            ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    Global price
                </Text>
            )}
        </Space>
    );
};

/** What an order placed now earns, and whether the branch or the product set it. */
const commissionCell = (item: InventoryItem) => {
    const rate = item.effective_referral_commission;
    if (rate <= 0) return <Text type="secondary">Off</Text>;
    return (
        <Space size={4}>
            <Text strong>{rate}%</Text>
            {item.referral_commission_percentage !== null ? (
                <Tag color="gold" style={{ marginInlineEnd: 0 }}>
                    Branch
                </Tag>
            ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    Default
                </Text>
            )}
        </Space>
    );
};

type EditValues = InventoryUpdatePayload & { referral_commission_percentage?: number | null };

const BranchInventory: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const { isSuperAdmin, isBranchManager } = usePermissions();
    const [form] = Form.useForm<EditValues>();
    // Commission is money: Super Admins and Branch Managers only, never
    // inventory or staff accounts (the server enforces the same).
    const canEditCommission = isSuperAdmin || isBranchManager;

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [search, setSearch] = useState('');
    const [categoryId, setCategoryId] = useState<string | undefined>(undefined);
    const [subcategoryId, setSubcategoryId] = useState<string | undefined>(undefined);
    const [priceReviewLevel, setPriceReviewLevel] = useState<PriceReviewLevel | undefined>(undefined);
    const [stockState, setStockState] = useState<InventoryStockState>('all');
    const [branchId, setBranchId] = useState<string | undefined>(undefined);
    const [editing, setEditing] = useState<InventoryItem | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [addSearch, setAddSearch] = useState('');
    const [addForm] = Form.useForm<{
        product_id: string;
        branch_price: number;
        stock_quantity: number;
        low_stock_threshold: number;
        cashback_percentage?: number | null;
        is_active: boolean;
    }>();

    // The global price of the product picked in "Add Product to Branch" (the
    // picker's list changes with the search, so it is kept on pick).
    const [addGlobalPrice, setAddGlobalPrice] = useState(0);

    // Branch options for the Super Admin branch filter (branches API is now live).
    const { data: branches = [] } = useQuery({
        queryKey: ['admin', 'branches'],
        queryFn: branchesApi.list,
        enabled: isSuperAdmin,
    });

    // Categories and subcategories for filter toolbar
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

    const { data: programme } = useQuery({
        queryKey: ['admin', 'referral-commission', 'settings'],
        queryFn: referralCommissionApi.settings,
        enabled: canEditCommission,
    });
    // Super Admins are not capped; the cap catches a Branch Manager's typo.
    const commissionMax = isSuperAdmin ? 100 : programme?.branch_max_percent ?? 0;

    const queryKey = [
        'admin',
        'inventory',
        { page, pageSize, search, categoryId, subcategoryId, priceReviewLevel, stockState, branchId },
    ];

    const { data, isLoading, isError } = useQuery({
        queryKey,
        queryFn: () =>
            inventoryApi.list({
                page,
                limit: pageSize,
                search: search || undefined,
                category_id: categoryId,
                subcategory_id: subcategoryId,
                price_review_level: priceReviewLevel,
                stock_state: stockState !== 'all' ? stockState : undefined,
                low_stock_only: stockState === 'low' ? true : undefined,
                branch_id: branchId, // ignored by the server for non-super admins
            }),
        placeholderData: keepPreviousData,
    });

    const hasActiveFilters = Boolean(
        search || categoryId || subcategoryId || priceReviewLevel !== undefined || stockState !== 'all' || branchId !== undefined
    );

    const handleResetFilters = () => {
        setPage(1);
        setSearch('');
        setCategoryId(undefined);
        setSubcategoryId(undefined);
        setPriceReviewLevel(undefined);
        setStockState('all');
        setBranchId(undefined);
    };

    // Prefer the server's scope; fall back to the local role before data loads.
    const showBranchColumn = data?.scope.is_super_admin ?? isSuperAdmin;

    const updateMutation = useMutation({
        mutationFn: async ({
            id,
            payload,
            commission,
        }: {
            id: string;
            payload: InventoryUpdatePayload;
            // undefined = unchanged; null = clear the branch override.
            commission?: number | null;
        }) => {
            await inventoryApi.update(id, payload);
            if (commission !== undefined) await referralCommissionApi.setBranchRate(id, commission);
            if (editing) {
                await saveBranchWeightPrices(editing.product_id, editing.branch_id, editWeights.rows);
            }
        },
        onSuccess: () => {
            message.success('Inventory updated.');
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] });
        },
        onError: (err: unknown) => {
            // A refused save reads the same whichever endpoint refused it.
            message.error(apiDetailMessage(err) ?? 'Failed to update inventory.');
            // The stock part may have saved before the commission was refused.
            queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] });
        },
    });

    // A Super Admin sees every branch at once, so "add a product" is ambiguous
    // until they pick one. Scoped admins always have exactly one target branch.
    const targetBranchId = showBranchColumn ? branchId : data?.scope.branch_id ?? undefined;
    const canAdd = !!targetBranchId;

    const { data: stockable, isLoading: loadingStockable } = useQuery({
        queryKey: ['admin', 'inventory', 'stockable', { targetBranchId, addSearch }],
        queryFn: () =>
            inventoryApi.stockable({
                branch_id: targetBranchId,
                search: addSearch || undefined,
                limit: 50,
            }),
        enabled: addOpen && canAdd,
    });

    // Weight prices follow the branch price as it is typed, in both the Add
    // modal and the quick-edit drawer.
    const addProductId = Form.useWatch('product_id', addForm);
    const addBranchPrice = Form.useWatch('branch_price', addForm);
    const addWeights = useBranchWeightRows(
        addProductId,
        targetBranchId,
        Number(addBranchPrice) || addGlobalPrice,
        addGlobalPrice,
    );
    const editBranchPrice = Form.useWatch('branch_price', form);
    const editGlobalPrice = Number(editing?.global_price) || 0;
    const editWeights = useBranchWeightRows(
        editing?.product_id,
        editing?.branch_id,
        Number(editBranchPrice) || editGlobalPrice,
        editGlobalPrice,
        Number(editing?.branch_price) || editGlobalPrice,
    );

    const stockMutation = useMutation({
        mutationFn: async (payload: Parameters<typeof inventoryApi.stockProduct>[0]) => {
            await inventoryApi.stockProduct(payload);
            await saveBranchWeightPrices(payload.product_id, payload.branch_id, addWeights.rows);
        },
        onSuccess: () => {
            message.success('Product stocked in branch.');
            setAddOpen(false);
            addForm.resetFields();
            queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] });
        },
        onError: (err: unknown) =>
            message.error(apiDetailMessage(err) || 'Failed to stock product.'),
    });

    const openEdit = (item: InventoryItem) => {
        setEditing(item);
        form.setFieldsValue({
            branch_price: item.branch_price,
            stock_quantity: item.stock_quantity,
            reserved_quantity: item.reserved_quantity,
            low_stock_threshold: item.low_stock_threshold,
            discount_percentage: item.discount_percentage,
            cashback_percentage: item.cashback_percentage,
            referral_commission_percentage: item.referral_commission_percentage,
            is_on_sale: item.is_on_sale,
            is_active: item.is_active,
        });
    };

    const handleSave = async () => {
        const values = await form.validateFields();
        if (!editing) return;
        const stock = values.stock_quantity ?? 0;
        const reserved = values.reserved_quantity ?? 0;
        if (stock < reserved) {
            message.error(`Cannot set stock below reserved count of ${reserved}. Resolve pending orders first.`);
            return;
        }
        // Empty number inputs come back as undefined; send an explicit null so
        // the server clears the override instead of ignoring the field.
        const { referral_commission_percentage: rawCommission, ...rest } = values;
        const payload: InventoryUpdatePayload = {
            ...rest,
            branch_price: values.branch_price ?? null,
            discount_percentage: values.discount_percentage ?? null,
            cashback_percentage: values.cashback_percentage ?? null,
        };
        const commission = rawCommission ?? null;
        const commissionChanged =
            canEditCommission && commission !== editing.referral_commission_percentage;
        updateMutation.mutate({
            id: editing.inventory_id,
            payload,
            commission: commissionChanged ? commission : undefined,
        });
    };

    const handleStock = async () => {
        const values = await addForm.validateFields();
        if (!targetBranchId) return;
        stockMutation.mutate({
            product_id: values.product_id,
            branch_id: targetBranchId,
            branch_price: values.branch_price,
            stock_quantity: values.stock_quantity,
            low_stock_threshold: values.low_stock_threshold ?? 10,
            cashback_percentage: values.cashback_percentage ?? null,
            is_active: values.is_active ?? false,
        });
    };

    const columns: ColumnsType<InventoryItem> = [
        {
            title: 'Product',
            dataIndex: 'product_name',
            key: 'product_name',
            render: (name: string) => <Text strong>{name}</Text>,
        },
        {
            title: 'SKU',
            dataIndex: 'sku',
            key: 'sku',
            render: (sku: string | null) => sku || <span style={{ color: '#bbb' }}>—</span>,
        },
        ...(showBranchColumn
            ? [
                  {
                      title: 'Branch',
                      dataIndex: 'branch_name',
                      key: 'branch_name',
                      render: (name: string) => <Tag color="geekblue">{name}</Tag>,
                  } as ColumnsType<InventoryItem>[number],
              ]
            : []),
        {
            title: 'Price',
            key: 'price',
            width: 160,
            render: (_, record) => priceCell(record),
        },
        {
            title: 'Commission',
            key: 'commission',
            width: 130,
            render: (_, record) => commissionCell(record),
        },
        {
            title: 'Stock',
            dataIndex: 'stock_quantity',
            key: 'stock_quantity',
            align: 'right',
            width: 90,
        },
        {
            title: 'Reserved',
            dataIndex: 'reserved_quantity',
            key: 'reserved_quantity',
            align: 'right',
            width: 100,
        },
        {
            title: 'Available',
            dataIndex: 'available_quantity',
            key: 'available_quantity',
            align: 'right',
            width: 100,
            render: (v: number) => {
                const available = Math.max(0, v);
                return (
                    <Text strong style={{ color: available > 0 ? '#389e0d' : '#cf1322' }}>
                        {available}
                    </Text>
                );
            },
        },
        {
            title: 'Status',
            key: 'status',
            width: 130,
            render: (_, record) => statusTag(record),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 120,
            render: (_, record) => (
                <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                    Quick Edit
                </Button>
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
                    <Space>
                        <InboxOutlined />
                        Branch Inventory
                    </Space>
                </Title>
                <Tooltip
                    title={
                        canAdd
                            ? undefined
                            : 'Select a branch first to choose where the product is stocked.'
                    }
                >
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        disabled={!canAdd}
                        onClick={() => {
                            addForm.resetFields();
                            addForm.setFieldsValue({ low_stock_threshold: 10, is_active: false });
                            setAddSearch('');
                            setAddOpen(true);
                        }}
                    >
                        Add Product to Branch
                    </Button>
                </Tooltip>
            </div>

            {/* Unified Executive Modern Filter Bar (Shopify Standard) */}
            <div
                style={{
                    background: '#ffffff',
                    padding: '16px 20px',
                    borderRadius: 14,
                    border: '1px solid #e2e8f0',
                    marginBottom: 20,
                    boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                }}
            >
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
                            style={{ width: 180 }}
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
                            style={{ width: 180 }}
                            allowClear
                            disabled={!categoryId}
                            value={subcategoryId}
                            onChange={(value) => {
                                setPage(1);
                                setSubcategoryId(value);
                            }}
                            options={subcategories.map((c) => ({ label: c.name, value: c.category_id }))}
                        />
                        <Select<PriceReviewLevel>
                            placeholder="All price reviews"
                            style={{ width: 195 }}
                            allowClear
                            popupMatchSelectWidth={false}
                            value={priceReviewLevel}
                            onChange={(value) => {
                                setPage(1);
                                setPriceReviewLevel(value);
                            }}
                            options={PRICE_REVIEW_LEVELS}
                        />
                        <Select<InventoryStockState>
                            placeholder="All stock levels"
                            style={{ width: 160 }}
                            value={stockState}
                            onChange={(value) => {
                                setPage(1);
                                setStockState(value);
                            }}
                            options={[
                                { label: 'All stock levels', value: 'all' },
                                { label: '⚠️ Low stock only', value: 'low' },
                                { label: '✅ In stock', value: 'in' },
                                { label: '❌ Out of stock', value: 'out' },
                            ]}
                        />
                        {showBranchColumn && (
                            <Select
                                placeholder="All branches"
                                style={{ width: 200 }}
                                allowClear
                                value={branchId}
                                onChange={(value) => {
                                    setPage(1);
                                    setBranchId(value);
                                }}
                                options={branches.map((b) => ({ label: b.name, value: b.branch_id }))}
                            />
                        )}
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

            <Card style={{ borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                <Table
                    rowKey="inventory_id"
                    columns={columns}
                    dataSource={data?.items ?? []}
                    loading={isLoading}
                    locale={{
                        emptyText: isError
                            ? 'Failed to load inventory.'
                            : 'No inventory items found.',
                    }}
                    scroll={{ x: 'max-content' }}
                    pagination={{
                        current: page,
                        pageSize,
                        total: data?.total ?? 0,
                        showSizeChanger: true,
                        showTotal: (t) => `Total ${t} items`,
                        onChange: (nextPage, nextSize) => {
                            setPage(nextPage);
                            setPageSize(nextSize);
                        },
                    }}
                />
            </Card>

            <Drawer
                title="Quick Edit — Inventory"
                open={!!editing}
                onClose={() => setEditing(null)}
                width={420}
                destroyOnHidden
                extra={
                    <Space>
                        <Button onClick={() => setEditing(null)}>Cancel</Button>
                        <Button
                            type="primary"
                            loading={updateMutation.isPending}
                            onClick={handleSave}
                        >
                            Save
                        </Button>
                    </Space>
                }
            >
                {editing && (
                    <>
                        <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
                            <Descriptions.Item label="Product">
                                {editing.product_name}
                            </Descriptions.Item>
                            <Descriptions.Item label="SKU">
                                {editing.sku || '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Branch">
                                {editing.branch_name}
                            </Descriptions.Item>
                            <Descriptions.Item label="Global Price">
                                {money(editing.global_price)}
                            </Descriptions.Item>
                        </Descriptions>

                        <Form form={form} layout="vertical">
                            <Form.Item
                                label="Branch Price (LKR)"
                                name="branch_price"
                                extra={`Leave empty to use the global price of ${money(
                                    editing.global_price
                                )}. Clearing this field removes the local override.`}
                            >
                                <InputNumber
                                    min={0}
                                    step={0.01}
                                    style={{ width: '100%' }}
                                    prefix="LKR"
                                    placeholder={`${editing.global_price}`}
                                />
                            </Form.Item>

                            <Form.Item
                                label="Branch Discount (%)"
                                name="discount_percentage"
                                extra="Leave empty to inherit the product's global discount."
                            >
                                <InputNumber min={0} max={100} style={{ width: '100%' }} />
                            </Form.Item>

                            <Form.Item
                                label="Cashback (%)"
                                name="cashback_percentage"
                                extra="Leave empty to use the platform default rate."
                            >
                                <InputNumber min={0} max={100} style={{ width: '100%' }} />
                            </Form.Item>

                            <Form.Item label="Quick Sale" name="is_on_sale" valuePropName="checked">
                                <Switch />
                            </Form.Item>

                            {canEditCommission && (
                                <Form.Item
                                    label={
                                        <Space size={6}>
                                            Referral commission (%)
                                            <Tooltip
                                                title={
                                                    <>
                                                        Paid to whoever referred the customer, on
                                                        what they paid for this product. Leave empty
                                                        to use the product default
                                                        {editing.global_referral_commission_percentage !== null
                                                            ? ` (${editing.global_referral_commission_percentage}%)`
                                                            : ' (none, so 0%)'}
                                                        . Orders already placed keep their rate.
                                                        {!isSuperAdmin &&
                                                            ` The most a branch can set is ${commissionMax}%.`}
                                                    </>
                                                }
                                            >
                                                <InfoCircleOutlined style={{ color: '#8c8c8c' }} />
                                            </Tooltip>
                                        </Space>
                                    }
                                    name="referral_commission_percentage"
                                >
                                    <InputNumber
                                        min={0}
                                        max={commissionMax}
                                        step={0.5}
                                        precision={2}
                                        style={{ width: '100%' }}
                                        suffix="%"
                                        placeholder={
                                            editing.global_referral_commission_percentage !== null
                                                ? `${editing.global_referral_commission_percentage} (default)`
                                                : '0 (no default)'
                                        }
                                    />
                                </Form.Item>
                            )}

                            <Divider style={{ margin: '8px 0 16px' }} />

                            <Form.Item
                                label="Stock Quantity"
                                name="stock_quantity"
                                dependencies={['reserved_quantity']}
                                rules={[
                                    { required: true, message: 'Enter stock quantity' },
                                    ({ getFieldValue }) => ({
                                        validator(_, value) {
                                            const reserved = getFieldValue('reserved_quantity') || 0;
                                            if (value !== undefined && value !== null && value < reserved) {
                                                return Promise.reject(
                                                    new Error(`Cannot set stock below reserved count of ${reserved}. Resolve pending orders first.`)
                                                );
                                            }
                                            return Promise.resolve();
                                        },
                                    }),
                                ]}
                            >
                                <InputNumber min={0} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item
                                label="Reserved Quantity"
                                name="reserved_quantity"
                                extra="Managed automatically by the system based on pending customer orders."
                            >
                                <InputNumber min={0} style={{ width: '100%' }} disabled />
                            </Form.Item>
                            <Form.Item
                                label="Low Stock Threshold"
                                name="low_stock_threshold"
                                rules={[{ required: true, message: 'Enter low-stock threshold' }]}
                                extra="Rows at or below this stock level are flagged 'Low Stock'."
                            >
                                <InputNumber min={0} style={{ width: '100%' }} />
                            </Form.Item>

                            <Form.Item
                                label="Visible in this branch"
                                name="is_active"
                                valuePropName="checked"
                                extra="Turn off to hide this product from customers in this branch, even though it stays in the global catalog."
                            >
                                <Switch checkedChildren="Visible" unCheckedChildren="Hidden" />
                            </Form.Item>
                        </Form>
                        <BranchWeightRows
                            rows={editWeights.rows}
                            onPrice={editWeights.setPrice}
                            onKilo={(v) => form.setFieldValue('branch_price', v)}
                        />
                    </>
                )}
            </Drawer>

            <Modal
                title="Add Product to Branch"
                open={addOpen}
                onOk={handleStock}
                onCancel={() => setAddOpen(false)}
                okText="Stock Product"
                confirmLoading={stockMutation.isPending}
                destroyOnHidden
            >
                <Text type="secondary">
                    Pick a product from the global catalog to carry in this branch. Until it's
                    stocked here, customers in this branch can't see it.
                </Text>

                <Form form={addForm} layout="vertical" style={{ marginTop: 16 }}>
                    <Form.Item
                        label="Product"
                        name="product_id"
                        rules={[{ required: true, message: 'Select a product' }]}
                    >
                        <Select
                            showSearch
                            placeholder="Search the global catalog…"
                            loading={loadingStockable}
                            filterOption={false}
                            onSearch={setAddSearch}
                            onChange={(productId) => {
                                const selected = (stockable?.products ?? []).find(
                                    (p: StockableProduct) => p.product_id === productId
                                );
                                setAddGlobalPrice(Number(selected?.global_price) || 0);
                                if (selected && selected.global_price !== undefined && selected.global_price !== null) {
                                    addForm.setFieldValue(
                                        'branch_price',
                                        selected.global_price > 0 ? selected.global_price : undefined
                                    );
                                }
                            }}
                            notFoundContent={
                                loadingStockable
                                    ? 'Searching…'
                                    : 'No unstocked products match.'
                            }
                            options={(stockable?.products ?? []).map((p: StockableProduct) => ({
                                label: `${p.name}${p.sku ? ` (${p.sku})` : ''}`,
                                value: p.product_id,
                            }))}
                        />
                    </Form.Item>

                    <Form.Item
                        label="Branch Price (LKR)"
                        name="branch_price"
                        rules={[
                            { required: true, message: 'Enter the price for this branch' },
                            { type: 'number', min: 0.01, message: 'Price must be greater than 0' },
                        ]}
                        extra="Defaulted to the catalog Base Price. You can change it specifically for this branch."
                    >
                        <InputNumber
                            min={0.01}
                            step={0.01}
                            style={{ width: '100%' }}
                            prefix="LKR"
                            placeholder="0.00"
                        />
                    </Form.Item>

                    <Form.Item
                        label="Opening Stock"
                        name="stock_quantity"
                        rules={[{ required: true, message: 'Enter opening stock' }]}
                        extra="A product with zero stock stays hidden from customers."
                    >
                        <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item label="Low Stock Threshold" name="low_stock_threshold">
                        <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item
                        label="Cashback (%)"
                        name="cashback_percentage"
                        extra="Leave empty to use the platform default rate."
                    >
                        <InputNumber
                            min={0}
                            max={100}
                            style={{ width: '100%' }}
                            placeholder="Platform default"
                            suffix="%"
                        />
                    </Form.Item>

                    <Form.Item
                        label="Visible in this branch"
                        name="is_active"
                        valuePropName="checked"
                        extra="Stays hidden from customers until you turn this on — here or later from Quick Edit."
                    >
                        <Switch checkedChildren="Visible" unCheckedChildren="Hidden" />
                    </Form.Item>
                </Form>
                <BranchWeightRows
                    rows={addWeights.rows}
                    onPrice={addWeights.setPrice}
                    onKilo={(v) => addForm.setFieldValue('branch_price', v ?? undefined)}
                />
            </Modal>
        </div>
    );
};

export default BranchInventory;
