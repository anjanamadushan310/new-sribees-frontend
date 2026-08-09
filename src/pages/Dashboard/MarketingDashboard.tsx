/**
 * Marketing Dashboard — Marketing Manager view.
 *
 * Branch-scoped on the server via inject_branch_filter — every call below
 * automatically comes back limited to this admin's own branch.
 */
import React from 'react';
import { Card, Row, Col, Statistic, List, Spin, Alert, Space, Typography, Button, Empty, Tag, Image } from 'antd';
import {
    ThunderboltOutlined,
    PictureOutlined,
    GiftOutlined,
    ShoppingOutlined,
    ArrowRightOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { marketingApi } from '../../api/marketing.api';
import { bannersApi } from '../../api/banners.api';
import { couponsApi } from '../../api/coupons.api';
import { useAuthStore } from '../../store/authStore';
import { apiErrorMessage } from '../../utils/analytics';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

const formatLKR = (value: number): string =>
    new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(value ?? 0);

const MarketingDashboard: React.FC = () => {
    const navigate = useNavigate();
    const user = useAuthStore((state) => state.user);

    const quickSaleQuery = useQuery({
        queryKey: ['admin', 'marketing', 'quick-sale', 'dashboard'],
        queryFn: () => marketingApi.previewQuickSale(),
    });
    const bannersQuery = useQuery({
        queryKey: ['admin', 'banners', 'dashboard'],
        queryFn: () => bannersApi.list(),
    });
    const couponsQuery = useQuery({
        queryKey: ['admin', 'coupons', 'count', 'active'],
        queryFn: () => couponsApi.list({ is_active: true, limit: 1 }),
    });
    const productsQuery = useQuery({
        queryKey: ['admin', 'marketing', 'products', 'count'],
        queryFn: () => marketingApi.listProducts({ limit: 1 }),
    });

    const firstError = [quickSaleQuery, bannersQuery, couponsQuery, productsQuery].find((q) => q.isError);
    const activeBanners = (bannersQuery.data?.banners ?? []).filter((b) => b.is_active);

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '24px' }}>
                <Title level={2} style={{ margin: 0 }}>
                    Marketing Dashboard
                </Title>
                <Text type="secondary">
                    {user?.branch_name ? `${user.branch_name} • ` : ''}
                    {dayjs().format('dddd, MMMM D, YYYY')}
                </Text>
            </div>

            {firstError && (
                <Alert
                    message="Failed to load marketing data"
                    description={apiErrorMessage(firstError.error)}
                    type="error"
                    showIcon
                    style={{ marginBottom: '24px' }}
                />
            )}

            <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
                <Col xs={24} sm={12} lg={6}>
                    <Card hoverable onClick={() => navigate('/quick-sale')}>
                        <Statistic
                            title="Quick Sale Items"
                            value={quickSaleQuery.data?.length ?? 0}
                            loading={quickSaleQuery.isLoading}
                            prefix={<ThunderboltOutlined style={{ color: '#d97706' }} />}
                            styles={{ content: { color: '#d97706' } }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card hoverable onClick={() => navigate('/banners')}>
                        <Statistic
                            title="Active Banners"
                            value={activeBanners.length}
                            loading={bannersQuery.isLoading}
                            prefix={<PictureOutlined style={{ color: '#2563eb' }} />}
                            styles={{ content: { color: '#2563eb' } }}
                            suffix={<Text type="secondary" style={{ fontSize: 12 }}>/ {bannersQuery.data?.banners.length ?? 0}</Text>}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card hoverable onClick={() => navigate('/coupons')}>
                        <Statistic
                            title="Active Coupons"
                            value={couponsQuery.data?.total ?? 0}
                            loading={couponsQuery.isLoading}
                            prefix={<GiftOutlined style={{ color: '#16a34a' }} />}
                            styles={{ content: { color: '#16a34a' } }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card hoverable onClick={() => navigate('/products')}>
                        <Statistic
                            title="Products in Branch"
                            value={productsQuery.data?.total ?? 0}
                            loading={productsQuery.isLoading}
                            prefix={<ShoppingOutlined style={{ color: '#7c3aed' }} />}
                            styles={{ content: { color: '#7c3aed' } }}
                        />
                    </Card>
                </Col>
            </Row>

            <Row gutter={[16, 16]}>
                <Col xs={24} lg={14}>
                    <Card
                        title={
                            <Space>
                                <ThunderboltOutlined style={{ color: '#d97706' }} />
                                <span>Quick Sale — Live Now</span>
                            </Space>
                        }
                        extra={
                            <Button type="link" onClick={() => navigate('/quick-sale')}>
                                Manage <ArrowRightOutlined />
                            </Button>
                        }
                    >
                        {quickSaleQuery.isLoading ? (
                            <div style={{ textAlign: 'center', padding: 32 }}>
                                <Spin size="large" />
                            </div>
                        ) : (quickSaleQuery.data?.length ?? 0) === 0 ? (
                            <Empty description="No products on Quick Sale right now." />
                        ) : (
                            <List
                                dataSource={(quickSaleQuery.data ?? []).slice(0, 6)}
                                renderItem={(item) => (
                                    <List.Item key={item.productId}>
                                        <List.Item.Meta
                                            title={item.name}
                                            description={
                                                <Space>
                                                    <Text delete type="secondary">
                                                        {formatLKR(item.globalPrice)}
                                                    </Text>
                                                    <Text strong style={{ color: '#16a34a' }}>
                                                        {formatLKR(item.effectivePrice)}
                                                    </Text>
                                                    {item.effectiveDiscount > 0 && (
                                                        <Tag color="volcano">-{item.effectiveDiscount}%</Tag>
                                                    )}
                                                </Space>
                                            }
                                        />
                                        <Text type="secondary">{item.stockQuantity} in stock</Text>
                                    </List.Item>
                                )}
                            />
                        )}
                    </Card>
                </Col>

                <Col xs={24} lg={10}>
                    <Card
                        title={
                            <Space>
                                <PictureOutlined style={{ color: '#2563eb' }} />
                                <span>Home Banners</span>
                            </Space>
                        }
                        extra={
                            <Button type="link" onClick={() => navigate('/banners')}>
                                Manage <ArrowRightOutlined />
                            </Button>
                        }
                    >
                        {bannersQuery.isLoading ? (
                            <div style={{ textAlign: 'center', padding: 32 }}>
                                <Spin size="large" />
                            </div>
                        ) : (bannersQuery.data?.banners.length ?? 0) === 0 ? (
                            <Empty description="No banners yet." />
                        ) : (
                            <List
                                dataSource={bannersQuery.data?.banners ?? []}
                                renderItem={(banner) => (
                                    <List.Item key={banner.banner_id}>
                                        <List.Item.Meta
                                            avatar={
                                                banner.image_url ? (
                                                    <Image
                                                        src={banner.image_url}
                                                        width={56}
                                                        height={36}
                                                        style={{ objectFit: 'cover', borderRadius: 4 }}
                                                        preview={false}
                                                    />
                                                ) : undefined
                                            }
                                            title={
                                                <Space>
                                                    <Text>{banner.title}</Text>
                                                    <Tag color={banner.is_active ? 'green' : 'default'}>
                                                        {banner.is_active ? 'Active' : 'Inactive'}
                                                    </Tag>
                                                    {banner.is_platform_wide && <Tag color="blue">Network</Tag>}
                                                </Space>
                                            }
                                            description={banner.subtitle}
                                        />
                                    </List.Item>
                                )}
                            />
                        )}
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default MarketingDashboard;
