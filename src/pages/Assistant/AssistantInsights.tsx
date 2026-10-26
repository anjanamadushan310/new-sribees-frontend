/**
 * AI Assistant — how much of the chat is answered free, and what was learned.
 *
 * The assistant answers simple messages itself (a product name, "where is my
 * order", "how do I change my address") in milliseconds and for free, and
 * sends the rest to the model. Every model answer teaches it: a message the
 * model keeps answering the same way becomes a pattern, first in shadow
 * (compared with the model on live chats), then active (answers by itself)
 * once it agrees nearly every time. A small share of free answers is
 * re-checked by the model in the background (the canary).
 *
 * This screen shows the free share, the model cost, and each rule's and
 * pattern's agreement with the model. Super Admins can switch a rule off or
 * on, and activate, return to shadow or disable a pattern — instantly, no
 * deploy. Nothing here calls the model.
 *
 * Server: /api/v1/admin/assistant-insights (analytics:read to view).
 */
import React, { useMemo, useState } from 'react';
import {
    Alert,
    Card,
    Col,
    Empty,
    Row,
    Segmented,
    Select,
    Space,
    Statistic,
    Switch,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    assistantInsightsApi,
    type Pattern,
    type PatternStatus,
    type RuleStats,
} from '../../api/assistantInsights.api';
import { usePermissions } from '../../hooks/usePermissions';

const { Text, Title, Paragraph } = Typography;

