/**
 * Inventory Dashboard — Inventory Manager view.
 *
 * Branch-scoped on the server via inject_branch_filter — every call below
 * automatically comes back limited to this admin's own branch, so there is
 * no branch filtering here on the client.
 */
import React from 'react';
import { Card, Row, Col, Statistic, List, Spin, Alert, Progress, Space, Typography, Badge, Button, Empty, Tag } from 'antd';
import {
    InboxOutlined,
    WarningOutlined,
    TagsOutlined,
    AppstoreAddOutlined,
    ArrowRightOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { inventoryApi } from '../../api/inventory.api';
import { categoriesApi } from '../../api/categories.api';
import { useAuthStore } from '../../store/authStore';
import { apiErrorMessage } from '../../utils/analytics';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const InventoryDashboard: React.FC = () => {
    const navigate = useNavigate();
    const user = useAuthStore((state) => state.user);

    const stockedQuery = useQuery({
        queryKey: ['admin', 'inventory', 'count', 'all'],
        queryFn: () => inventoryApi.list({ limit: 1 }),
    });
    const lowStockQuery = useQuery({
        queryKey: ['admin', 'inventory', 'low-stock', 'dashboard'],
        queryFn: () => inventoryApi.list({ low_stock_only: true, limit: 8 }),
    });
    const categoriesQuery = useQuery({
        queryKey: ['admin', 'categories', 'count'],
        queryFn: () => categoriesApi.list(),
    });
    const stockableQuery = useQuery({
        queryKey: ['admin', 'inventory', 'stockable', 'count'],
        queryFn: () => inventoryApi.stockable({ limit: 1 }),
    });

    const firstError = [stockedQuery, lowStockQuery, categoriesQuery, stockableQuery].find((q) => q.isError);

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '24px' }}>
                <Title level={2} style={{ margin: 0 }}>
                    Inventory Dashboard
                </Title>
                <Text type="secondary">
                    {user?.branch_name ? `${user.branch_name} • ` : ''}
                    {dayjs().format('dddd, MMMM D, YYYY')}
                </Text>
            </div>

            {firstError && (
                <Alert
                    message="Failed to load inventory data"
                    description={apiErrorMessage(firstError.error)}
                    type="error"
                    showIcon
                    style={{ marginBottom: '24px' }}
                />
            )}

            <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
                <Col xs={24} sm={12} lg={6}>
                    <Card hoverable onClick={() => navigate('/inventory')}>
                        <Statistic
                            title="Stocked SKUs"
                            value={stockedQuery.data?.total ?? 0}
                            loading={stockedQuery.isLoading}
                            prefix={<InboxOutlined style={{ color: '#2563eb' }} />}
                            styles={{ content: { color: '#2563eb' } }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card
                        hoverable
                        onClick={() => navigate('/inventory/low-stock')}
                        style={{ borderLeft: (lowStockQuery.data?.total ?? 0) > 0 ? '4px solid #ff4d4f' : undefined }}
                    >
                        <Statistic
                            title="Low Stock Alerts"
                            value={lowStockQuery.data?.total ?? 0}
                            loading={lowStockQuery.isLoading}
                            prefix={<WarningOutlined style={{ color: '#ff4d4f' }} />}
                            styles={{ content: { color: '#ff4d4f' } }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card hoverable onClick={() => navigate('/categories')}>
                        <Statistic
                            title="Categories"
                            value={categoriesQuery.data?.length ?? 0}
                            loading={categoriesQuery.isLoading}
                            prefix={<TagsOutlined style={{ color: '#7c3aed' }} />}
                            styles={{ content: { color: '#7c3aed' } }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card hoverable onClick={() => navigate('/inventory')}>
                        <Statistic
                            title="Not Yet Stocked"
                            value={stockableQuery.data?.total ?? 0}
                            loading={stockableQuery.isLoading}
                            prefix={<AppstoreAddOutlined style={{ color: '#16a34a' }} />}
                            styles={{ content: { color: '#16a34a' } }}
                            suffix={<Text type="secondary" style={{ fontSize: 12 }}>from global catalog</Text>}
                        />
                    </Card>
                </Col>
            </Row>

            <Card
                title={
                    <Space>
                        <WarningOutlined style={{ color: '#ff4d4f' }} />
                        <span>Low Stock Items</span>
                        <Badge count={lowStockQuery.data?.total ?? 0} style={{ backgroundColor: '#ff4d4f' }} />
                    </Space>
                }
                extra={
                    <Button type="link" onClick={() => navigate('/inventory/low-stock')}>
                        View All <ArrowRightOutlined />
                    </Button>
                }
            >
                {lowStockQuery.isLoading ? (
                    <div style={{ textAlign: 'center', padding: 32 }}>
                        <Spin size="large" />
                    </div>
                ) : (lowStockQuery.data?.items.length ?? 0) === 0 ? (
                    <Empty description="Nothing below its reorder threshold. 🎉" />
                ) : (
                    <List
                        dataSource={lowStockQuery.data?.items ?? []}
                        renderItem={(item) => (
                            <List.Item key={item.inventory_id}>
                                <List.Item.Meta
                                    title={
                                        <Space>
                                            <Text>{item.product_name}</Text>
                                            {item.sku && (
                                                <Text type="secondary" style={{ fontSize: 12 }}>
                                                    ({item.sku})
                                                </Text>
                                            )}
                                            {!item.is_active && <Tag color="default">Inactive</Tag>}
                                        </Space>
                                    }
                                    description={
                                        <div style={{ width: '100%', maxWidth: 360 }}>
                                            <Progress
                                                percent={Math.round(
                                                    (item.stock_quantity / Math.max(item.low_stock_threshold, 1)) * 100
                                                )}
                                                size="small"
                                                status={item.stock_quantity === 0 ? 'exception' : 'normal'}
                                                format={() => `${item.stock_quantity}/${item.low_stock_threshold}`}
                                            />
                                        </div>
                                    }
                                />
                            </List.Item>
                        )}
                    />
                )}
            </Card>

            <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
                <Col xs={24} sm={8}>
                    <Card hoverable onClick={() => navigate('/products')}>
                        <Space>
                            <InboxOutlined style={{ fontSize: 20, color: '#2563eb' }} />
                            <Text strong>Manage Products</Text>
                        </Space>
                    </Card>
                </Col>
                <Col xs={24} sm={8}>
                    <Card hoverable onClick={() => navigate('/inventory/transfers')}>
                        <Space>
                            <ArrowRightOutlined style={{ fontSize: 20, color: '#7c3aed' }} />
                            <Text strong>Stock Transfers</Text>
                        </Space>
                    </Card>
                </Col>
                <Col xs={24} sm={8}>
                    <Card hoverable onClick={() => navigate('/categories')}>
                        <Space>
                            <TagsOutlined style={{ fontSize: 20, color: '#16a34a' }} />
                            <Text strong>Manage Categories</Text>
                        </Space>
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default InventoryDashboard;
