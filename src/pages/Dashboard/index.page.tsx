import React, { useEffect, useState } from 'react';
import { Card, Row, Col, Table, Spin, Alert, Button, Typography } from 'antd';
import {
    DollarOutlined,
    ShoppingCartOutlined,
    UserOutlined,
    ShoppingOutlined,
    LockOutlined,
} from '@ant-design/icons';
import { LineChart, Line, PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { dashboardApi } from '../../api/dashboard.api';
import type { StaffDashboardStats } from '../../api/dashboard.api';
import { KpiCard } from '../../components/analytics';
import { formatLKR, formatNumber } from '../../utils/format';
import { SERIES, PRIMARY } from '../../utils/chartTheme';
import dayjs from 'dayjs';

const { Text } = Typography;

/**
 * The generic dashboard — today only the 'staff' role lands here (every
 * base role has its own dedicated dashboard: DashboardHome, MarketingDashboard,
 * etc.). Every section is server-permission-gated (see StaffDashboardStats'
 * `granted` flags): a staff account only sees the numbers its role was
 * actually delegated, never a zero standing in for "not allowed" and never
 * a fabricated number standing in for "the request failed".
 */
const Dashboard: React.FC = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [stats, setStats] = useState<StaffDashboardStats | null>(null);

    const fetchDashboardData = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await dashboardApi.getDashboardStats();
            setStats(data);
        } catch (err: any) {
            setError(err.response?.data?.detail || err.message || 'Failed to load dashboard data');
            setStats(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDashboardData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const columns = [
        { title: 'Order Number', dataIndex: 'order_number', key: 'order_number' },
        { title: 'Customer', dataIndex: 'customer_name', key: 'customer_name' },
        {
            title: 'Total',
            dataIndex: 'total_amount',
            key: 'total_amount',
            render: (amount: number) => formatLKR(amount),
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status: string) => (
                <span style={{
                    padding: '4px 12px',
                    borderRadius: '4px',
                    backgroundColor: status === 'delivered' ? '#f6ffed' : status === 'pending' ? '#fffbe6' : '#e6f7ff',
                    color: status === 'delivered' ? '#52c41a' : status === 'pending' ? '#faad14' : '#1890ff',
                    textTransform: 'capitalize',
                }}>
                    {status}
                </span>
            ),
        },
        {
            title: 'Date',
            dataIndex: 'created_at',
            key: 'created_at',
            render: (date: string) => dayjs(date).format('MMM DD, YYYY'),
        },
    ];

    if (loading) {
        return (
            <div style={{ textAlign: 'center', padding: '100px 0' }}>
                <Spin size="large" />
            </div>
        );
    }

    if (error) {
        return (
            <div>
                <h1 style={{ marginBottom: 24 }}>Dashboard Overview</h1>
                <Alert
                    message="Could not load dashboard data"
                    description={error}
                    type="error"
                    action={<Button size="small" onClick={fetchDashboardData}>Retry</Button>}
                />
            </div>
        );
    }

    const grantedOrders = stats?.granted.orders ?? false;
    const grantedCustomers = stats?.granted.customers ?? false;
    const grantedProducts = stats?.granted.products ?? false;
    // Money figures require analytics:read — an order-support account holds
    // orders:read to work orders and must never see business revenue (B6).
    const grantedRevenue = stats?.granted.revenue ?? false;

    return (
        <div>
            <h1 style={{ marginBottom: 24 }}>Dashboard Overview</h1>

            {/* Stats Cards */}
            <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} lg={6}>
                    {grantedRevenue ? (
                        <KpiCard
                            title="Total Revenue"
                            value={formatLKR(stats?.totalRevenue)}
                            icon={<DollarOutlined />}
                            accent="#52c41a"
                            delta={stats?.revenueGrowth ?? null}
                            deltaCaption="vs previous 7 days"
                        />
                    ) : (
                        <NoPermissionCard title="Total Revenue" />
                    )}
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    {grantedOrders ? (
                        <KpiCard
                            title="Total Orders"
                            value={formatNumber(stats?.totalOrders)}
                            icon={<ShoppingCartOutlined />}
                            accent="#1890ff"
                            delta={stats?.ordersGrowth ?? null}
                            deltaCaption="vs previous 7 days"
                        />
                    ) : (
                        <NoPermissionCard title="Total Orders" />
                    )}
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    {grantedCustomers ? (
                        <KpiCard
                            title="Total Customers"
                            value={formatNumber(stats?.totalCustomers)}
                            icon={<UserOutlined />}
                            accent="#722ed1"
                        />
                    ) : (
                        <NoPermissionCard title="Total Customers" />
                    )}
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    {grantedOrders ? (
                        <KpiCard
                            title="Pending Orders"
                            value={formatNumber(stats?.pendingOrders)}
                            icon={<ShoppingOutlined />}
                            accent="#faad14"
                        />
                    ) : (
                        <NoPermissionCard title="Pending Orders" />
                    )}
                </Col>
            </Row>

            {/* Charts */}
            <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
                <Col xs={24} lg={12}>
                    <Card title={grantedRevenue ? 'Revenue Trend (Last 7 Days)' : 'Order Volume (Last 7 Days)'}>
                        {grantedRevenue && stats?.revenueTrend ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={stats.revenueTrend}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" tickFormatter={(d) => dayjs(d).format('MMM D')} />
                                    <YAxis />
                                    <Tooltip labelFormatter={(d) => dayjs(d as string).format('MMM D, YYYY')} formatter={(v?: number) => formatLKR(v)} />
                                    <Legend />
                                    <Line type="monotone" dataKey="revenue" name="Revenue" stroke={PRIMARY} strokeWidth={2} />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : grantedOrders && stats?.ordersTrend ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <LineChart data={stats.ordersTrend}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="date" tickFormatter={(d) => dayjs(d).format('MMM D')} />
                                    <YAxis allowDecimals={false} />
                                    <Tooltip labelFormatter={(d) => dayjs(d as string).format('MMM D, YYYY')} formatter={(v?: number) => formatNumber(v)} />
                                    <Legend />
                                    <Line type="monotone" dataKey="orders" name="Orders" stroke={PRIMARY} strokeWidth={2} />
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <NoPermissionBody />
                        )}
                    </Card>
                </Col>
                <Col xs={24} lg={12}>
                    <Card title="Order Status Distribution">
                        {grantedOrders && stats?.orderStatusDistribution ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie
                                        data={stats.orderStatusDistribution.filter((s) => s.orders > 0)}
                                        cx="50%"
                                        cy="50%"
                                        labelLine={false}
                                        label={(entry: any) => `${entry.status}: ${entry.orders}`}
                                        outerRadius={80}
                                        dataKey="orders"
                                        nameKey="status"
                                    >
                                        {stats.orderStatusDistribution.map((_entry, index) => (
                                            <Cell key={`cell-${index}`} fill={SERIES[index % SERIES.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <NoPermissionBody />
                        )}
                    </Card>
                </Col>
            </Row>

            <Row gutter={[16, 16]} style={{ marginTop: 24 }}>
                <Col xs={24} lg={12}>
                    <Card title="Top Selling Products (Last 30 Days)">
                        {grantedRevenue && grantedProducts && stats?.topSellingProducts ? (
                            <ResponsiveContainer width="100%" height={300}>
                                <BarChart data={stats.topSellingProducts}>
                                    <CartesianGrid strokeDasharray="3 3" />
                                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                                    <YAxis />
                                    <Tooltip formatter={(v?: number) => formatNumber(v)} />
                                    <Bar dataKey="unitsSold" name="Units Sold" fill={PRIMARY} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <NoPermissionBody />
                        )}
                    </Card>
                </Col>
                <Col xs={24} lg={12}>
                    <Card title="Recent Orders">
                        {grantedOrders && stats?.recentOrders ? (
                            <Table
                                dataSource={stats.recentOrders}
                                columns={columns}
                                pagination={false}
                                rowKey="order_id"
                                locale={{ emptyText: 'No orders yet.' }}
                            />
                        ) : (
                            <NoPermissionBody />
                        )}
                    </Card>
                </Col>
            </Row>
        </div>
    );
};

/** A KPI slot the caller isn't permitted to see — a placeholder keeps the
 * layout stable and makes clear this is a permissions boundary, not a data
 * problem (a zero would look like a real, wrong answer). */
const NoPermissionCard: React.FC<{ title: string }> = ({ title }) => (
    <Card size="small" style={{ height: '100%' }}>
        <Text type="secondary" style={{ fontSize: 12 }}>{title}</Text>
        <div style={{ marginTop: 8, color: '#bfbfbf', display: 'flex', alignItems: 'center', gap: 8 }}>
            <LockOutlined />
            <span style={{ fontSize: 13 }}>No permission</span>
        </div>
    </Card>
);

const NoPermissionBody: React.FC = () => (
    <div style={{ textAlign: 'center', padding: '80px 0', color: '#bfbfbf' }}>
        <LockOutlined style={{ fontSize: 28 }} />
        <div style={{ marginTop: 8, fontSize: 13 }}>You don't have permission to view this.</div>
    </div>
);

export default Dashboard;
