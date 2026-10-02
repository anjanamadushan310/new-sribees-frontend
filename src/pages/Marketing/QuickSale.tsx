/**
 * Quick Sale Management (Marketing Manager)
 *
 * Branch-scoped: Marketing/Branch Managers act on their own assigned branch;
 * Super Admins pick a branch first. Backed by /api/v1/admin/marketing —
 * discount_percentage + is_on_sale on branch_inventory drive the customer-
 * facing "Quick Sale" feed on the Home screen (COALESCE branch -> global).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
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
    Tabs,
    DatePicker,
    Checkbox,
    Divider,
    Row,
    Col,
    Badge,
    Tooltip,
} from 'antd';
import {
    EditOutlined,
    SearchOutlined,
    ThunderboltOutlined,
    CalendarOutlined,
    InboxOutlined,
    UserOutlined,
    StopOutlined,
} from '@ant-design/icons';
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
    date_range?: [dayjs.Dayjs, dayjs.Dayjs] | null;
    all_stock?: boolean;
    deal_quota?: number | null;
    max_units_per_customer?: number | null;
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
    const [activeTab, setActiveTab] = useState<'all' | 'live' | 'scheduled' | 'expired_soldout'>('all');

    // Deep link from the Products page's "⚡ Add Deal" button:
    // /quick-sale?action=new_deal&sku=XYZ
    const [searchParams, setSearchParams] = useSearchParams();
    const deepLinkConsumed = useRef(false);

    useEffect(() => {
        if (deepLinkConsumed.current) return;
        const sku = searchParams.get('sku');
        if (!sku) return;
        deepLinkConsumed.current = true;
        setSearch(sku);
        setPage(1);
        setSearchParams({}, { replace: true });
    }, [searchParams, setSearchParams]);

    const discountVal = Form.useWatch('discount_percentage', form);
    const cashbackVal = Form.useWatch('cashback_percentage', form);
    const allStockVal = Form.useWatch('all_stock', form) ?? true;

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

    // Tab counts and filtered data
    const filteredProducts = useMemo(() => {
        const list = data?.products ?? [];
        if (activeTab === 'all') return list;
        if (activeTab === 'live') {
            return list.filter((p) => p.is_on_sale && p.stock_quantity > 0);
        }
        if (activeTab === 'scheduled') {
            return list.filter((p) => p.is_on_sale && (p as any).is_scheduled);
        }
        if (activeTab === 'expired_soldout') {
            return list.filter((p) => p.is_on_sale && p.stock_quantity <= 0);
        }
        return list;
    }, [data?.products, activeTab]);

    const tabCounts = useMemo(() => {
        const list = data?.products ?? [];
        return {
            all: data?.total ?? list.length,
            live: list.filter((p) => p.is_on_sale && p.stock_quantity > 0).length,
            scheduled: list.filter((p) => p.is_on_sale && (p as any).is_scheduled).length,
            expired_soldout: list.filter((p) => p.is_on_sale && p.stock_quantity <= 0).length,
        };
    }, [data?.products, data?.total]);

    const updateMutation = useMutation({
        mutationFn: ({
            productId,
            payload,
        }: {
            productId: string;
            payload: MarketingInventoryUpdatePayload;
        }) => marketingApi.updateInventory(productId, payload, activeBranchId),
        onSuccess: () => {
            message.success('Quick Sale settings & promotional controls updated successfully.');
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
            all_stock: true,
            deal_quota: null,
            max_units_per_customer: null,
            date_range: null,
        });
    };

    const handleSave = async () => {
        const values = await form.validateFields();
        if (!editing) return;
        updateMutation.mutate({
            productId: editing.product_id,
            payload: {
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
            title: 'Quick Sale Status',
            key: 'is_on_sale',
            width: 150,
            render: (_, record) => {
                if (!record.is_on_sale) {
                    return <Tag color="default">Off</Tag>;
                }
                if (record.stock_quantity <= 0) {
                    return <Tag color="volcano" icon={<StopOutlined />}>Sold Out</Tag>;
                }
                return <Tag color="magenta" icon={<ThunderboltOutlined />}>⚡ Live Deal</Tag>;
            },
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
                        Quick Sale & Promotion Management
                    </Space>
                </Title>
                <Text type="secondary">
                    Configure branch flash discounts, schedules, quotas, and customer limits — deals appear live on the Home screen.
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
                        {/* 4 Filter Tabs */}
                        <Tabs
                            activeKey={activeTab}
                            onChange={(key) => {
                                setActiveTab(key as any);
                                setPage(1);
                            }}
                            style={{ marginBottom: 16 }}
                            items={[
                                {
                                    key: 'all',
                                    label: (
                                        <span>
                                            All Products <Badge count={tabCounts.all} showZero overflowCount={999} style={{ backgroundColor: '#64748b' }} />
                                        </span>
                                    ),
                                },
                                {
                                    key: 'live',
                                    label: (
                                        <span>
                                            ⚡ Live Deals <Badge count={tabCounts.live} showZero style={{ backgroundColor: '#eb2f96' }} />
                                        </span>
                                    ),
                                },
                                {
                                    key: 'scheduled',
                                    label: (
                                        <span>
                                            📅 Scheduled <Badge count={tabCounts.scheduled} showZero style={{ backgroundColor: '#1890ff' }} />
                                        </span>
                                    ),
                                },
                                {
                                    key: 'expired_soldout',
                                    label: (
                                        <span>
                                            ⌛ Expired / Sold Out <Badge count={tabCounts.expired_soldout} showZero style={{ backgroundColor: '#fa8c16' }} />
                                        </span>
                                    ),
                                },
                            ]}
                        />

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
                            dataSource={filteredProducts}
                            loading={isLoading}
                            locale={{
                                emptyText: isError
                                    ? 'Failed to load products.'
                                    : 'No products match the selected Quick Sale filter.',
                            }}
                            pagination={{
                                current: page,
                                pageSize,
                                total: activeTab === 'all' ? (data?.total ?? 0) : filteredProducts.length,
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

            {/* Manage Quick Sale Drawer with Promotional Controls */}
            <Drawer
                title="Manage Quick Sale & Promotion"
                open={!!editing}
                onClose={() => setEditing(null)}
                width={440}
                destroyOnHidden
                extra={
                    <Space>
                        <Button onClick={() => setEditing(null)}>Cancel</Button>
                        <Button type="primary" loading={updateMutation.isPending} onClick={handleSave}>
                            Save Changes
                        </Button>
                    </Space>
                }
            >
                {editing && (
                    <>
                        <Card size="small" style={{ marginBottom: 16, backgroundColor: '#f8fafc', borderRadius: 8 }}>
                            <Space direction="vertical" size={2}>
                                <Text strong style={{ fontSize: 14 }}>{editing.name}</Text>
                                <Space split={<Text type="secondary">•</Text>}>
                                    <Text type="secondary" style={{ fontSize: 12 }}>SKU: {editing.sku || '—'}</Text>
                                    <Text type="secondary" style={{ fontSize: 12 }}>Stock: {editing.stock_quantity} units</Text>
                                </Space>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    Global Price: {money(editing.global_price)}
                                    {editing.global_discount_percentage ? ` (${editing.global_discount_percentage}% off)` : ''}
                                </Text>
                            </Space>
                        </Card>

                        <Form form={form} layout="vertical">
                            {/* 1. Quick Sale Activation */}
                            <Form.Item
                                label={<span style={{ fontWeight: 600 }}>Quick Sale Activation</span>}
                                name="is_on_sale"
                                valuePropName="checked"
                                extra="Enable this deal to appear in the Quick Sale flash deal feed on the customer Home screen."
                            >
                                <Switch checkedChildren="⚡ Active" unCheckedChildren="Inactive" />
                            </Form.Item>

                            <Divider style={{ margin: '14px 0' }} />

                            {/* 2. Branch Discount & Cashback */}
                            <Row gutter={12}>
                                <Col span={12}>
                                    <Form.Item
                                        label={
                                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                                <span>Discount (%)</span>
                                                {discountVal != null && (
                                                    <Button
                                                        type="link"
                                                        size="small"
                                                        style={{ padding: 0, height: 'auto', fontSize: 11 }}
                                                        onClick={() => form.setFieldValue('discount_percentage', null)}
                                                    >
                                                        Reset
                                                    </Button>
                                                )}
                                            </div>
                                        }
                                        name="discount_percentage"
                                        extra="Branch override %"
                                    >
                                        <InputNumber
                                            min={0}
                                            max={100}
                                            style={{ width: '100%' }}
                                            placeholder={`Default: ${editing.global_discount_percentage ?? 0}%`}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col span={12}>
                                    <Form.Item
                                        label={
                                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                                <span>Cashback (%)</span>
                                                {cashbackVal != null && (
                                                    <Button
                                                        type="link"
                                                        size="small"
                                                        style={{ padding: 0, height: 'auto', fontSize: 11 }}
                                                        onClick={() => form.setFieldValue('cashback_percentage', null)}
                                                    >
                                                        Reset
                                                    </Button>
                                                )}
                                            </div>
                                        }
                                        name="cashback_percentage"
                                        extra="Reward %"
                                    >
                                        <InputNumber
                                            min={0}
                                            max={100}
                                            style={{ width: '100%' }}
                                            placeholder={`Default: ${editing.effective_cashback}%`}
                                        />
                                    </Form.Item>
                                </Col>
                            </Row>

                            <Divider style={{ margin: '14px 0' }} />

                            {/* 3. Schedule Date / Time Window */}
                            <Form.Item
                                label={
                                    <Space size={4}>
                                        <CalendarOutlined style={{ color: '#2563eb' }} />
                                        <span style={{ fontWeight: 600 }}>Schedule Date / Time Window</span>
                                    </Space>
                                }
                                name="date_range"
                                extra="Select start and end date/time to run this deal on a pre-planned schedule."
                            >
                                <DatePicker.RangePicker
                                    showTime={{ format: 'HH:mm' }}
                                    format="YYYY-MM-DD HH:mm"
                                    style={{ width: '100%' }}
                                    placeholder={['Start Date & Time', 'End Date & Time']}
                                />
                            </Form.Item>

                            <Divider style={{ margin: '14px 0' }} />

                            {/* 4. Deal Quota / Stock Allocation */}
                            <div style={{ marginBottom: 12 }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <Space size={4}>
                                        <InboxOutlined style={{ color: '#059669' }} />
                                        <span style={{ fontWeight: 600 }}>Deal Quota & Stock Allocation</span>
                                    </Space>
                                </div>
                                <Form.Item name="all_stock" valuePropName="checked" style={{ marginBottom: 8 }}>
                                    <Checkbox>Apply discount to all available branch stock ({editing.stock_quantity} units)</Checkbox>
                                </Form.Item>
                                {!allStockVal && (
                                    <Form.Item
                                        label="Promotional Quota (Units)"
                                        name="deal_quota"
                                        extra="Maximum number of units allocated for this Quick Sale clearance deal."
                                    >
                                        <InputNumber
                                            min={1}
                                            max={editing.stock_quantity || 1000}
                                            style={{ width: '100%' }}
                                            placeholder="e.g. 50 units"
                                        />
                                    </Form.Item>
                                )}
                            </div>

                            <Divider style={{ margin: '14px 0' }} />

                            {/* 5. Max Units Per Customer */}
                            <Form.Item
                                label={
                                    <Space size={4}>
                                        <UserOutlined style={{ color: '#d97706' }} />
                                        <span style={{ fontWeight: 600 }}>Max Units Per Customer</span>
                                    </Space>
                                }
                                name="max_units_per_customer"
                                extra="Restrict purchase quantity per customer order to prevent hoarding."
                            >
                                <InputNumber
                                    min={1}
                                    max={100}
                                    style={{ width: '100%' }}
                                    placeholder="e.g. 2 units (Leave empty for no limit)"
                                />
                            </Form.Item>
                        </Form>
                    </>
                )}
            </Drawer>
        </div>
    );
};

export default QuickSale;
