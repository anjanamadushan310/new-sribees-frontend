/**
 * Marketing Dashboard — Marketing Manager view.
 *
 * Branch-scoped on the server: GET /admin/marketing/dashboard resolves the
 * branch from the authenticated admin and ignores any branch_id a scoped
 * caller sends, so everything below is this manager's own branch.
 *
 * Rendering rule that runs through this whole file: a `null` from the API is
 * NOT zero. It means the figure cannot honestly be computed yet — the branch
 * has not set its delivery rounds, a banner has too few impressions for a CTR
 * to mean anything, the branch had no completed orders in the window. Those
 * render as a setup prompt or "collecting data", never as "0%", because a
 * manager who reads 0% acts on it.
 */
import React from 'react';
import {
    Alert,
    Button,
    Card,
    Col,
    Empty,
    Image,
    List,
    Progress,
    Row,
    Space,
    Spin,
    Statistic,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import {
    ArrowRightOutlined,
    CarOutlined,
    ClockCircleOutlined,
    GiftOutlined,
    PictureOutlined,
    TeamOutlined,
    ThunderboltOutlined,
    WarningOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { marketingApi } from '../../api/marketing.api';
import type { DashboardNextDeliveryRun } from '../../api/marketing.api';
import { useAuthStore } from '../../store/authStore';
import { apiErrorMessage } from '../../utils/analytics';
import { slt } from '../../utils/datetime';

const { Title, Text } = Typography;

const formatLKR = (value: number): string =>
    new Intl.NumberFormat('en-LK', { style: 'currency', currency: 'LKR' }).format(value ?? 0);

/** Placeholder for a figure the backend could not compute. Never "0". */
const NOT_AVAILABLE = '—';

const COLORS = {
    quickSale: '#d97706',
    banners: '#2563eb',
    coupons: '#16a34a',
    delivery: '#7c3aed',
    retention: '#0891b2',
    muted: '#94a3b8',
    warn: '#d97706',
    danger: '#dc2626',
};

/**
 * "in 45 mins" / "in 2h 15m". The countdown is to the ORDERING CUT-OFF, not to
 * dispatch: a run whose cut-off has passed is already locked, so counting down
 * to the van leaving would show a number nobody can act on.
 */
function formatCutoff(run: DashboardNextDeliveryRun): string {
    const mins = run.minutesToCutoff;
    if (mins < 60) return `Cut-off in ${mins} min${mins === 1 ? '' : 's'}`;
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `Cut-off in ${h}h${m ? ` ${m}m` : ''}`;
}

/** A KPI whose value could not be computed, with the reason in its place. */
const UnavailableKpi: React.FC<{ hint: string }> = ({ hint }) => (
    <div style={{ fontSize: 24, fontWeight: 600, color: COLORS.muted, lineHeight: '32px' }}>
        {NOT_AVAILABLE}
        <div style={{ fontSize: 12, fontWeight: 400, marginTop: 4 }}>{hint}</div>
    </div>
);

const MarketingDashboard: React.FC = () => {
    const navigate = useNavigate();
    const user = useAuthStore((state) => state.user);

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['admin', 'marketing', 'dashboard'],
        queryFn: () => marketingApi.getDashboard(),
        // The delivery cut-off is a live countdown; refresh it on the minute so
        // a manager who leaves the tab open is not acting on a stale number.
        refetchInterval: 60_000,
    });

    const quickSale = data?.quickSale;
    const banners = data?.banners;
    const coupons = data?.coupons;
    const nextRun = data?.nextDeliveryRun ?? null;
    const retention = data?.returningCustomers;

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '24px' }}>
                <Title level={2} style={{ margin: 0 }}>
                    Marketing Dashboard
                </Title>
                <Text type="secondary">
                    {data?.branch.branchName ?? user?.branch_name ?? ''}
                    {data?.branch.branchName || user?.branch_name ? ' • ' : ''}
                    {slt().format('dddd, MMMM D, YYYY')}
                </Text>
            </div>

            {isError && (
                <Alert
                    message="Failed to load the marketing dashboard"
                    description={apiErrorMessage(error)}
                    type="error"
                    showIcon
                    style={{ marginBottom: '24px' }}
                />
            )}

            {/* ============================= KPI row =============================
                Five equal cards. Ant's 24-column grid cannot express fifths, so
                this row is a CSS grid that reflows to 3 / 2 / 1 across on its
                own as the viewport narrows. */}
            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(215px, 1fr))',
                    gap: 16,
                    marginBottom: 24,
                }}
            >
                {/* 1. Quick Sale deals */}
                <Card hoverable onClick={() => navigate('/quick-sale')} styles={{ body: { padding: 18 } }}>
                    <Statistic
                        title="Quick Sale Deals"
                        value={quickSale?.liveCount ?? 0}
                        loading={isLoading}
                        suffix={<Text type="secondary" style={{ fontSize: 13 }}>Live</Text>}
                        prefix={<ThunderboltOutlined style={{ color: COLORS.quickSale }} />}
                        styles={{ content: { color: COLORS.quickSale } }}
                    />
                    <Text style={{ fontSize: 12, color: quickSale?.perishableCount ? COLORS.warn : COLORS.muted }}>
                        {quickSale?.perishableCount
                            ? `${quickSale.perishableCount} perishable — clear these first`
                            : 'No perishable stock on offer'}
                    </Text>
                </Card>

                {/* 2. Active banners */}
                <Card hoverable onClick={() => navigate('/banners')} styles={{ body: { padding: 18 } }}>
                    <Statistic
                        title="Active Banners"
                        value={banners?.activeCount ?? 0}
                        loading={isLoading}
                        suffix={
                            <Text type="secondary" style={{ fontSize: 13 }}>
                                / {banners?.totalCount ?? 0}
                            </Text>
                        }
                        prefix={<PictureOutlined style={{ color: COLORS.banners }} />}
                        styles={{ content: { color: COLORS.banners } }}
                    />
                    <Text style={{ fontSize: 12, color: COLORS.muted }}>
                        {banners?.averageCtr != null
                            ? `Avg. CTR ${banners.averageCtr}% (${banners.windowDays}d)`
                            : 'CTR: collecting data'}
                    </Text>
                </Card>

                {/* 3. Active coupons */}
                <Card hoverable onClick={() => navigate('/coupons')} styles={{ body: { padding: 18 } }}>
                    <Statistic
                        title="Active Coupons"
                        value={coupons?.activeCount ?? 0}
                        loading={isLoading}
                        prefix={<GiftOutlined style={{ color: COLORS.coupons }} />}
                        styles={{ content: { color: COLORS.coupons } }}
                    />
                    {coupons?.nearLimitCount ? (
                        <Tooltip
                            title={coupons.nearLimit
                                .map((c) => `${c.code}: ${c.usedCount}/${c.usageLimit} redeemed`)
                                .join(' · ')}
                        >
                            <Text style={{ fontSize: 12, color: COLORS.warn }}>
                                <WarningOutlined /> {coupons.nearLimitCount} near redemption limit
                            </Text>
                        </Tooltip>
                    ) : (
                        <Text style={{ fontSize: 12, color: COLORS.muted }}>
                            None near their redemption limit
                        </Text>
                    )}
                </Card>

                {/* 4. Next delivery run */}
                <Card styles={{ body: { padding: 18 } }}>
                    <Text type="secondary" style={{ fontSize: 14 }}>
                        <CarOutlined style={{ color: COLORS.delivery, marginRight: 6 }} />
                        Next Delivery Run
                    </Text>
                    {isLoading ? (
                        <div style={{ padding: '8px 0' }}><Spin size="small" /></div>
                    ) : nextRun ? (
                        <>
                            <div style={{ fontSize: 24, fontWeight: 600, color: COLORS.delivery, lineHeight: '32px' }}>
                                {slt(nextRun.dispatchAt).format('hh:mm A')}
                            </div>
                            <Text
                                style={{
                                    fontSize: 12,
                                    color: nextRun.minutesToCutoff <= 60 ? COLORS.danger : COLORS.muted,
                                }}
                            >
                                <ClockCircleOutlined /> {formatCutoff(nextRun)}
                                {nextRun.isTomorrow ? ' (tomorrow)' : ''} · {nextRun.label}
                            </Text>
                        </>
                    ) : (
                        // Marketing cannot set the timetable — that is the Branch
                        // Manager's route (admin_branches is role-gated). Point at
                        // the person who can rather than at a button that 403s.
                        <UnavailableKpi hint="Ask your Branch Manager to set the delivery runs" />
                    )}
                </Card>

                {/* 5. Returning customers */}
                <Card styles={{ body: { padding: 18 } }}>
                    <Text type="secondary" style={{ fontSize: 14 }}>
                        <TeamOutlined style={{ color: COLORS.retention, marginRight: 6 }} />
                        Returning Customers
                    </Text>
                    {isLoading ? (
                        <div style={{ padding: '8px 0' }}><Spin size="small" /></div>
                    ) : retention?.rate != null ? (
                        <>
                            <Tooltip
                                title={
                                    `${retention.repeatCustomers} of ${retention.totalCustomers} customers ` +
                                    `placed 2 or more delivered orders in the last ${retention.windowDays} days`
                                }
                            >
                                <div style={{ fontSize: 24, fontWeight: 600, color: COLORS.retention, lineHeight: '32px' }}>
                                    {retention.rate}%
                                </div>
                            </Tooltip>
                            {retention.trend != null ? (
                                <Text
                                    style={{
                                        fontSize: 12,
                                        color: retention.trend >= 0 ? COLORS.coupons : COLORS.danger,
                                    }}
                                >
                                    {retention.trend >= 0 ? '▲' : '▼'} {Math.abs(retention.trend)} pts
                                    {' '}vs previous {retention.trendWindowDays} days
                                </Text>
                            ) : (
                                <Text style={{ fontSize: 12, color: COLORS.muted }}>
                                    Not enough history for a trend
                                </Text>
                            )}
                        </>
                    ) : (
                        <UnavailableKpi hint="No completed orders in the window" />
                    )}
                </Card>
            </div>

            {/* =========================== Live widgets =========================== */}
            <Row gutter={[16, 16]}>
                {/* Quick Sale — live deals */}
                <Col xs={24} lg={14}>
                    <Card
                        title={
                            <Space>
                                <ThunderboltOutlined style={{ color: COLORS.quickSale }} />
                                <span>Quick Sale — Live Deals</span>
                            </Space>
                        }
                        extra={
                            <Button type="link" onClick={() => navigate('/quick-sale')}>
                                Manage Deals <ArrowRightOutlined />
                            </Button>
                        }
                    >
                        {isLoading ? (
                            <div style={{ textAlign: 'center', padding: 32 }}>
                                <Spin size="large" />
                            </div>
                        ) : !quickSale?.items.length ? (
                            <Empty description="No products on Quick Sale right now." />
                        ) : (
                            <List
                                dataSource={quickSale.items}
                                renderItem={(item) => (
                                    <List.Item key={item.productId}>
                                        <List.Item.Meta
                                            title={
                                                <Space size={6}>
                                                    <Text strong>{item.name}</Text>
                                                    {item.isPerishable && (
                                                        <Tag color="orange" style={{ marginInlineEnd: 0 }}>
                                                            Perishable
                                                        </Tag>
                                                    )}
                                                </Space>
                                            }
                                            description={
                                                <Space size={8} wrap>
                                                    {item.effectiveDiscountPrice != null ? (
                                                        <>
                                                            <Text delete type="secondary">
                                                                {formatLKR(item.effectivePrice)}
                                                            </Text>
                                                            <Text strong style={{ color: COLORS.coupons }}>
                                                                {formatLKR(item.effectiveDiscountPrice)}
                                                            </Text>
                                                        </>
                                                    ) : (
                                                        <Text strong style={{ color: COLORS.coupons }}>
                                                            {formatLKR(item.effectivePrice)}
                                                        </Text>
                                                    )}
                                                    {!!item.effectiveDiscount && (
                                                        <Tag color="volcano">-{item.effectiveDiscount}%</Tag>
                                                    )}
                                                </Space>
                                            }
                                        />
                                        <Text
                                            type={item.stockQuantity > 0 ? 'secondary' : 'danger'}
                                            style={{ whiteSpace: 'nowrap' }}
                                        >
                                            {item.stockQuantity > 0
                                                ? `${item.stockQuantity} in stock`
                                                : 'Out of stock'}
                                        </Text>
                                    </List.Item>
                                )}
                            />
                        )}
                    </Card>
                </Col>

                {/* Home banners — measured performance */}
                <Col xs={24} lg={10}>
                    <Card
                        title={
                            <Space>
                                <PictureOutlined style={{ color: COLORS.banners }} />
                                <span>Home Banners</span>
                            </Space>
                        }
                        extra={
                            <Button type="link" onClick={() => navigate('/banners')}>
                                Manage <ArrowRightOutlined />
                            </Button>
                        }
                    >
                        {isLoading ? (
                            <div style={{ textAlign: 'center', padding: 32 }}>
                                <Spin size="large" />
                            </div>
                        ) : !banners?.items.length ? (
                            <Empty description="No active banners on your storefront." />
                        ) : (
                            <List
                                dataSource={banners.items}
                                renderItem={(banner) => (
                                    <List.Item key={banner.bannerId}>
                                        <List.Item.Meta
                                            avatar={
                                                banner.imageUrl ? (
                                                    <Image
                                                        src={banner.imageUrl}
                                                        width={56}
                                                        height={36}
                                                        style={{ objectFit: 'cover', borderRadius: 4 }}
                                                        preview={false}
                                                    />
                                                ) : undefined
                                            }
                                            title={
                                                <Space size={6} wrap>
                                                    <Text>{banner.title}</Text>
                                                    {banner.isPlatformWide ? (
                                                        <Tag color="purple">All Branches</Tag>
                                                    ) : (
                                                        <Tag color="blue">This Branch</Tag>
                                                    )}
                                                </Space>
                                            }
                                            description={
                                                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                                        {banner.impressions.toLocaleString()} views ·{' '}
                                                        {banner.clicks.toLocaleString()} clicks
                                                        {' · last '}{banners.windowDays}d
                                                    </Text>
                                                    {banner.ctr != null ? (
                                                        <Progress
                                                            percent={Math.min(100, banner.ctr)}
                                                            size="small"
                                                            format={() => `${banner.ctr}% CTR`}
                                                            strokeColor={
                                                                banner.ctr >= 5
                                                                    ? COLORS.coupons
                                                                    : banner.ctr >= 2
                                                                        ? COLORS.warn
                                                                        : COLORS.danger
                                                            }
                                                        />
                                                    ) : (
                                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                                            CTR: collecting data
                                                        </Text>
                                                    )}
                                                </Space>
                                            }
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
