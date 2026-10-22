/**
 * Dashboard Home (Module 7.1)
 *
 * The landing page: what happened lately, is it better or worse than before,
 * and is anything on fire. Deliberately narrower than Analytics & Reports —
 * headline KPIs, the revenue trend, the branch league table, and the two
 * operational alerts (low stock, orders not moving). Everything else lives one
 * click away on the report.
 *
 * Branch isolation is enforced server-side via `inject_branch_filter`: Super
 * Admins see the whole network and get a branch filter; every other role
 * receives only their own branch's rows regardless of what this page asks for.
 */
import React, { useMemo, useState } from 'react';
import { Alert, Button, Card, Col, Row, Typography, Skeleton, Tooltip } from 'antd';
import {
    ArrowRightOutlined,
    CalendarOutlined,
    ShoppingCartOutlined,
    TeamOutlined,
    SafetyCertificateOutlined,
    ArrowUpOutlined,
    ArrowDownOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { analyticsApi } from '../../api/analytics.api';
import { customersApi } from '../../api/customers.api';
import { usePermissions } from '../../hooks/usePermissions';
import {
    AnalyticsFilters,
    BranchPerformanceTable,
    RevenueTrendChart,
} from '../../components/analytics';
import { DeltaTag } from '../../components/analytics/KpiCard';
import { apiErrorMessage, mergeSeries } from '../../utils/analytics';
import { formatLKR, formatNumber, formatPercent } from '../../utils/format';
import { slt } from '../../utils/datetime';

const { Title, Text } = Typography;

/**
 * Statuses that mean the order is still waiting on someone — i.e. every
 * status except the three terminal ones (delivered, cancelled, refunded).
 * Must stay in sync with OrderStatus in fastapi_backend/app/models/order.py.
 */
const OPEN_STATUSES = new Set([
    'pending',
    'confirmed',
    'processing',
    'packing',
    'packed',
    'ready_for_pickup',
    'handed_to_courier',
    'shipped',
    'out_for_delivery',
    'return_requested',
    'return_approved',
]);

/** The two terminal-but-not-delivered statuses — money given back or never taken. */
const VOID_STATUSES = new Set(['cancelled', 'refunded']);

const CUSTOMER_AVATAR_COLORS = ['#D81B60', '#7C3AED', '#2563EB', '#059669', '#D97706'];

const getCustomerInitials = (name: string | null | undefined, email: string | null | undefined): string => {
    if (name && name.trim()) {
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.slice(0, 2).toUpperCase();
    }
    if (email && email.trim()) {
        return email.slice(0, 2).toUpperCase();
    }
    return 'CU';
};

const DashboardHome: React.FC = () => {
    const { isSuperAdmin, can } = usePermissions();
    const canManageCustomers = can('customers', 'read') || isSuperAdmin;
    const navigate = useNavigate();
    const [days, setDays] = useState(30);
    const [branchId, setBranchId] = useState<string | undefined>(undefined);

    const query = useMemo(() => ({ days, branchId }), [days, branchId]);
    const key = ['admin', 'analytics', days, branchId ?? 'all'] as const;

    const summaryQuery = useQuery({
        queryKey: [...key, 'summary'],
        queryFn: () => analyticsApi.summary(query),
    });
    const salesQuery = useQuery({
        queryKey: [...key, 'sales'],
        queryFn: () => analyticsApi.sales(query, true),
    });
    const branchesQuery = useQuery({
        queryKey: ['admin', 'analytics', days, 'branches'],
        queryFn: () => analyticsApi.branches(days),
    });
    const statusQuery = useQuery({
        queryKey: [...key, 'order-status'],
        queryFn: () => analyticsApi.orderStatus(query),
    });
    const customersQuery = useQuery({
        queryKey: ['admin', 'customers', 'dashboard-preview'],
        queryFn: () => customersApi.list({ limit: 5 }),
        enabled: canManageCustomers,
    });

    const summary = summaryQuery.data;
    const current = summary?.current;
    const trendRows = useMemo(
        () => mergeSeries(salesQuery.data?.series ?? [], salesQuery.data?.previous_series),
        [salesQuery.data]
    );

    const openOrders = useMemo(
        () =>
            (statusQuery.data?.statuses ?? [])
                .filter((s) => OPEN_STATUSES.has(s.status))
                .reduce((sum, s) => sum + s.orders, 0),
        [statusQuery.data]
    );

    const cancelledOrRefundedOrders = useMemo(
        () =>
            (statusQuery.data?.statuses ?? [])
                .filter((s) => VOID_STATUSES.has(s.status))
                .reduce((sum, s) => sum + s.orders, 0),
        [statusQuery.data]
    );

    const firstError = [summaryQuery, salesQuery, branchesQuery, statusQuery].find(
        (q) => q.isError
    );

    const revenueDelta = summary?.deltas.revenue;
    const ordersDelta = summary?.deltas.orders;
    const customersDelta = summary?.deltas.customers;

    return (
        <div data-testid="dashboard-page" style={{ paddingBottom: 24 }}>
            {/* Header with Title, Live Badge, Subtitle and Filters */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 16,
                    marginBottom: 24,
                }}
            >
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                        <Title level={2} style={{ margin: 0, fontWeight: 800, fontSize: 26, color: '#1A1A22' }}>
                            Executive Dashboard
                        </Title>
                        <span
                            style={{
                                background: '#FCE4EC',
                                color: '#D81B60',
                                fontWeight: 800,
                                fontSize: 11,
                                borderRadius: 12,
                                padding: '3px 10px',
                                letterSpacing: '0.04em',
                            }}
                        >
                            LIVE ANALYTICS
                        </span>
                    </div>
                    {summary && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
                            <CalendarOutlined style={{ color: '#8c8c8c', fontSize: 13 }} />
                            <Text type="secondary" style={{ fontSize: 13, fontWeight: 500 }}>
                                {slt(summary.range.start_date).format('MMM D, YYYY')} –{' '}
                                {slt(summary.range.end_date).format('MMM D, YYYY')}
                            </Text>
                            <span style={{ color: '#d9d9d9' }}>·</span>
                            <span
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: 6,
                                    fontSize: 13,
                                    color: '#10B981',
                                    fontWeight: 600,
                                }}
                            >
                                <span
                                    style={{
                                        width: 7,
                                        height: 7,
                                        borderRadius: '50%',
                                        background: '#10B981',
                                        boxShadow: '0 0 0 2px rgba(16, 185, 129, 0.2)',
                                    }}
                                />
                                {!summary.scope.is_super_admin ? 'your branch only' : 'Synced realtime'}
                            </span>
                        </div>
                    )}
                </div>
                <AnalyticsFilters
                    days={days}
                    onDaysChange={setDays}
                    showBranchFilter={isSuperAdmin}
                    branchId={branchId}
                    onBranchChange={setBranchId}
                />
            </div>

            {firstError && (
                <Alert
                    type="error"
                    showIcon
                    style={{ marginBottom: 20, borderRadius: 12 }}
                    message="Failed to load dashboard data"
                    description={apiErrorMessage(firstError.error)}
                />
            )}

            {/* KPI Cards (4 Cards Grid) */}
            <Row gutter={[16, 16]}>
                {/* 1. Total Revenue Card */}
                <Col xs={24} sm={12} xl={6}>
                    <div
                        data-testid="kpi-revenue"
                        style={{
                            background: '#ffffff',
                            borderRadius: 20,
                            padding: '20px 22px',
                            border: '1px solid #ECEAF0',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                        }}
                    >
                        {summaryQuery.isLoading ? (
                            <Skeleton active paragraph={{ rows: 3 }} />
                        ) : (
                            <>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#D81B60' }} />
                                            <Text style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: '#8c8c8c' }}>
                                                TOTAL REVENUE — LAST {days} DAYS
                                            </Text>
                                        </div>
                                        {revenueDelta !== undefined && revenueDelta !== null && (
                                            <span
                                                style={{
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                    color: revenueDelta >= 0 ? '#15803d' : '#b91c1c',
                                                    background: revenueDelta >= 0 ? '#dcfce7' : '#fee2e2',
                                                    padding: '2px 8px',
                                                    borderRadius: 12,
                                                    display: 'inline-flex',
                                                    alignItems: 'center',
                                                    gap: 3,
                                                }}
                                            >
                                                {revenueDelta >= 0 ? <ArrowUpOutlined /> : <ArrowDownOutlined />}
                                                {Math.abs(revenueDelta).toFixed(1)}% {revenueDelta >= 0 ? 'Growth' : 'Drop'}
                                            </span>
                                        )}
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                                        <span className="ant-statistic-content-value" style={{ fontSize: 28, fontWeight: 800, color: '#1A1A22', letterSpacing: '-0.02em' }}>
                                            {formatLKR(current?.revenue)}
                                        </span>
                                        <span
                                            style={{
                                                fontSize: 11,
                                                fontWeight: 700,
                                                color: '#D81B60',
                                                background: '#FCE4EC',
                                                borderRadius: 8,
                                                padding: '2px 8px',
                                            }}
                                        >
                                            {formatLKR(summary?.total_revenue)} all time
                                        </span>
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        Aggregated across all branches, gross settled e-commerce orders.
                                    </Text>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 18, paddingTop: 10, borderTop: '1px solid #F5F4F7' }}>
                                    <DeltaTag value={revenueDelta ?? null} caption={`vs prev ${days}d`} />
                                    {/* Mini decorative sparkline in Magenta */}
                                    <svg width="60" height="20" viewBox="0 0 60 20">
                                        <path
                                            d="M2 18 Q 20 18, 35 10 T 58 3"
                                            fill="none"
                                            stroke="#D81B60"
                                            strokeWidth="2.5"
                                            strokeLinecap="round"
                                        />
                                    </svg>
                                </div>
                            </>
                        )}
                    </div>
                </Col>

                {/* 2. Orders Card */}
                <Col xs={24} sm={12} xl={6}>
                    <div
                        data-testid="kpi-orders"
                        style={{
                            background: '#ffffff',
                            borderRadius: 20,
                            padding: '20px 22px',
                            border: '1px solid #ECEAF0',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                        }}
                    >
                        {summaryQuery.isLoading ? (
                            <Skeleton active paragraph={{ rows: 3 }} />
                        ) : (
                            <>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <Text style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: '#8c8c8c' }}>
                                            ORDERS
                                        </Text>
                                        <div
                                            style={{
                                                width: 32,
                                                height: 32,
                                                borderRadius: '50%',
                                                background: '#EFF6FF',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}
                                        >
                                            <ShoppingCartOutlined style={{ color: '#2563EB', fontSize: 16 }} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                                        <span className="ant-statistic-content-value" style={{ fontSize: 28, fontWeight: 800, color: '#1A1A22' }}>
                                            {formatNumber(current?.orders)}
                                        </span>
                                        <span
                                            style={{
                                                fontSize: 11,
                                                fontWeight: 700,
                                                color: '#2563EB',
                                                background: '#EFF6FF',
                                                borderRadius: 8,
                                                padding: '2px 8px',
                                            }}
                                        >
                                            {formatPercent(statusQuery.data?.fulfilment_rate ?? 0)} delivered
                                        </span>
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        {formatNumber(openOrders)} open · {formatNumber(cancelledOrRefundedOrders)} cancelled
                                    </Text>
                                </div>
                                <div style={{ marginTop: 18 }}>
                                    {/* Segmented bar for order delivery */}
                                    <div style={{ height: 6, background: '#F0EEF2', borderRadius: 3, display: 'flex', overflow: 'hidden', marginBottom: 8 }}>
                                        <div style={{ width: `${Math.min(100, Math.max(0, statusQuery.data?.fulfilment_rate ?? 60))}%`, background: '#10B981' }} />
                                        <div style={{ width: '25%', background: '#2563EB' }} />
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6, borderTop: '1px solid #F5F4F7' }}>
                                        <DeltaTag value={ordersDelta ?? null} caption={`vs prev ${days}d`} />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </Col>

                {/* 3. Active Customers Card */}
                <Col xs={24} sm={12} xl={6}>
                    <div
                        data-testid="kpi-active-customers"
                        style={{
                            background: '#ffffff',
                            borderRadius: 20,
                            padding: '20px 22px',
                            border: '1px solid #ECEAF0',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                        }}
                    >
                        {summaryQuery.isLoading ? (
                            <Skeleton active paragraph={{ rows: 3 }} />
                        ) : (
                            <>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <Text style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: '#8c8c8c' }}>
                                            ACTIVE CUSTOMERS
                                        </Text>
                                        <div
                                            style={{
                                                width: 32,
                                                height: 32,
                                                borderRadius: '50%',
                                                background: '#FCE4EC',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}
                                        >
                                            <TeamOutlined style={{ color: '#D81B60', fontSize: 16 }} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                                        <span className="ant-statistic-content-value" style={{ fontSize: 28, fontWeight: 800, color: '#1A1A22' }}>
                                            {formatNumber(current?.customers)}
                                        </span>
                                        <span
                                            style={{
                                                fontSize: 11,
                                                fontWeight: 700,
                                                color: '#D81B60',
                                                background: '#FCE4EC',
                                                borderRadius: 8,
                                                padding: '2px 8px',
                                            }}
                                        >
                                            {formatNumber(summary?.new_customers)} first-time
                                        </span>
                                    </div>
                                    {/* Overlapping actual customer avatar initials */}
                                    {customersQuery.data?.customers && customersQuery.data.customers.length > 0 && (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 8 }}>
                                            {customersQuery.data.customers.slice(0, 4).map((cust, idx) => {
                                                const initials = getCustomerInitials(cust.full_name, cust.email);
                                                const displayName = cust.full_name || cust.email || cust.phone || `Customer ${idx + 1}`;
                                                return (
                                                    <Tooltip key={cust.user_id || idx} title={`${displayName} — Click to view profile`}>
                                                        <div
                                                            onClick={() => {
                                                                if (cust.user_id) {
                                                                    navigate(`/customers?customerId=${encodeURIComponent(cust.user_id)}`);
                                                                }
                                                            }}
                                                            style={{
                                                                width: 24,
                                                                height: 24,
                                                                borderRadius: '50%',
                                                                background: CUSTOMER_AVATAR_COLORS[idx % CUSTOMER_AVATAR_COLORS.length],
                                                                color: '#fff',
                                                                fontSize: 10,
                                                                fontWeight: 700,
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                justifyContent: 'center',
                                                                border: '2px solid #fff',
                                                                marginLeft: idx > 0 ? -6 : 0,
                                                                boxShadow: '0 2px 4px rgba(0,0,0,0.12)',
                                                                cursor: 'pointer',
                                                                transition: 'transform 0.15s ease',
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                e.currentTarget.style.transform = 'scale(1.15)';
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                e.currentTarget.style.transform = 'scale(1)';
                                                            }}
                                                        >
                                                            {initials}
                                                        </div>
                                                    </Tooltip>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18, paddingTop: 10, borderTop: '1px solid #F5F4F7' }}>
                                    <DeltaTag value={customersDelta ?? null} caption={`vs prev ${days}d`} />
                                </div>
                            </>
                        )}
                    </div>
                </Col>

                {/* 4. Low Stock Alerts Card */}
                <Col xs={24} sm={12} xl={6}>
                    <div
                        data-testid="kpi-low-stock-alerts"
                        style={{
                            background: '#ffffff',
                            borderRadius: 20,
                            padding: '20px 22px',
                            border: '1px solid #ECEAF0',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
                            height: '100%',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                        }}
                    >
                        {summaryQuery.isLoading ? (
                            <Skeleton active paragraph={{ rows: 3 }} />
                        ) : (
                            <>
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                        <Text style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.05em', color: '#8c8c8c' }}>
                                            LOW STOCK ALERTS
                                        </Text>
                                        <div
                                            style={{
                                                width: 32,
                                                height: 32,
                                                borderRadius: '50%',
                                                background: '#ECFDF5',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                            }}
                                        >
                                            <SafetyCertificateOutlined style={{ color: '#10B981', fontSize: 16 }} />
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                                        <span className="ant-statistic-content-value" style={{ fontSize: 28, fontWeight: 800, color: '#1A1A22' }}>
                                            {formatNumber(summary?.low_stock_alerts ?? 0)}
                                        </span>
                                        <span
                                            style={{
                                                fontSize: 11,
                                                fontWeight: 700,
                                                color: (summary?.low_stock_alerts ?? 0) === 0 ? '#10B981' : '#D97706',
                                                background: (summary?.low_stock_alerts ?? 0) === 0 ? '#ECFDF5' : '#FEF3C7',
                                                borderRadius: 8,
                                                padding: '2px 8px',
                                            }}
                                        >
                                            {(summary?.low_stock_alerts ?? 0) === 0 ? 'All Healthy' : 'Action needed'}
                                        </span>
                                    </div>
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                        Products at or below their reorder threshold
                                    </Text>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18, paddingTop: 10, borderTop: '1px solid #F5F4F7' }}>
                                    <DeltaTag value={null} caption="No prior period" />
                                    <span style={{ fontSize: 11, fontWeight: 600, color: (summary?.low_stock_alerts ?? 0) === 0 ? '#10B981' : '#D97706' }}>
                                        {(summary?.low_stock_alerts ?? 0) === 0 ? 'Zero inventory deficit' : `${summary?.low_stock_alerts} item(s) deficit`}
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                </Col>
            </Row>

            {/* Charts Row (Two Cards Side by Side) */}
            <Row gutter={[16, 16]} style={{ marginTop: 20 }}>
                <Col xs={24} xl={16}>
                    <Card
                        style={{
                            borderRadius: 20,
                            border: '1px solid #ECEAF0',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
                        }}
                        title={
                            <div>
                                <span style={{ fontSize: 16, fontWeight: 800, color: '#1A1A22' }}>
                                    Revenue — last {days} days
                                </span>
                                <div style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 400, marginTop: 2 }}>
                                    Daily performance compared to preceding cycle
                                </div>
                            </div>
                        }
                        extra={
                            <Button
                                type="link"
                                style={{ color: '#D81B60', fontWeight: 700, padding: 0 }}
                                onClick={() => navigate('/analytics')}
                            >
                                Full report <ArrowRightOutlined />
                            </Button>
                        }
                    >
                        <RevenueTrendChart
                            rows={trendRows}
                            loading={salesQuery.isLoading}
                            metric="revenue"
                            height={320}
                        />
                    </Card>
                </Col>
                <Col xs={24} xl={8}>
                    <Card
                        style={{
                            borderRadius: 20,
                            border: '1px solid #ECEAF0',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
                        }}
                        title={
                            <div>
                                <span style={{ fontSize: 16, fontWeight: 800, color: '#1A1A22' }}>
                                    Orders — last {days} days
                                </span>
                                <div style={{ fontSize: 12, color: '#8c8c8c', fontWeight: 400, marginTop: 2 }}>
                                    Total conversion throughput
                                </div>
                            </div>
                        }
                        extra={
                            <span
                                style={{
                                    fontSize: 11,
                                    fontWeight: 700,
                                    color: '#D81B60',
                                    background: '#FCE4EC',
                                    borderRadius: 12,
                                    padding: '3px 10px',
                                }}
                            >
                                {formatNumber(current?.orders ?? 0)} Total
                            </span>
                        }
                    >
                        <RevenueTrendChart
                            rows={trendRows}
                            loading={salesQuery.isLoading}
                            metric="orders"
                            height={320}
                        />
                    </Card>
                </Col>
            </Row>

            {/* Branch Performance Intelligence Hub */}
            <div style={{ marginTop: 20 }}>
                <BranchPerformanceTable
                    data={branchesQuery.data?.branches ?? []}
                    loading={branchesQuery.isLoading}
                    days={days}
                    highlightBranchId={branchId}
                    onSelectBranch={
                        isSuperAdmin
                            ? (id) => setBranchId(id === branchId ? undefined : id)
                            : undefined
                    }
                    unassigned={branchesQuery.data?.unassigned ?? null}
                />
            </div>

            {/* Modern Executive Footer */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: 32,
                    paddingTop: 16,
                    borderTop: '1px solid #ECEAF0',
                    color: '#8c8c8c',
                    fontSize: 12,
                    flexWrap: 'wrap',
                    gap: 12,
                }}
            >
                <div>© 2026 SRIBEEES Online (Pvt) Ltd. All executive rights reserved.</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#10B981' }} />
                    <span style={{ fontWeight: 600, color: '#10B981' }}>
                        All {branchesQuery.data?.branches.length ?? 13} Branches Operational
                    </span>
                    <span style={{ color: '#d9d9d9', margin: '0 4px' }}>|</span>
                    <span>Build 2.4.1-prod</span>
                </div>
            </div>
        </div>
    );
};

export default DashboardHome;
