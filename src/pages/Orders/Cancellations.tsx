/**
 * Cancellation review.
 *
 * Cancelling is a button in the customer's app now and it moves money —
 * anything paid comes back to the Sribees Wallet, minus the delivery charge
 * once a courier has been booked. A button that moves money is a button people
 * will test, so this screen is where the Branch Manager, Super Admin and
 * Customer Support see the pattern instead of the individual event.
 *
 * **It has no actions, deliberately.** Nothing here cancels, refunds, blocks or
 * bans. Deciding what to do about a customer is a human judgement with a
 * conversation attached, and a screen that could act on a heuristic would
 * eventually act on a wrong one — on somebody whose card was declined twice,
 * or who shares a wifi router with a stranger.
 *
 * Two tabs, because they answer different questions. "Who is doing this" is
 * the ranking; "what happened at 4pm" is the feed.
 */
import React, { useState } from 'react';
import {
    Alert,
    Badge,
    Card,
    Descriptions,
    Drawer,
    Empty,
    Modal,
    Select,
    Space,
    Spin,
    Switch,
    Table,
    Tabs,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import {
    cancellationsApi,
    type CancellationCustomerRow,
    type CancellationRow,
} from '../../api/cancellations.api';

const { Text, Title, Paragraph } = Typography;

const formatLKR = (n: number) =>
    `LKR ${Number(n || 0).toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;

/**
 * "12s", "4m", "3h", "2d" — the figure that matters is the order of magnitude.
 * Seconds means something automated or furious; two days means a person who
 * thought about it.
 */
const elapsed = (seconds: number | null) => {
    if (seconds == null) return '—';
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)}h`;
    return `${Math.round(seconds / 86400)}d`;
};

/** Sri Lanka time, like every other timestamp in this console. */
const whenLocal = (iso: string | null) =>
    iso
        ? new Date(iso).toLocaleString('en-LK', {
              timeZone: 'Asia/Colombo',
              dateStyle: 'medium',
              timeStyle: 'short',
          })
        : '—';

