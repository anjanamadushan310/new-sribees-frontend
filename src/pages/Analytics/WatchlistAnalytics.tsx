/**
 * Watchlist Analytics Page
 * Shows tracking data for the 'Watchlist' EPIC - most watched products, 
 * conversion rates, trends, and user engagement metrics
 */

import React, { useEffect, useState } from 'react';
import { 
    Card, 
    Row, 
    Col, 
    Statistic, 
    Table, 
    Spin, 
    Alert, 
    Select, 
    DatePicker, 
    Tag, 
    Progress, 
    Space, 
    Typography,
    Avatar,
    Badge,
} from 'antd';
import {
    HeartFilled,
    ShoppingCartOutlined,
    RiseOutlined,
    FallOutlined,
    TrophyOutlined,
    FireOutlined,
    UserOutlined,
} from '@ant-design/icons';
import { 
    AreaChart, 
    Area, 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip as RechartsTooltip, 
    Legend, 
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Line,
} from 'recharts';
import dayjs from 'dayjs';
import type { TopWatchedProduct, WatchlistTrend } from '../../api/dashboard.api';
import { useAuthStore } from '../../store/authStore';
import { useBranchStore } from '../../store/branchStore';
import { AdminRole } from '../../types/admin.types';
import { slt } from '../../utils/datetime';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface WatchlistStats {
    totalWatches: number;
    activeWatchers: number;
    averageConversionRate: number;
    watchesThisWeek: number;
    watchesGrowth: number;
    topConvertingCategory: string;
    mostWatchedProduct: string;
}

