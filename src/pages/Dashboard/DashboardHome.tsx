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
import { Alert, Button, Card, Col, Row, Space, Typography } from 'antd';
import {
    ArrowRightOutlined,
    DollarOutlined,
    ShoppingCartOutlined,
    TeamOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

import { analyticsApi } from '../../api/analytics.api';
import { usePermissions } from '../../hooks/usePermissions';
import {
    AnalyticsFilters,
    BranchPerformanceTable,
    KpiCard,
    RevenueTrendChart,
} from '../../components/analytics';
import { apiErrorMessage, mergeSeries } from '../../utils/analytics';
import { formatLKR, formatNumber, formatPercent } from '../../utils/format';
import { PRIMARY, SERIES, STATUS } from '../../utils/chartTheme';

const { Title, Text } = Typography;

/** Statuses that mean the order is still waiting on someone. */
const OPEN_STATUSES = new Set(['pending', 'confirmed', 'processing']);

const DashboardHome: React.FC = () => {
    const { isSuperAdmin } = usePermissions();
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

    const firstError = [summaryQuery, salesQuery, branchesQuery, statusQuery].find(
        (q) => q.isError
    );

    return (
        <div>
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                    marginBottom: 20,
                }}
            >
                <div>
                    <Title level={3} style={{ margin: 0 }}>
                        Dashboard
                    </Title>
                    {summary && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {dayjs(summary.range.start_date).format('MMM D, YYYY')} –{' '}
                            {dayjs(summary.range.end_date).format('MMM D, YYYY')}
                            {!summary.scope.is_super_admin && ' · your branch only'}
                        </Text>
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
                    style={{ marginBottom: 16 }}
                    message="Failed to load dashboard data"
                    description={apiErrorMessage(firstError.error)}
                />
            )}

            {/* KPI cards. Each carries its period-over-period delta — a bare
                number tells you nothing about whether to act on it. */}
            <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} xl={6}>
                    <KpiCard
                        title="Revenue"
                        value={formatLKR(current?.revenue)}
                        icon={<DollarOutlined />}
                        accent={SERIES[5]}
                        loading={summaryQuery.isLoading}
                        delta={summary?.deltas.revenue}
                        deltaCaption={`vs previous ${days} days`}
                        footnote={`${formatLKR(summary?.total_revenue)} all time`}
                        hint="Paid orders only, excluding cancelled and refunded ones."
                    />
                </Col>
                <Col xs={24} sm={12} xl={6}>
                    <KpiCard
                        title="Orders"
                        value={formatNumber(current?.orders)}
                        icon={<ShoppingCartOutlined />}
                        accent={PRIMARY}
                        loading={summaryQuery.isLoading}
                        delta={summary?.deltas.orders}
                        deltaCaption={`vs previous ${days} days`}
                        footnote={
                            statusQuery.data
                                ? `${formatNumber(openOrders)} still open · ${formatPercent(
                                      statusQuery.data.fulfilment_rate
                                  )} delivered`
                                : undefined
                        }
                        hint="Every order placed in the period, whatever its status."
                    />
                </Col>
                <Col xs={24} sm={12} xl={6}>
                    <KpiCard
                        title="Active customers"
                        value={formatNumber(current?.customers)}
                        icon={<TeamOutlined />}
                        accent={SERIES[4]}
                        loading={summaryQuery.isLoading}
                        delta={summary?.deltas.customers}
                        deltaCaption={`vs previous ${days} days`}
                        footnote={`${formatNumber(summary?.new_customers)} first-time`}
                        hint="Distinct customers who placed at least one order in the period."
                    />
                </Col>
                <Col xs={24} sm={12} xl={6}>
                    <KpiCard
                        title="Low stock alerts"
                        value={formatNumber(summary?.low_stock_alerts)}
                        icon={<WarningOutlined />}
                        accent={STATUS.warning}
                        loading={summaryQuery.isLoading}
                        footnote="Products at or below their reorder threshold"
                        hint="Counted live from branch inventory, not over the selected period."
                    />
                </Col>
            </Row>

            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
                <Col xs={24} xl={16}>
                    <Card
                        title={`Revenue — last ${days} days`}
                        extra={
                            <Button
                                type="link"
                                size="small"
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
                    <Card title={`Orders — last ${days} days`}>
                        {/* Its own plot, not a second axis on the revenue chart:
                            two scales on one grid imply a correlation the data
                            never claimed. */}
                        <RevenueTrendChart
                            rows={trendRows}
                            loading={salesQuery.isLoading}
                            metric="orders"
                            height={320}
                        />
                    </Card>
                </Col>
            </Row>

            {/* The whole network at a glance — the reason a Super Admin opens
                this page rather than a single branch's report. */}
            <div style={{ marginTop: 16, marginBottom: 8 }}>
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

            {isSuperAdmin && (
                <Space style={{ marginBottom: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        Click any branch row to scope this page to it.
                    </Text>
                </Space>
            )}
        </div>
    );
};

export default DashboardHome;