const Cancellations: React.FC = () => {
    const [days, setDays] = useState(30);
    const [flaggedOnly, setFlaggedOnly] = useState(false);
    const [detail, setDetail] = useState<CancellationRow | null>(null);
    const [linksFor, setLinksFor] = useState<CancellationCustomerRow | null>(null);

    const feed = useQuery({
        queryKey: ['cancellations', days, flaggedOnly],
        queryFn: () => cancellationsApi.list({ days, flagged_only: flaggedOnly, limit: 200 }),
    });

    const customers = useQuery({
        queryKey: ['cancellation-customers', days],
        queryFn: () => cancellationsApi.customers({ days, min_count: 2 }),
    });

    const links = useQuery({
        queryKey: ['cancellation-links', linksFor?.user_id],
        queryFn: () => cancellationsApi.links(linksFor!.user_id),
        enabled: !!linksFor,
    });

    const feedColumns: ColumnsType<CancellationRow> = [
        {
            title: 'When',
            dataIndex: 'cancelled_at',
            width: 170,
            render: (v: string | null, row) => (
                <Space direction="vertical" size={0}>
                    <Text>{whenLocal(v)}</Text>
                    {/* The elapsed time is the tell. Seconds after ordering is
                        not a person changing their mind. */}
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {elapsed(row.seconds_to_cancel)} after ordering
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Order',
            dataIndex: 'order_number',
            width: 140,
            render: (v: string | null) => <Text code>{v || '—'}</Text>,
        },
        {
            title: 'Customer',
            width: 200,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text>{row.customer_name || '—'}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {row.customer_phone || ''}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Refunded',
            dataIndex: 'refund_amount',
            width: 150,
            align: 'right',
            render: (v: number, row) => (
                <Space direction="vertical" size={0} style={{ width: '100%' }}>
                    <Text strong>{formatLKR(v)}</Text>
                    {row.courier_fee > 0 && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            less {formatLKR(row.courier_fee)} delivery
                        </Text>
                    )}
                </Space>
            ),
        },
        {
            title: 'Stage',
            width: 150,
            render: (_, row) =>
                row.cancelled_after_booking ? (
                    // The expensive kind. Worth its own colour: cancelling
                    // before we book costs a picker's time, after it costs a
                    // courier booking every time.
                    <Tag color="volcano">after courier booked</Tag>
                ) : (
                    <Tag>before booking</Tag>
                ),
        },
        {
            title: 'By',
            dataIndex: 'cancelled_by',
            width: 110,
            render: (v: string) =>
                v === 'admin' ? (
                    <Tooltip title="Cancelled by staff on the customer's behalf — not counted against them">
                        <Tag color="blue">staff</Tag>
                    </Tooltip>
                ) : (
                    <Tag color="default">customer</Tag>
                ),
        },
        {
            title: '',
            width: 60,
            render: (_, row) =>
                row.flagged ? (
                    <Tooltip title={row.flag_reason || 'Flagged for review'}>
                        <Badge status="error" />
                    </Tooltip>
                ) : null,
        },
    ];

    const customerColumns: ColumnsType<CancellationCustomerRow> = [
        {
            title: 'Customer',
            width: 220,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Space size={6}>
                        <Text strong>{row.customer_name || '—'}</Text>
                        {row.accounts > 1 && (
                            <Tooltip title="Counted by NIC: these cancellations span an account they closed and the one they opened afterwards.">
                                <Tag color="purple" style={{ marginInlineEnd: 0 }}>
                                    {row.accounts} accounts
                                </Tag>
                            </Tooltip>
                        )}
                    </Space>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {row.customer_phone || ''}
                        {row.customer_nic ? ` · ${row.customer_nic}` : ''}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Cancelled',
            dataIndex: 'cancellations',
            width: 110,
            align: 'center',
            sorter: (a, b) => a.cancellations - b.cancellations,
        },
        {
            title: 'After booking',
            dataIndex: 'cancelled_after_booking',
            width: 130,
            align: 'center',
            render: (v: number) =>
                v > 0 ? <Tag color="volcano">{v}</Tag> : <Text type="secondary">0</Text>,
            sorter: (a, b) => a.cancelled_after_booking - b.cancelled_after_booking,
        },
        {
            title: 'Refunded',
            dataIndex: 'refunded_total',
            width: 150,
            align: 'right',
            render: (v: number) => <Text strong>{formatLKR(v)}</Text>,
            sorter: (a, b) => a.refunded_total - b.refunded_total,
            defaultSortOrder: 'descend',
        },
        {
            title: 'Addresses / devices',
            width: 160,
            align: 'center',
            render: (_, row) => (
                <Text type="secondary">
                    {row.distinct_ips} IP · {row.distinct_devices} device
                </Text>
            ),
        },
        {
            title: 'Last seen',
            dataIndex: 'last_seen',
            width: 170,
            render: (v: string | null) => <Text type="secondary">{whenLocal(v)}</Text>,
        },
    ];

    return (
        <div>
            <Title level={3} style={{ marginBottom: 4 }}>
                Cancellations
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 16 }}>
                Customers can cancel their own orders up to the doorstep. Anything paid comes
                back to their wallet, less the delivery charge once a courier has been booked.
                This screen is for reading the pattern — it takes no action on anyone.
            </Paragraph>

            <Space style={{ marginBottom: 16 }} wrap>
                <Select
                    value={days}
                    onChange={setDays}
                    style={{ width: 160 }}
                    options={[
                        { value: 7, label: 'Last 7 days' },
                        { value: 30, label: 'Last 30 days' },
                        { value: 90, label: 'Last 90 days' },
                    ]}
                />
                <Space size={6}>
                    <Switch checked={flaggedOnly} onChange={setFlaggedOnly} size="small" />
                    <Text>Flagged only</Text>
                </Space>
            </Space>

            <Tabs
                defaultActiveKey="customers"
                items={[
                    {
                        key: 'customers',
                        label: 'By customer',
                        children: (
                            <Card size="small">
                                <Paragraph type="secondary" style={{ fontSize: 13 }}>
                                    Ranked by what it cost, not by how often. Ten cash-on-delivery
                                    cancellations cost a picker's time; two refunded card orders is
                                    real money. Anyone with a single cancellation is hidden —
                                    that is a customer changing their mind.
                                </Paragraph>
                                <Table
                                    rowKey="user_id"
                                    size="small"
                                    loading={customers.isLoading}
                                    dataSource={customers.data ?? []}
                                    columns={customerColumns}
                                    pagination={{ pageSize: 20, hideOnSinglePage: true }}
                                    onRow={(row) => ({
                                        onClick: () => setLinksFor(row),
                                        style: { cursor: 'pointer' },
                                    })}
                                    locale={{
                                        emptyText: (
                                            <Empty description="Nobody has cancelled more than once in this window." />
                                        ),
                                    }}
                                />
                            </Card>
                        ),
                    },
                    {
                        key: 'feed',
                        label: 'Every cancellation',
                        children: (
                            <Card size="small">
                                <Table
                                    rowKey="cancellation_id"
                                    size="small"
                                    loading={feed.isLoading}
                                    dataSource={feed.data ?? []}
                                    columns={feedColumns}
                                    pagination={{ pageSize: 25 }}
                                    onRow={(row) => ({
                                        onClick: () => setDetail(row),
                                        style: { cursor: 'pointer' },
                                    })}
                                    locale={{
                                        emptyText: <Empty description="No cancellations in this window." />,
                                    }}
                                />
                            </Card>
                        ),
                    },
                ]}
            />

            {/* One cancellation, in full. */}
            <Drawer
                open={!!detail}
                onClose={() => setDetail(null)}
                width={520}
                title={detail?.order_number || 'Cancellation'}
            >
                {detail && (
                    <>
                        {detail.flagged && (
                            <Alert
                                type="warning"
                                showIcon
                                style={{ marginBottom: 16 }}
                                message="Flagged for review"
                                description={detail.flag_reason}
                            />
                        )}
                        <Descriptions column={1} size="small" bordered>
                            <Descriptions.Item label="Customer">
                                {detail.customer_name || '—'}
                                {detail.customer_phone ? ` · ${detail.customer_phone}` : ''}
                            </Descriptions.Item>
                            <Descriptions.Item label="NIC">
                                {detail.customer_nic || '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Cancelled by">
                                {detail.cancelled_by}
                            </Descriptions.Item>
                            <Descriptions.Item label="Reason">
                                {detail.reason || '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Order total">
                                {formatLKR(detail.order_total)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Refunded to wallet">
                                {formatLKR(detail.refund_amount)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Delivery charge kept">
                                {detail.courier_fee > 0 ? formatLKR(detail.courier_fee) : '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Paid by">
                                {detail.payment_method || '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Ordered">
                                {whenLocal(detail.order_placed_at)}
                            </Descriptions.Item>
                            <Descriptions.Item label="Cancelled">
                                {whenLocal(detail.cancelled_at)} ({elapsed(detail.seconds_to_cancel)}{' '}
                                later)
                            </Descriptions.Item>
                            <Descriptions.Item label="IP address">
                                <Text code>{detail.ip_address || '—'}</Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="Device">
                                <Text code style={{ fontSize: 12 }}>
                                    {detail.device_id || '—'}
                                </Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="App">
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {detail.user_agent || '—'}
                                </Text>
                            </Descriptions.Item>
                        </Descriptions>
                    </>
                )}
            </Drawer>

            {/* Accounts that look like the same person. */}
            <Modal
                open={!!linksFor}
                onCancel={() => setLinksFor(null)}
                footer={null}
                width={560}
                title={`Accounts linked to ${linksFor?.customer_name || 'this customer'}`}
            >
                {links.isLoading && <Spin />}
                {links.data && (
                    <>
                        {/* The caveat leads, because the screen is about people
                            and the weakest signal is the one that looks most
                            damning at a glance. */}
                        <Alert
                            type="info"
                            showIcon
                            style={{ marginBottom: 16 }}
                            message="A match is a question, not an answer"
                            description={links.data.note}
                        />
                        <LinkGroup
                            title="Same NIC"
                            hint="The same person — an account they closed, or the one they opened after it."
                            rows={links.data.by_nic ?? []}
                        />
                        <LinkGroup
                            title="Same device"
                            hint="The strongest signal — it survives a new number and a new name."
                            rows={links.data.by_device}
                        />
                        <LinkGroup
                            title="Same address"
                            hint="Goods have to arrive somewhere."
                            rows={links.data.by_address}
                        />
                        <LinkGroup
                            title="Same IP"
                            hint="Weakest — a household, an office or a mobile network shares one legitimately."
                            rows={links.data.by_ip}
                        />
                    </>
                )}
            </Modal>
        </div>
    );
};

const LinkGroup: React.FC<{
    title: string;
    hint: string;
    rows: {
        user_id: string;
        customer_name: string | null;
        customer_phone?: string | null;
        customer_deleted?: boolean;
    }[];
}> = ({ title, hint, rows }) => (
    <div style={{ marginBottom: 18 }}>
        <Text strong>{title}</Text>
        <Paragraph type="secondary" style={{ fontSize: 12, margin: '2px 0 8px' }}>
            {hint}
        </Paragraph>
        {rows.length === 0 ? (
            <Text type="secondary">No other accounts.</Text>
        ) : (
            rows.map((r) => (
                <div key={r.user_id} style={{ padding: '4px 0' }}>
                    <Text>{r.customer_name || r.user_id}</Text>
                    {r.customer_phone && (
                        <Text type="secondary"> · {r.customer_phone}</Text>
                    )}
                    {r.customer_deleted && (
                        <Tag style={{ marginInlineStart: 6 }}>Deleted</Tag>
                    )}
                </div>
            ))
        )}
    </div>
);

export default Cancellations;
