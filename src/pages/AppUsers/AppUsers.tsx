/**
 * App Users (Super Admin only)
 *
 * Who has the customer app open right now, which version each phone runs,
 * and every install's daily use from the day it was downloaded. Fed by the
 * app's heartbeat: on open, every 2 minutes while on screen, and once when it
 * goes to the background.
 */
import React, { useMemo, useState } from 'react';
import {
    Badge,
    Card,
    Col,
    Descriptions,
    Drawer,
    Empty,
    Input,
    Progress,
    Row,
    Segmented,
    Space,
    Statistic,
    Table,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import { MobileOutlined, ClockCircleOutlined, TeamOutlined, WifiOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { appUsageApi } from '../../api/appUsage.api';
import type { AppInstall, AppUsageDay } from '../../api/appUsage.api';
import { slt } from '../../utils/datetime';
import { PRIMARY, axisProps, gridProps } from '../../utils/chartTheme';

const { Title, Text } = Typography;

/** 3725 → "1h 02m"; 540 → "9m"; 40 → "40s". */
function formatDuration(seconds: number): string {
    if (!seconds) return '0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h) return `${h}h ${String(m).padStart(2, '0')}m`;
    if (m) return `${m}m`;
    return `${seconds}s`;
}

const when = (iso: string | null) => (iso ? slt(iso).format('D MMM YYYY, h:mm A') : '—');

const Customer: React.FC<{ install: AppInstall }> = ({ install }) =>
    install.is_guest ? (
        <Tooltip title="Nobody has signed in on this phone yet">
            <Text type="secondary">Guest</Text>
        </Tooltip>
    ) : (
        <div>
            <Text strong style={{ display: 'block' }}>{install.customer_name || 'Customer'}</Text>
            <Text type="secondary" style={{ fontSize: 12 }}>{install.customer_phone}</Text>
        </div>
    );

const Version: React.FC<{ install: AppInstall }> = ({ install }) => {
    if (!install.app_version) return <Text type="secondary">—</Text>;
    const label = `${install.app_version}${install.build_number ? ` (${install.build_number})` : ''}`;
    if (install.is_latest_version === false) {
        return (
            <Tooltip title="Older than the latest version in App Settings">
                <Tag color="orange">{label}</Tag>
            </Tooltip>
        );
    }
    return <Tag color={install.is_latest_version ? 'green' : 'default'}>{label}</Tag>;
};

const HISTORY_RANGES = { '30 days': 30, '90 days': 90, 'Since download': Infinity } as const;
type HistoryRange = keyof typeof HISTORY_RANGES;

const InstallHistory: React.FC<{ deviceId: string }> = ({ deviceId }) => {
    const [range, setRange] = useState<HistoryRange>('30 days');
    const { data, isLoading } = useQuery({
        queryKey: ['app-usage', 'history', deviceId],
        queryFn: () => appUsageApi.history(deviceId),
    });

    const days = data?.days ?? [];
    const shown = days.slice(0, Math.min(days.length, HISTORY_RANGES[range]));
    // Oldest on the left, in minutes.
    const chart = useMemo(
        () =>
            [...shown].reverse().map((d) => ({
                day: slt(d.date).format('D MMM'),
                minutes: Math.round(d.seconds / 60),
            })),
        [shown],
    );

    if (isLoading || !data) return <Card loading />;
    const i = data.install;

    const columns: ColumnsType<AppUsageDay> = [
        { title: 'Date', dataIndex: 'date', render: (d: string) => slt(d).format('ddd, D MMM YYYY') },
        {
            title: 'Time in app',
            dataIndex: 'seconds',
            align: 'right',
            render: (s: number, row) =>
                row.measured ? formatDuration(s) : (
                    <Tooltip title="Before this phone's first report, usage was not recorded">
                        <Text type="secondary">Not measured</Text>
                    </Tooltip>
                ),
        },
        { title: 'Opens', dataIndex: 'opens', align: 'right', render: (n: number, row) => (row.measured ? n : '—') },
    ];

    return (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label="Customer"><Customer install={i} /></Descriptions.Item>
                <Descriptions.Item label="Version"><Version install={i} /></Descriptions.Item>
                <Descriptions.Item label="Phone">{i.platform === 'ios' ? 'iPhone' : 'Android'}</Descriptions.Item>
                <Descriptions.Item label="Downloaded">
                    {when(i.installed_at)}
                    {i.installed_at_is_estimate && <Text type="secondary"> (first seen)</Text>}
                </Descriptions.Item>
                <Descriptions.Item label="Last seen">
                    {i.is_online ? <Badge status="success" text="Online now" /> : when(i.last_seen_at)}
                </Descriptions.Item>
                <Descriptions.Item label="Total time in app">
                    {formatDuration(i.total_seconds)} over {i.days_active} day{i.days_active === 1 ? '' : 's'}
                </Descriptions.Item>
            </Descriptions>

            <Segmented
                options={Object.keys(HISTORY_RANGES)}
                value={range}
                onChange={(v) => setRange(v as HistoryRange)}
            />
            <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                    <BarChart data={chart} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid {...gridProps} />
                        <XAxis dataKey="day" {...axisProps} minTickGap={16} />
                        <YAxis {...axisProps} allowDecimals={false} unit="m" />
                        <RTooltip formatter={(v) => [`${v} min`, 'Time in app']} />
                        <Bar dataKey="minutes" fill={PRIMARY} radius={[3, 3, 0, 0]} />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            <Table
                rowKey="date"
                size="small"
                columns={columns}
                dataSource={shown}
                pagination={{ pageSize: 31, showSizeChanger: false }}
            />
        </Space>
    );
};

const AppUsers: React.FC = () => {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [openDevice, setOpenDevice] = useState<string | null>(null);

    // Online now is live: re-read every 30 seconds while the page is open.
    const overviewQuery = useQuery({
        queryKey: ['app-usage', 'overview'],
        queryFn: appUsageApi.overview,
        refetchInterval: 30_000,
    });
    const installsQuery = useQuery({
        queryKey: ['app-usage', 'installs', search, page],
        queryFn: () => appUsageApi.installs({ search: search || undefined, page, limit: 20 }),
        refetchInterval: 60_000,
    });

    const o = overviewQuery.data;
    const versionTotal = (o?.versions ?? []).reduce((sum, v) => sum + v.installs, 0);

    const onlineColumns: ColumnsType<AppInstall> = [
        { title: 'Customer', key: 'customer', render: (_, r) => <Customer install={r} /> },
        { title: 'Version', key: 'version', render: (_, r) => <Version install={r} /> },
        { title: 'Phone', dataIndex: 'platform', render: (p: string) => (p === 'ios' ? 'iPhone' : 'Android') },
        { title: 'Today', dataIndex: 'today_seconds', align: 'right', render: formatDuration },
        { title: 'Last report', dataIndex: 'last_seen_at', render: (v: string) => slt(v).format('h:mm A') },
    ];

    const installColumns: ColumnsType<AppInstall> = [
        {
            title: 'Customer',
            key: 'customer',
            render: (_, r) => (
                <Space>
                    <Badge status={r.is_online ? 'success' : 'default'} />
                    <Customer install={r} />
                </Space>
            ),
        },
        { title: 'Version', key: 'version', render: (_, r) => <Version install={r} /> },
        {
            title: 'Downloaded',
            dataIndex: 'installed_at',
            render: (v: string | null, r) => (
                <Tooltip title={r.installed_at_is_estimate ? 'The phone gave no install date: first seen' : undefined}>
                    {v ? slt(v).format('D MMM YYYY') : '—'}
                </Tooltip>
            ),
        },
        {
            title: 'Last seen',
            dataIndex: 'last_seen_at',
            render: (v: string | null, r) => (r.is_online ? <Text type="success">Online now</Text> : when(v)),
        },
        { title: 'Today', dataIndex: 'today_seconds', align: 'right', render: formatDuration },
        { title: 'Total', dataIndex: 'total_seconds', align: 'right', render: formatDuration },
        { title: 'Days used', dataIndex: 'days_active', align: 'right' },
    ];

    return (
        <div>
            <div style={{ marginBottom: 16 }}>
                <Title level={3} style={{ margin: 0 }}>
                    <Space><MobileOutlined />App Users</Space>
                </Title>
                <Text type="secondary">
                    Customers using the app right now, the version on each phone, and each phone's daily use since
                    it was downloaded. Click a row for its day-by-day history.
                </Text>
            </div>

            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col xs={12} lg={6}>
                    <Card>
                        <Statistic
                            title="Online now"
                            value={o?.online_count ?? 0}
                            prefix={<WifiOutlined style={{ color: '#0ca30c' }} />}
                            loading={overviewQuery.isLoading}
                        />
                    </Card>
                </Col>
                <Col xs={12} lg={6}>
                    <Card>
                        <Statistic
                            title="Used the app today"
                            value={o?.active_today ?? 0}
                            prefix={<TeamOutlined />}
                            loading={overviewQuery.isLoading}
                        />
                    </Card>
                </Col>
                <Col xs={12} lg={6}>
                    <Card>
                        <Statistic
                            title="Time in app today"
                            value={formatDuration(o?.seconds_today ?? 0)}
                            prefix={<ClockCircleOutlined />}
                            loading={overviewQuery.isLoading}
                        />
                    </Card>
                </Col>
                <Col xs={12} lg={6}>
                    <Card>
                        <Statistic
                            title="Installs"
                            value={o?.total_installs ?? 0}
                            prefix={<MobileOutlined />}
                            loading={overviewQuery.isLoading}
                        />
                    </Card>
                </Col>
            </Row>

            <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
                <Col xs={24} xl={16}>
                    <Card
                        title={<Space><Badge status="processing" />Using the app now</Space>}
                        extra={
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                Updates every 30 seconds
                            </Text>
                        }
                    >
                        <Table
                            rowKey="device_id"
                            size="small"
                            columns={onlineColumns}
                            dataSource={o?.online ?? []}
                            loading={overviewQuery.isLoading}
                            pagination={{ pageSize: 10, hideOnSinglePage: true }}
                            onRow={(r) => ({ onClick: () => setOpenDevice(r.device_id), style: { cursor: 'pointer' } })}
                            locale={{ emptyText: <Empty description="Nobody has the app open right now" /> }}
                            scroll={{ x: 'max-content' }}
                        />
                    </Card>
                </Col>
                <Col xs={24} xl={8}>
                    <Card
                        title="Versions in use"
                        extra={
                            o?.latest_version ? (
                                <Text type="secondary" style={{ fontSize: 12 }}>Latest: {o.latest_version}</Text>
                            ) : null
                        }
                    >
                        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 12 }}>
                            Phones that opened the app in the last 30 days
                        </Text>
                        {(o?.versions ?? []).length === 0 ? (
                            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
                        ) : (
                            o!.versions.map((v) => (
                                <div key={v.version} style={{ marginBottom: 10 }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Text strong>{v.version}</Text>
                                        <Text type="secondary">{v.installs}</Text>
                                    </div>
                                    <Progress
                                        percent={versionTotal ? Math.round((v.installs / versionTotal) * 100) : 0}
                                        strokeColor={v.version === o!.latest_version ? '#0ca30c' : PRIMARY}
                                        size="small"
                                    />
                                </div>
                            ))
                        )}
                    </Card>
                </Col>
            </Row>

            <Card
                title="Every phone with the app"
                extra={
                    <Input.Search
                        allowClear
                        placeholder="Name, phone or version"
                        style={{ width: 260 }}
                        onSearch={(v) => {
                            setSearch(v.trim());
                            setPage(1);
                        }}
                    />
                }
            >
                <Table
                    rowKey="device_id"
                    columns={installColumns}
                    dataSource={installsQuery.data?.installs ?? []}
                    loading={installsQuery.isLoading}
                    onRow={(r) => ({ onClick: () => setOpenDevice(r.device_id), style: { cursor: 'pointer' } })}
                    pagination={{
                        current: page,
                        pageSize: 20,
                        total: installsQuery.data?.total ?? 0,
                        showSizeChanger: false,
                        onChange: setPage,
                    }}
                    scroll={{ x: 'max-content' }}
                />
            </Card>

            <Drawer
                title="Daily use since download"
                width={560}
                open={openDevice !== null}
                onClose={() => setOpenDevice(null)}
                destroyOnHidden
            >
                {openDevice && <InstallHistory deviceId={openDevice} />}
            </Drawer>
        </div>
    );
};

export default AppUsers;