const WatchlistAnalytics: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedBranch, setSelectedBranch] = useState<string>('all');
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
        slt().subtract(30, 'day'),
        slt(),
    ]);

    // Data states
    const [stats, setStats] = useState<WatchlistStats>({
        totalWatches: 0,
        activeWatchers: 0,
        averageConversionRate: 0,
        watchesThisWeek: 0,
        watchesGrowth: 0,
        topConvertingCategory: '',
        mostWatchedProduct: '',
    });
    const [topProducts, setTopProducts] = useState<TopWatchedProduct[]>([]);
    const [trends, setTrends] = useState<WatchlistTrend[]>([]);

    const user = useAuthStore((state) => state.user);
    const { branches } = useBranchStore();
    const isSuperAdmin = user?.role === AdminRole.SUPER_ADMIN;

    useEffect(() => {
        fetchWatchlistData();
    }, [selectedBranch, dateRange]);

    const fetchWatchlistData = async () => {
        try {
            setLoading(true);
            setError(null);

            // Mock data - in production, fetch from API
            setStats({
                totalWatches: 2456,
                activeWatchers: 892,
                averageConversionRate: 28.5,
                watchesThisWeek: 345,
                watchesGrowth: 15.2,
                topConvertingCategory: 'Tea & Coffee',
                mostWatchedProduct: 'Organic Ceylon Tea 500g',
            });

            // Mock top products
            setTopProducts([
                { 
                    product_id: '1', 
                    product_name: 'Organic Ceylon Tea 500g', 
                    variant_name: 'Premium Blend',
                    thumbnail_url: 'https://picsum.photos/seed/tea/100',
                    watch_count: 156, 
                    conversion_count: 45, 
                    conversion_rate: 28.8 
                },
                { 
                    product_id: '2', 
                    product_name: 'Fresh Coconut Oil 1L', 
                    variant_name: 'Extra Virgin',
                    thumbnail_url: 'https://picsum.photos/seed/oil/100',
                    watch_count: 134, 
                    conversion_count: 52, 
                    conversion_rate: 38.8 
                },
                { 
                    product_id: '3', 
                    product_name: 'Basmati Rice 5kg', 
                    variant_name: 'Long Grain',
                    thumbnail_url: 'https://picsum.photos/seed/rice/100',
                    watch_count: 128, 
                    conversion_count: 38, 
                    conversion_rate: 29.7 
                },
                { 
                    product_id: '4', 
                    product_name: 'Cinnamon Sticks Premium', 
                    variant_name: '100g Pack',
                    thumbnail_url: 'https://picsum.photos/seed/cinnamon/100',
                    watch_count: 112, 
                    conversion_count: 29, 
                    conversion_rate: 25.9 
                },
                { 
                    product_id: '5', 
                    product_name: 'Mango Chutney 350g', 
                    variant_name: 'Spicy',
                    thumbnail_url: 'https://picsum.photos/seed/chutney/100',
                    watch_count: 98, 
                    conversion_count: 31, 
                    conversion_rate: 31.6 
                },
                { 
                    product_id: '6', 
                    product_name: 'Cardamom Pods', 
                    variant_name: '50g Premium',
                    thumbnail_url: 'https://picsum.photos/seed/cardamom/100',
                    watch_count: 87, 
                    conversion_count: 22, 
                    conversion_rate: 25.3 
                },
                { 
                    product_id: '7', 
                    product_name: 'Curry Powder', 
                    variant_name: 'Hot Blend 200g',
                    thumbnail_url: 'https://picsum.photos/seed/curry/100',
                    watch_count: 76, 
                    conversion_count: 28, 
                    conversion_rate: 36.8 
                },
                { 
                    product_id: '8', 
                    product_name: 'Jackfruit Chips', 
                    variant_name: 'Crispy 150g',
                    thumbnail_url: 'https://picsum.photos/seed/jackfruit/100',
                    watch_count: 65, 
                    conversion_count: 18, 
                    conversion_rate: 27.7 
                },
            ]);

            // Mock trend data - last 30 days
            const trendData: WatchlistTrend[] = [];
            for (let i = 29; i >= 0; i--) {
                const date = slt().subtract(i, 'day').format('YYYY-MM-DD');
                const newWatches = Math.floor(Math.random() * 30) + 10;
                const removals = Math.floor(Math.random() * 10) + 2;
                trendData.push({
                    date,
                    new_watches: newWatches,
                    removals: removals,
                    net_change: newWatches - removals,
                });
            }
            setTrends(trendData);

        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to load watchlist analytics';
            console.error('Watchlist analytics error:', err);
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    // Category distribution data
    const categoryDistribution = [
        { name: 'Tea & Coffee', value: 35, color: '#2563eb' },
        { name: 'Spices', value: 25, color: '#16a34a' },
        { name: 'Rice & Grains', value: 20, color: '#7c3aed' },
        { name: 'Oils', value: 12, color: '#ea580c' },
        { name: 'Snacks', value: 8, color: '#0891b2' },
    ];

    // Conversion funnel data
    const conversionFunnel = [
        { stage: 'Views', count: 15420 },
        { stage: 'Added to Watchlist', count: 2456 },
        { stage: 'Returned to View', count: 1823 },
        { stage: 'Added to Cart', count: 1245 },
        { stage: 'Purchased', count: 698 },
    ];

    // Table columns for top products
    const topProductColumns = [
        {
            title: 'Rank',
            key: 'rank',
            width: 60,
            render: (_: unknown, __: unknown, index: number) => (
                <Badge 
                    count={index + 1} 
                    style={{ 
                        backgroundColor: index === 0 ? '#faad14' : index === 1 ? '#a0a0a0' : index === 2 ? '#cd7f32' : '#8c8c8c',
                    }} 
                />
            ),
        },
        {
            title: 'Product',
            key: 'product',
            render: (record: TopWatchedProduct) => (
                <Space>
                    <Avatar 
                        shape="square" 
                        size={48} 
                        src={record.thumbnail_url}
                        icon={<ShoppingCartOutlined />}
                    />
                    <div>
                        <Text strong>{record.product_name}</Text>
                        {record.variant_name && (
                            <Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                                {record.variant_name}
                            </Text>
                        )}
                    </div>
                </Space>
            ),
        },
        {
            title: 'Watches',
            dataIndex: 'watch_count',
            key: 'watch_count',
            sorter: (a: TopWatchedProduct, b: TopWatchedProduct) => a.watch_count - b.watch_count,
            render: (count: number) => (
                <Space>
                    <HeartFilled style={{ color: '#ff4d4f' }} />
                    <Text strong>{count}</Text>
                </Space>
            ),
        },
        {
            title: 'Conversions',
            dataIndex: 'conversion_count',
            key: 'conversion_count',
            render: (count: number) => (
                <Tag color="green" icon={<ShoppingCartOutlined />}>
                    {count} sold
                </Tag>
            ),
        },
        {
            title: 'Conversion Rate',
            dataIndex: 'conversion_rate',
            key: 'conversion_rate',
            sorter: (a: TopWatchedProduct, b: TopWatchedProduct) => a.conversion_rate - b.conversion_rate,
            render: (rate: number) => (
                <Progress 
                    percent={rate} 
                    size="small" 
                    status={rate >= 35 ? 'success' : rate >= 25 ? 'normal' : 'exception'}
                    format={(p) => `${p?.toFixed(1)}%`}
                    style={{ width: 120 }}
                />
            ),
        },
    ];

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
                <Spin size="large" tip="Loading watchlist analytics..." />
            </div>
        );
    }

    return (
        <div style={{ padding: '24px' }}>
            {/* Header */}
            <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <Title level={2} style={{ margin: 0 }}>
                        <Space>
                            <HeartFilled style={{ color: '#ff4d4f' }} />
                            Watchlist Analytics
                        </Space>
                    </Title>
                    <Text type="secondary">Track user engagement with product wishlists</Text>
                </div>
                <Space wrap>
                    {isSuperAdmin && (
                        <Select
                            value={selectedBranch}
                            onChange={setSelectedBranch}
                            style={{ width: 180 }}
                        >
                            <Select.Option value="all">All Branches</Select.Option>
                            {branches.map((branch) => (
                                <Select.Option key={branch.branch_id} value={branch.branch_id}>
                                    {branch.name}
                                </Select.Option>
                            ))}
                        </Select>
                    )}
                    <RangePicker 
                        value={dateRange}
                        onChange={(dates) => dates && setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
                    />
                </Space>
            </div>

            {error && (
                <Alert message={error} type="warning" showIcon closable style={{ marginBottom: '24px' }} />
            )}

            {/* Stats Cards */}
            <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic
                            title="Total Watches"
                            value={stats.totalWatches}
                            prefix={<HeartFilled style={{ color: '#ff4d4f' }} />}
                            valueStyle={{ color: '#ff4d4f' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic
                            title="Active Watchers"
                            value={stats.activeWatchers}
                            prefix={<UserOutlined style={{ color: '#7c3aed' }} />}
                            valueStyle={{ color: '#7c3aed' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic
                            title="Avg. Conversion Rate"
                            value={stats.averageConversionRate}
                            precision={1}
                            suffix="%"
                            prefix={<ShoppingCartOutlined style={{ color: '#16a34a' }} />}
                            valueStyle={{ color: '#16a34a' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic
                            title="This Week"
                            value={stats.watchesThisWeek}
                            prefix={<FireOutlined style={{ color: '#ea580c' }} />}
                            suffix={
                                <Tag color={stats.watchesGrowth >= 0 ? 'green' : 'red'} style={{ marginLeft: 8 }}>
                                    {stats.watchesGrowth >= 0 ? <RiseOutlined /> : <FallOutlined />}
                                    {Math.abs(stats.watchesGrowth)}%
                                </Tag>
                            }
                        />
                    </Card>
                </Col>
            </Row>

            {/* Charts Row */}
            <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
                {/* Trend Chart */}
                <Col xs={24} lg={16}>
                    <Card title="Watchlist Trends (Last 30 Days)">
                        <ResponsiveContainer width="100%" height={300}>
                            <AreaChart data={trends}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis 
                                    dataKey="date" 
                                    tickFormatter={(value) => slt(value).format('MMM D')}
                                />
                                <YAxis />
                                <RechartsTooltip 
                                    labelFormatter={(value) => slt(value).format('MMM D, YYYY')}
                                />
                                <Legend />
                                <Area 
                                    type="monotone" 
                                    dataKey="new_watches" 
                                    name="New Watches"
                                    stroke="#ff4d4f" 
                                    fill="#ff4d4f" 
                                    fillOpacity={0.3} 
                                />
                                <Area 
                                    type="monotone" 
                                    dataKey="removals" 
                                    name="Removals"
                                    stroke="#8c8c8c" 
                                    fill="#8c8c8c" 
                                    fillOpacity={0.3} 
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="net_change" 
                                    name="Net Change"
                                    stroke="#16a34a" 
                                    strokeWidth={2}
                                    dot={false}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </Card>
                </Col>

                {/* Category Distribution */}
                <Col xs={24} lg={8}>
                    <Card title="Watches by Category">
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={categoryDistribution}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={2}
                                    dataKey="value"
                                    label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
                                    labelLine={false}
                                >
                                    {categoryDistribution.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <RechartsTooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </Card>
                </Col>
            </Row>

            {/* Conversion Funnel */}
            <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
                <Col span={24}>
                    <Card title="Conversion Funnel">
                        <ResponsiveContainer width="100%" height={200}>
                            <BarChart data={conversionFunnel} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" />
                                <YAxis dataKey="stage" type="category" width={150} />
                                <RechartsTooltip />
                                <Bar 
                                    dataKey="count" 
                                    fill="#7c3aed" 
                                    radius={[0, 4, 4, 0]}
                                    label={{ position: 'right', formatter: (v) => typeof v === 'number' ? v.toLocaleString() : String(v) }}
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </Card>
                </Col>
            </Row>

            {/* Top Watched Products */}
            <Card 
                title={
                    <Space>
                        <TrophyOutlined style={{ color: '#faad14' }} />
                        Top Watched Products
                    </Space>
                }
            >
                <Table
                    dataSource={topProducts}
                    columns={topProductColumns}
                    rowKey="product_id"
                    pagination={{ pageSize: 10 }}
                />
            </Card>
        </div>
    );
};

export default WatchlistAnalytics;
