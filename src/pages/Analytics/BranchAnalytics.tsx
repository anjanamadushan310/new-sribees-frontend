/**
 * Branch Analytics Page
 * Detailed analytics for a specific branch
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
    DatePicker, 
    Tag, 
    Space, 
    Typography,
    Avatar,
    Button,
} from 'antd';
import {
    DollarOutlined,
    ShoppingCartOutlined,
    UserOutlined,
    RiseOutlined,
    FallOutlined,
    TrophyOutlined,
    TeamOutlined,
    ArrowLeftOutlined,
} from '@ant-design/icons';
import { 
    AreaChart, 
    Area, 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    Legend, 
    ResponsiveContainer,
    Line,
} from 'recharts';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { useBranchStore } from '../../store/branchStore';
import { slt } from '../../utils/datetime';

const { Title, Text } = Typography;
const { RangePicker } = DatePicker;

interface StaffPerformance {
    user_id: string;
    full_name: string;
    orders_processed: number;
    revenue_generated: number;
    avg_processing_time: number; // minutes
    rating: number;
}

interface TopProduct {
    product_id: string;
    product_name: string;
    units_sold: number;
    revenue: number;
    growth: number;
}

const BranchAnalytics: React.FC = () => {
    const navigate = useNavigate();
    const { branchId } = useParams<{ branchId: string }>();
    const { getBranchById } = useBranchStore();
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
        slt().subtract(30, 'day'),
        slt(),
    ]);

    const branch = getBranchById(branchId || '');

    // Stats
    const [stats] = useState({
        revenue: 98450.00,
        orders: 1234,
        customers: 456,
        avgOrderValue: 79.78,
        revenueGrowth: 18.5,
        ordersGrowth: 12.3,
    });

    const [staffPerformance, setStaffPerformance] = useState<StaffPerformance[]>([]);
    const [topProducts, setTopProducts] = useState<TopProduct[]>([]);

    useEffect(() => {
        fetchAnalyticsData();
    }, [branchId, dateRange]);

    const fetchAnalyticsData = async () => {
        try {
            setLoading(true);
            setError(null);

            // Mock data
            setStaffPerformance([
                { user_id: '1', full_name: 'Amal Kumara', orders_processed: 234, revenue_generated: 18500, avg_processing_time: 4.5, rating: 4.8 },
                { user_id: '2', full_name: 'Priya Mendis', orders_processed: 198, revenue_generated: 15200, avg_processing_time: 5.2, rating: 4.6 },
                { user_id: '3', full_name: 'Kasun Wijesinghe', orders_processed: 176, revenue_generated: 13800, avg_processing_time: 6.1, rating: 4.4 },
            ]);

            setTopProducts([
                { product_id: '1', product_name: 'Organic Ceylon Tea 500g', units_sold: 156, revenue: 2028, growth: 25.3 },
                { product_id: '2', product_name: 'Fresh Coconut Oil 1L', units_sold: 134, revenue: 1608, growth: 18.7 },
                { product_id: '3', product_name: 'Basmati Rice 5kg', units_sold: 128, revenue: 1664, growth: 15.2 },
                { product_id: '4', product_name: 'Cinnamon Sticks 100g', units_sold: 98, revenue: 882, growth: 12.8 },
                { product_id: '5', product_name: 'Cardamom Pods 50g', units_sold: 87, revenue: 696, growth: 8.5 },
            ]);

        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : 'Failed to load analytics';
            console.error('Analytics error:', err);
            setError(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    // Revenue trend data
    const revenueTrendData = [
        { date: 'Week 1', revenue: 21500, orders: 280 },
        { date: 'Week 2', revenue: 24300, orders: 312 },
        { date: 'Week 3', revenue: 22800, orders: 295 },
        { date: 'Week 4', revenue: 29850, orders: 347 },
    ];

    // Hourly distribution
    const hourlyData = [
        { hour: '8AM', orders: 12 },
        { hour: '9AM', orders: 28 },
        { hour: '10AM', orders: 45 },
        { hour: '11AM', orders: 56 },
        { hour: '12PM', orders: 42 },
        { hour: '1PM', orders: 38 },
        { hour: '2PM', orders: 51 },
        { hour: '3PM', orders: 48 },
        { hour: '4PM', orders: 35 },
        { hour: '5PM', orders: 29 },
        { hour: '6PM', orders: 18 },
    ];

    if (loading) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
                <Spin size="large" tip="Loading branch analytics..." />
            </div>
        );
    }

    return (
        <div style={{ padding: '24px' }}>
            {/* Header */}
            <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <Space>
                        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/analytics')}>
                            Back
                        </Button>
                        <div>
                            <Title level={2} style={{ margin: 0 }}>
                                {branch?.name || 'Branch'} Analytics
                            </Title>
                            <Text type="secondary">{branch?.address || 'Branch performance overview'}</Text>
                        </div>
                    </Space>
                </div>
                <Space>
                    <RangePicker 
                        value={dateRange}
                        onChange={(dates) => dates && setDateRange(dates as [dayjs.Dayjs, dayjs.Dayjs])}
                    />
                </Space>
            </div>

            {error && (
                <Alert message={error} type="warning" showIcon closable style={{ marginBottom: '24px' }} />
            )}

            {/* Stats */}
            <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
                <Col xs={12} sm={6}>
                    <Card>
                        <Statistic
                            title="Revenue"
                            value={stats.revenue}
                            precision={2}
                            prefix={<DollarOutlined style={{ color: '#16a34a' }} />}
                            valueStyle={{ color: '#16a34a' }}
                            suffix={
                                <Tag color="green" style={{ marginLeft: 8 }}>
                                    <RiseOutlined /> {stats.revenueGrowth}%
                                </Tag>
                            }
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card>
                        <Statistic
                            title="Orders"
                            value={stats.orders}
                            prefix={<ShoppingCartOutlined style={{ color: '#2563eb' }} />}
                            suffix={
                                <Tag color="blue" style={{ marginLeft: 8 }}>
                                    <RiseOutlined /> {stats.ordersGrowth}%
                                </Tag>
                            }
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card>
                        <Statistic
                            title="Customers"
                            value={stats.customers}
                            prefix={<UserOutlined style={{ color: '#7c3aed' }} />}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card>
                        <Statistic
                            title="Avg. Order Value"
                            value={stats.avgOrderValue}
                            precision={2}
                            prefix={<DollarOutlined style={{ color: '#ea580c' }} />}
                        />
                    </Card>
                </Col>
            </Row>

            {/* Charts */}
            <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
                <Col xs={24} lg={14}>
                    <Card title="Revenue & Orders Trend">
                        <ResponsiveContainer width="100%" height={300}>
                            <AreaChart data={revenueTrendData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="date" />
                                <YAxis yAxisId="left" orientation="left" />
                                <YAxis yAxisId="right" orientation="right" />
                                <Tooltip />
                                <Legend />
                                <Area 
                                    yAxisId="left"
                                    type="monotone" 
                                    dataKey="revenue" 
                                    name="Revenue ($)"
                                    stroke="#16a34a" 
                                    fill="#16a34a" 
                                    fillOpacity={0.3} 
                                />
                                <Line 
                                    yAxisId="right"
                                    type="monotone" 
                                    dataKey="orders" 
                                    name="Orders"
                                    stroke="#2563eb" 
                                    strokeWidth={2}
                                />
                            </AreaChart>
                        </ResponsiveContainer>
                    </Card>
                </Col>
                <Col xs={24} lg={10}>
                    <Card title="Orders by Hour">
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={hourlyData}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="hour" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="orders" fill="#7c3aed" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </Card>
                </Col>
            </Row>

            {/* Staff & Products */}
            <Row gutter={[16, 16]}>
                <Col xs={24} lg={12}>
                    <Card 
                        title={
                            <Space>
                                <TeamOutlined />
                                Staff Performance
                            </Space>
                        }
                    >
                        <Table
                            dataSource={staffPerformance}
                            columns={[
                                {
                                    title: 'Staff',
                                    dataIndex: 'full_name',
                                    key: 'full_name',
                                    render: (name: string) => (
                                        <Space>
                                            <Avatar style={{ backgroundColor: '#7c3aed' }}>{name.charAt(0)}</Avatar>
                                            <Text strong>{name}</Text>
                                        </Space>
                                    ),
                                },
                                {
                                    title: 'Orders',
                                    dataIndex: 'orders_processed',
                                    key: 'orders_processed',
                                    sorter: (a, b) => a.orders_processed - b.orders_processed,
                                },
                                {
                                    title: 'Revenue',
                                    dataIndex: 'revenue_generated',
                                    key: 'revenue_generated',
                                    render: (v: number) => `$${v.toLocaleString()}`,
                                    sorter: (a, b) => a.revenue_generated - b.revenue_generated,
                                },
                                {
                                    title: 'Rating',
                                    dataIndex: 'rating',
                                    key: 'rating',
                                    render: (v: number) => (
                                        <Tag color={v >= 4.5 ? 'green' : v >= 4 ? 'blue' : 'orange'}>
                                            ⭐ {v.toFixed(1)}
                                        </Tag>
                                    ),
                                },
                            ]}
                            rowKey="user_id"
                            pagination={false}
                            size="small"
                        />
                    </Card>
                </Col>
                <Col xs={24} lg={12}>
                    <Card 
                        title={
                            <Space>
                                <TrophyOutlined style={{ color: '#faad14' }} />
                                Top Selling Products
                            </Space>
                        }
                    >
                        <Table
                            dataSource={topProducts}
                            columns={[
                                {
                                    title: 'Product',
                                    dataIndex: 'product_name',
                                    key: 'product_name',
                                    ellipsis: true,
                                },
                                {
                                    title: 'Units',
                                    dataIndex: 'units_sold',
                                    key: 'units_sold',
                                    sorter: (a, b) => a.units_sold - b.units_sold,
                                },
                                {
                                    title: 'Revenue',
                                    dataIndex: 'revenue',
                                    key: 'revenue',
                                    render: (v: number) => `$${v.toLocaleString()}`,
                                },
                                {
                                    title: 'Growth',
                                    dataIndex: 'growth',
                                    key: 'growth',
                                    render: (v: number) => (
                                        <Tag color={v >= 0 ? 'green' : 'red'} icon={v >= 0 ? <RiseOutlined /> : <FallOutlined />}>
                                            {v >= 0 ? '+' : ''}{v}%
                                        </Tag>
                                    ),
                                },
                            ]}
                            rowKey="product_id"
                            pagination={false}
                            size="small"
                        />
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

export default BranchAnalytics;