const pct = (value: number | null | undefined) => (value == null ? '—' : `${Math.round(value * 1000) / 10}%`);
const ms = (value: number | null | undefined) => (value == null ? '—' : value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`);

/** What each built-in rule answers, in the owner's words. */
const RULE_LABELS: Record<string, string> = {
    'products.list': 'A product name on its own ("seeni")',
    'products.want': '"I want / do you have" a product',
    'products.price': 'The price of a product',
    'orders.track': 'Where is my order',
    'orders.history': 'My previous orders',
    'help.how': 'How do I … in the app',
    'help.open': 'Open a page',
    'help.order': 'How to place an order',
    'social.greeting': 'Hello / ආයුබෝවන්',
    'social.thanks': 'Thank you',
    'cart.add': 'Add a product to the basket (preview)',
    'account.wallet': 'Wallet balance and points',
    'account.offers': 'Offers and coupons',
};

const MODE_TAG: Record<string, { color: string; text: string }> = {
    off: { color: 'default', text: 'Off — the model answers everything' },
    shadow: { color: 'gold', text: 'Shadow — learning; the model still answers' },
    active: { color: 'green', text: 'Active — simple messages answered free' },
};

const STATUS_COLOR: Record<PatternStatus, string> = { active: 'green', shadow: 'gold', disabled: 'default' };

const planText = (pattern: Pattern) =>
    pattern.plan.steps
        .map((s) => {
            const args = Object.entries(s.args ?? {})
                .map(([k, v]) => `${k}: ${String(v)}`)
                .join(', ');
            return args ? `${s.name} (${args})` : s.name;
        })
        .join(' + ');

const AssistantInsights: React.FC = () => {
    const { isSuperAdmin } = usePermissions();
    const queryClient = useQueryClient();
    const [days, setDays] = useState<number>(14);
    const [patternStatus, setPatternStatus] = useState<PatternStatus | 'all'>('all');

    const insights = useQuery({
        queryKey: ['assistant-insights', days],
        queryFn: () => assistantInsightsApi.get(days),
    });
    const patterns = useQuery({
        queryKey: ['assistant-patterns', patternStatus],
        queryFn: () => assistantInsightsApi.patterns(patternStatus === 'all' ? undefined : patternStatus),
    });

    const setRule = useMutation({
        mutationFn: ({ rule, enabled }: { rule: string; enabled: boolean }) => assistantInsightsApi.setRule(rule, enabled),
        onSuccess: (_disabled, { rule, enabled }) => {
            message.success(`${RULE_LABELS[rule] ?? rule}: ${enabled ? 'on' : 'off'}`);
            queryClient.invalidateQueries({ queryKey: ['assistant-insights'] });
        },
        onError: () => message.error('Could not change the rule. Try again.'),
    });
    const setPattern = useMutation({
        mutationFn: ({ id, status }: { id: string; status: PatternStatus }) => assistantInsightsApi.setPattern(id, status),
        onSuccess: () => {
            message.success('Pattern updated');
            queryClient.invalidateQueries({ queryKey: ['assistant-patterns'] });
        },
        onError: () => message.error('Could not update the pattern. Try again.'),
    });

    const data = insights.data;
    const free = (data?.share_by_layer.L1 ?? 0) + (data?.share_by_layer.L2 ?? 0);
    const disabled = new Set(data?.config.disabled_rules ?? []);

    const ruleRows = useMemo(() => {
        const known = Object.keys(RULE_LABELS);
        const seen = data?.rules ?? {};
        const builtIn = known.map((rule) => ({ rule, ...(seen[rule] ?? { turns: 0, agreement: null, judged: 0, ready_to_activate: false, disagreements: [] }) }));
        return builtIn as (RuleStats & { rule: string })[];
    }, [data]);

    const ruleColumns: ColumnsType<RuleStats & { rule: string }> = [
        {
            title: 'What it answers',
            dataIndex: 'rule',
            render: (rule: string) => (
                <Space direction="vertical" size={0}>
                    <Text>{RULE_LABELS[rule] ?? rule}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{rule}</Text>
                </Space>
            ),
        },
        { title: 'Chats', dataIndex: 'turns', width: 90, align: 'right' },
        {
            title: (
                <Tooltip title="How often the rule's plan matched what the model did, on chats the model answered">
                    Agreement
                </Tooltip>
            ),
            dataIndex: 'agreement',
            width: 120,
            align: 'right',
            render: (value: number | null, row) => (
                <Tooltip title={`${row.judged} compared`}>
                    <Text type={value != null && value < 0.95 ? 'danger' : undefined}>{pct(value)}</Text>
                </Tooltip>
            ),
        },
        {
            title: 'Ready',
            dataIndex: 'ready_to_activate',
            width: 110,
            render: (ready: boolean) => (ready ? <Tag color="green">Ready</Tag> : <Tag>Learning</Tag>),
        },
        {
            title: 'Answers by itself',
            width: 150,
            render: (_: unknown, row) => {
                const family = row.rule.split('.')[0];
                const off = disabled.has(row.rule) || disabled.has(family);
                return (
                    <Tooltip title={isSuperAdmin ? undefined : 'Only a Super Admin can switch rules'}>
                        <Switch
                            checked={!off}
                            disabled={!isSuperAdmin || disabled.has(family) && !disabled.has(row.rule)}
                            loading={setRule.isPending && setRule.variables?.rule === row.rule}
                            onChange={(enabled) => setRule.mutate({ rule: row.rule, enabled })}
                        />
                    </Tooltip>
                );
            },
        },
    ];

    const patternColumns: ColumnsType<Pattern> = [
        {
            title: 'Message',
            dataIndex: 'text_key',
            render: (text: string, row) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{text}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>{planText(row)}</Text>
                </Space>
            ),
        },
        { title: 'Seen', dataIndex: 'examples', width: 80, align: 'right' },
        {
            title: 'Shadow agreement',
            width: 150,
            align: 'right',
            render: (_: unknown, row) => `${pct(row.shadow.rate)} (${row.shadow.agree + row.shadow.disagree})`,
        },
        {
            title: 'Canary',
            width: 120,
            align: 'right',
            render: (_: unknown, row) => `${pct(row.canary.rate)} (${row.canary.agree + row.canary.disagree})`,
        },
        {
            title: 'Status',
            dataIndex: 'status',
            width: 170,
            render: (status: PatternStatus, row) =>
                isSuperAdmin ? (
                    <Select
                        size="small"
                        value={status}
                        style={{ width: 140 }}
                        loading={setPattern.isPending && setPattern.variables?.id === row.pattern_id}
                        onChange={(value) => setPattern.mutate({ id: row.pattern_id, status: value })}
                        options={[
                            { value: 'active', label: 'Active' },
                            { value: 'shadow', label: 'Shadow' },
                            { value: 'disabled', label: 'Disabled' },
                        ]}
                    />
                ) : (
                    <Tag color={STATUS_COLOR[status]}>{status}</Tag>
                ),
        },
    ];

    return (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div>
                <Title level={3} style={{ marginBottom: 4 }}>AI Assistant</Title>
                <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                    Simple messages are answered free in milliseconds; the rest go to the model. Every model
                    answer teaches the assistant, so the free share grows with use.
                </Paragraph>
            </div>

            {insights.isError && <Alert type="error" showIcon message="Could not load the assistant's numbers." />}

            <Space wrap>
                <Segmented
                    value={days}
                    onChange={(value) => setDays(Number(value))}
                    options={[
                        { label: '7 days', value: 7 },
                        { label: '14 days', value: 14 },
                        { label: '30 days', value: 30 },
                    ]}
                />
                {data && (
                    <>
                        <Tag color={MODE_TAG[data.config.hybrid_mode]?.color}>{MODE_TAG[data.config.hybrid_mode]?.text}</Tag>
                        <Tag>Canary re-checks: {pct(data.config.canary_rate)}</Tag>
                    </>
                )}
            </Space>

            <Row gutter={[16, 16]}>
                <Col xs={12} md={6}>
                    <Card loading={insights.isLoading}><Statistic title="Chats" value={data?.turns ?? 0} /></Card>
                </Col>
                <Col xs={12} md={6}>
                    <Card loading={insights.isLoading}>
                        <Statistic title="Answered free" value={pct(free)} valueStyle={{ color: '#3f8600' }} />
                    </Card>
                </Col>
                <Col xs={12} md={6}>
                    <Card loading={insights.isLoading}>
                        <Statistic title="Model cost" value={data?.model_cost_lkr ?? 0} prefix="Rs" precision={2} />
                    </Card>
                </Col>
                <Col xs={12} md={6}>
                    <Card loading={insights.isLoading}>
                        <Statistic
                            title="Typical reply time (free / model)"
                            value={`${ms(data?.latency_ms_p50_p95.L2?.[0])} / ${ms(data?.latency_ms_p50_p95.L4?.[0])}`}
                        />
                    </Card>
                </Col>
            </Row>

            <Card title="Built-in rules" extra={<Text type="secondary">A rule is ready at 98% agreement over 30+ chats</Text>}>
                <Table
                    rowKey="rule"
                    size="middle"
                    loading={insights.isLoading}
                    columns={ruleColumns}
                    dataSource={ruleRows}
                    pagination={false}
                    expandable={{
                        rowExpandable: (row) => row.disagreements.length > 0,
                        expandedRowRender: (row) => (
                            <Space direction="vertical">
                                <Text type="secondary">Recent chats where the rule and the model differed:</Text>
                                {row.disagreements.map((d, i) => (
                                    <Text key={i} code>{d.text}</Text>
                                ))}
                            </Space>
                        ),
                    }}
                />
            </Card>

            <Card
                title="Learned from the model"
                extra={
                    <Segmented
                        value={patternStatus}
                        onChange={(value) => setPatternStatus(value as PatternStatus | 'all')}
                        options={[
                            { label: 'All', value: 'all' },
                            { label: 'Active', value: 'active' },
                            { label: 'Shadow', value: 'shadow' },
                            { label: 'Disabled', value: 'disabled' },
                        ]}
                    />
                }
            >
                <Table
                    rowKey="pattern_id"
                    size="middle"
                    loading={patterns.isLoading}
                    columns={patternColumns}
                    dataSource={patterns.data ?? []}
                    locale={{ emptyText: <Empty description="Nothing learned yet — patterns appear as customers chat." /> }}
                    pagination={{ pageSize: 20 }}
                />
            </Card>
        </Space>
    );
};

export default AssistantInsights;
