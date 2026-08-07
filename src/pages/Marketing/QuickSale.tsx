/**
 * Quick Sale Management (Marketing Manager)
 *
 * Branch-scoped: Marketing/Branch Managers act on their own assigned branch;
 * Super Admins pick a branch first. Backed by /api/v1/admin/marketing —
 * discount_percentage + is_on_sale on branch_inventory drive the customer-
 * facing "Quick Sale" feed on the Home screen (COALESCE branch -> global).
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
    Form,
    InputNumber,
    Switch,
    Select,
    App,
    Typography,
    Empty,
    List,
    Avatar,
} from 'antd';
import { EditOutlined, SearchOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { marketingApi } from '../../api/marketing.api';
import type { MarketingProduct, MarketingInventoryUpdatePayload } from '../../api/marketing.api';
import { branchesApi } from '../../api/branches.api';
import { usePermissions } from '../../hooks/usePermissions';

const { Title, Text } = Typography;

const money = (v: number) =>
    `Rs ${v.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const priceCell = (item: MarketingProduct) => {
    const overridden = item.branch_price !== null;
    return (
        <Space direction="vertical" size={0} style={{ lineHeight: 1.3 }}>
            <Text strong>{money(item.effective_price)}</Text>
            {overridden ? (
                <Text type="secondary" delete style={{ fontSize: 12 }}>
                    {money(item.global_price)}
                </Text>
            ) : (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    Global price
                </Text>
            )}
        </Space>
    );
};

const discountCell = (item: MarketingProduct) => {
    const effective = item.discount_percentage ?? item.global_discount_percentage ?? 0;
    const overridden = item.discount_percentage !== null;
    if (!effective) return <Text type="secondary">—</Text>;
    return (
        <Space size={4}>
            <Text strong>{effective}%</Text>
            {overridden && <Tag color="gold">Local</Tag>}
        </Space>
    );
};

interface QuickSaleFormValues {
    discount_percentage?: number | null;
    cashback_percentage?: number | null;
    is_on_sale: boolean;
}

const QuickSale: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const { isSuperAdmin } = usePermissions();
    const [form] = Form.useForm<QuickSaleFormValues>();

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [search, setSearch] = useState('');
    const [branchId, setBranchId] = useState<string | undefined>(undefined);
    const [editing, setEditing] = useState<MarketingProduct | null>(null);

    const { data: branches = [] } = useQuery({
        queryKey: ['admin', 'branches'],
        queryFn: branchesApi.list,
        enabled: isSuperAdmin,
    });

    // Super Admins must pick a branch first; scoped managers always have one.
    const canQuery = !isSuperAdmin || !!branchId;
    const activeBranchId = isSuperAdmin ? branchId : undefined;

    const { data, isLoading, isError } = useQuery({
        queryKey: ['admin', 'marketing', 'products', { page, pageSize, search, branchId }],
        queryFn: () =>
            marketingApi.listProducts({
                page,
                limit: pageSize,
                search: search || undefined,
                branch_id: activeBranchId,
            }),
        enabled: canQuery,
        placeholderData: keepPreviousData,
    });

    const { data: quickSaleItems = [], isLoading: loadingPreview } = useQuery({
        queryKey: ['admin', 'marketing', 'quick-sale', { branchId }],
        queryFn: () => marketingApi.previewQuickSale(activeBranchId),
        enabled: canQuery,
    });

    const updateMutation = useMutation({
        mutationFn: ({
            productId,
            payload,
        }: {
            productId: string;
            payload: MarketingInventoryUpdatePayload;
        }) => marketingApi.updateInventory(productId, payload, activeBranchId),
        onSuccess: () => {
            message.success('Quick Sale settings updated.');
            setEditing(null);
            queryClient.invalidateQueries({ queryKey: ['admin', 'marketing'] });
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to update Quick Sale settings.'),
    });

    const openEdit = (item: MarketingProduct) => {
        setEditing(item);
        form.setFieldsValue({
            discount_percentage: item.discount_percentage,
            cashback_percentage: item.cashback_percentage,
            is_on_sale: item.is_on_sale,
        });
    };

    const handleSave = async () => {
        const values = await form.validateFields();
        if (!editing) return;
        updateMutation.mutate({
            productId: editing.product_id,
            payload: {
                // Empty clears this branch's override, so the product-wide
                // value (and then the platform rate) applies again.
                discount_percentage: values.discount_percentage ?? null,
                cashback_percentage: values.cashback_percentage ?? null,
                is_on_sale: values.is_on_sale,
            },
        });
    };

    const columns: ColumnsType<MarketingProduct> = [
        {
            title: 'Product',
            dataIndex: 'name',
            key: 'name',
            render: (name: string) => <Text strong>{name}</Text>,
        },
        {
            title: 'SKU',
            dataIndex: 'sku',
            key: 'sku',
            render: (sku: string | null) => sku || <span style={{ color: '#bbb' }}>—</span>,
        },
        {
            title: 'Price',
            key: 'price',
            width: 160,
            render: (_, record) => priceCell(record),
        },
        {
            title: 'Discount',
            key: 'discount',
            width: 130,
            render: (_, record) => discountCell(record),
        },
        {
            title: 'Cashback',
            key: 'cashback',
            width: 130,
            render: (_, record) => (
                <Space size={4}>
                    <Text strong>{record.effective_cashback}%</Text>
                    {record.cashback_percentage !== null && <Tag color="gold">Local</Tag>}
                </Space>
            ),
        },
        {
            title: 'Quick Sale',
            dataIndex: 'is_on_sale',
            key: 'is_on_sale',
            width: 110,
            render: (v: boolean) => (v ? <Tag color="magenta">On</Tag> : <Tag>Off</Tag>),
        },
        {
            title: 'Stock',
            dataIndex: 'stock_quantity',
            key: 'stock_quantity',
            align: 'right',
            width: 90,
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 100,
            render: (_, record) => (
                <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                    Manage
                </Button>
            ),
        },
    ];

    return (
        <div>
            <div style={{ marginBottom: 16 }}>
                <Title level={3} style={{ margin: 0 }}>
                    <Space>
                        <ThunderboltOutlined />
                        Quick Sale
                    </Space>
                </Title>
                <Text type="secondary">
                    Set a discount and flip a product into Quick Sale — it appears on the Home
                    screen for every customer shopping in this branch.
                </Text>
            </div>

            {isSuperAdmin && (
                <Card size="small" style={{ marginBottom: 16 }}>
                    <Space>
                        <Text>Branch</Text>
                        <Select
                            placeholder="Select a branch to manage"
                            style={{ width: 260 }}
                            value={branchId}
                            onChange={(value) => {
                                setPage(1);
                                setBranchId(value);
                            }}
                            options={branches.map((b) => ({ label: b.name, value: b.branch_id }))}
                        />
                    </Space>
                </Card>
            )}

            {!canQuery ? (
                <Card>
                    <Empty description="Select a branch above to manage its Quick Sale products." />
                </Card>
            ) : (
                <Space direction="vertical" size={16} style={{ width: '100%' }}>
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
                        </Space>

                        <Table
                            rowKey="product_id"
                            columns={columns}
                            dataSource={data?.products ?? []}
                            loading={isLoading}
                            locale={{
                                emptyText: isError
                                    ? 'Failed to load products.'
                                    : 'No products stocked in this branch yet.',
                            }}
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

                    <Card
                        title="Live Quick Sale Preview"
                        extra={<Text type="secondary">What customers see on the Home screen</Text>}
                    >
                        <List
                            loading={loadingPreview}
                            dataSource={quickSaleItems}
                            locale={{ emptyText: 'No products are currently on Quick Sale for this branch.' }}
                            renderItem={(item) => (
                                <List.Item>
                                    <List.Item.Meta
                                        avatar={
                                            <Avatar
                                                shape="square"
                                                src={item.images[0]?.imageUrl}
                                                icon={<ThunderboltOutlined />}
                                            />
                                        }
                                        title={item.name}
                                        description={item.category?.name || 'Uncategorized'}
                                    />
                                    <Space direction="vertical" align="end" size={0}>
                                        <Text strong>{money(item.effectivePrice)}</Text>
                                        <Tag color="magenta">{item.effectiveDiscount}% off</Tag>
                                    </Space>
                                </List.Item>
                            )}
                        />
                    </Card>
                </Space>
            )}

            <Drawer
                title="Manage Quick Sale"
                open={!!editing}
                onClose={() => setEditing(null)}
                width={380}
                destroyOnHidden
                extra={
                    <Space>
                        <Button onClick={() => setEditing(null)}>Cancel</Button>
                        <Button type="primary" loading={updateMutation.isPending} onClick={handleSave}>
                            Save
                        </Button>
                    </Space>
                }
            >
                {editing && (
                    <>
                        <Space direction="vertical" size={4} style={{ marginBottom: 16 }}>
                            <Text strong>{editing.name}</Text>
                            <Text type="secondary">
                                Global price {money(editing.global_price)}
                                {editing.global_discount_percentage
                                    ? ` — global discount ${editing.global_discount_percentage}%`
                                    : ''}
                            </Text>
                        </Space>

                        <Form form={form} layout="vertical">
                            <Form.Item
                                label="Branch Discount (%)"
                                name="discount_percentage"
                                extra="Leave empty to inherit the product's global discount."
                            >
                                <InputNumber min={0} max={100} style={{ width: '100%' }} />
                            </Form.Item>

                            <Form.Item
                                label="Branch Cashback (%)"
                                name="cashback_percentage"
                                extra={
                                    editing.global_cashback_percentage !== null
                                        ? `Leave empty to inherit this product's ${editing.global_cashback_percentage}% cashback.`
                                        : 'Leave empty to inherit the platform default cashback rate.'
                                }
                            >
                                <InputNumber
                                    min={0}
                                    max={100}
                                    style={{ width: '100%' }}
                                    placeholder={`Inherited: ${editing.effective_cashback}%`}
                                />
                            </Form.Item>

                            <Form.Item
                                label="Quick Sale"
                                name="is_on_sale"
                                valuePropName="checked"
                                extra="On: this product appears in the Quick Sale feed for this branch's customers."
                            >
                                <Switch checkedChildren="On" unCheckedChildren="Off" />
                            </Form.Item>
                        </Form>
                    </>
                )}
            </Drawer>
        </div>
    );
};

export default QuickSale;
