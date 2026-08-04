/**
 * Branch Inventory (Module 7.5)
 *
 * Branch-scoped stock table. The server (inject_branch_filter) already limits
 * rows to the caller's branch for Branch/Inventory Managers and returns all
 * branches for Super Admins; the response's `scope` tells us whether to show
 * the Branch column.
 */
import React, { useState } from 'react';
import {
    Card,
    Table,
    Tag,
    Space,
    Input,
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
    SearchOutlined,
    InboxOutlined,
    PlusOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { inventoryApi } from '../../api/inventory.api';
import type {
    InventoryItem,
    InventoryUpdatePayload,
    StockableProduct,
} from '../../api/inventory.api';
import { branchesApi } from '../../api/branches.api';
import { usePermissions } from '../../hooks/usePermissions';

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

const BranchInventory: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const { isSuperAdmin } = usePermissions();
    const [form] = Form.useForm<InventoryUpdatePayload>();

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [search, setSearch] = useState('');
    const [lowStockOnly, setLowStockOnly] = useState(false);
    const [branchId, setBranchId] = useState<string | undefined>(undefined);
    const [editing, setEditing] = useState<InventoryItem | null>(null);
    const [addOpen, setAddOpen] = useState(false);
    const [addSearch, setAddSearch] = useState('');
    const [addForm] = Form.useForm<{
        product_id: string;
        branch_price?: number | null;
        stock_quantity: number;
        low_stock_threshold: number;
    }>();

    // Branch options for the Super Admin branch filter (branches API is now live).
    const { data: branches = [] } = useQuery({
        queryKey: ['admin', 'branches'],
        queryFn: branchesApi.list,
        enabled: isSuperAdmin,
    });

    const queryKey = ['admin', 'inventory', { page, pageSize, search, lowStockOnly, branchId }];

    const { data, isLoading, isError } = useQuery({
        queryKey,
        queryFn: () =>
            inventoryApi.list({
                page,
                limit: pageSize,
                search: search || undefined,
                low_stock_only: lowStockOnly || undefined,
                branch_id: branchId, // ignored by the server for non-super admins
            }),
        placeholderData: keepPreviousData,
    });

    // Prefer the server's scope; fall back to the local role before data loads.
    const showBranchColumn = data?.scope.is_super_admin ?? isSuperAdmin;

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: InventoryUpdatePayload }) =>
            inventoryApi.update(id, payload),
        onSuccess: () => {
            message.success('Inventory updated.');
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] });
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to update inventory.'),
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

    const stockMutation = useMutation({
        mutationFn: (payload: Parameters<typeof inventoryApi.stockProduct>[0]) =>
            inventoryApi.stockProduct(payload),
        onSuccess: () => {
            message.success('Product stocked in branch.');
            setAddOpen(false);
            addForm.resetFields();
            queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] });
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to stock product.'),
    });

    const openEdit = (item: InventoryItem) => {
        setEditing(item);
        form.setFieldsValue({
            branch_price: item.branch_price,
            stock_quantity: item.stock_quantity,
            reserved_quantity: item.reserved_quantity,
            low_stock_threshold: item.low_stock_threshold,
            discount_percentage: item.discount_percentage,
            is_on_sale: item.is_on_sale,
            is_active: item.is_active,
        });
    };

    const handleSave = async () => {
        const values = await form.validateFields();
        if (!editing) return;
        // Empty number inputs come back as undefined; send an explicit null so
        // the server clears the override instead of ignoring the field.
        const payload: InventoryUpdatePayload = {
            ...values,
            branch_price: values.branch_price ?? null,
            discount_percentage: values.discount_percentage ?? null,
        };
        updateMutation.mutate({ id: editing.inventory_id, payload });
    };

    const handleStock = async () => {
        const values = await addForm.validateFields();
        if (!targetBranchId) return;
        stockMutation.mutate({
            product_id: values.product_id,
            branch_id: targetBranchId,
            branch_price: values.branch_price ?? null,
            stock_quantity: values.stock_quantity ?? 0,
            low_stock_threshold: values.low_stock_threshold ?? 10,
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
            render: (v: number) => (
                <Text strong style={{ color: v > 0 ? '#389e0d' : '#cf1322' }}>
                    {v}
                </Text>
            ),
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
                            addForm.setFieldsValue({ stock_quantity: 0, low_stock_threshold: 10 });
                            setAddSearch('');
                            setAddOpen(true);
                        }}
                    >
                        Add Product to Branch
                    </Button>
                </Tooltip>
            </div>

            <Card>
                <Space wrap style={{ marginBottom: 16 }}>
                    <Input.Search
                        placeholder="Search product or SKU…"
                        allowClear
                        enterButton={<SearchOutlined />}
                        style={{ width: 300 }}
                        onSearch={(value) => {
                            setPage(1);
                            setSearch(value);
                        }}
                    />
                    {showBranchColumn && (
                        <Select
                            placeholder="All branches"
                            style={{ width: 220 }}
                            allowClear
                            value={branchId}
                            onChange={(value) => {
                                setPage(1);
                                setBranchId(value);
                            }}
                            options={branches.map((b) => ({ label: b.name, value: b.branch_id }))}
                        />
                    )}
                    <Space>
                        <Text type="secondary">Low stock only</Text>
                        <Switch
                            checked={lowStockOnly}
                            onChange={(checked) => {
                                setPage(1);
                                setLowStockOnly(checked);
                            }}
                        />
                    </Space>
                </Space>

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
                                    prefix="Rs"
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

                            <Form.Item label="Quick Sale" name="is_on_sale" valuePropName="checked">
                                <Switch />
                            </Form.Item>

                            <Divider style={{ margin: '8px 0 16px' }} />

                            <Form.Item
                                label="Stock Quantity"
                                name="stock_quantity"
                                rules={[{ required: true, message: 'Enter stock quantity' }]}
                            >
                                <InputNumber min={0} style={{ width: '100%' }} />
                            </Form.Item>
                            <Form.Item
                                label="Reserved Quantity"
                                name="reserved_quantity"
                                rules={[{ required: true, message: 'Enter reserved quantity' }]}
                            >
                                <InputNumber min={0} style={{ width: '100%' }} />
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
                            notFoundContent={
                                loadingStockable
                                    ? 'Searching…'
                                    : 'No unstocked products match.'
                            }
                            options={(stockable?.products ?? []).map((p: StockableProduct) => ({
                                label: `${p.name}${p.sku ? ` (${p.sku})` : ''} — ${money(
                                    p.global_price
                                )}`,
                                value: p.product_id,
                            }))}
                        />
                    </Form.Item>

                    <Form.Item
                        label="Branch Price (LKR)"
                        name="branch_price"
                        extra="Leave empty to sell at the product's global price."
                    >
                        <InputNumber
                            min={0}
                            step={0.01}
                            style={{ width: '100%' }}
                            prefix="Rs"
                            placeholder="Use global price"
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
                </Form>
            </Modal>
        </div>
    );
};

export default BranchInventory;
