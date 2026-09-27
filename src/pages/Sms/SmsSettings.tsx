/**
 * SMS (Super Admin only)
 *
 * The texts that carry sign-in codes: which provider sends them, the credit
 * left, today's count against the daily total, and the last 7 days. The
 * daily total is the one thing set here -- the per-number and per-address
 * rules are the same on every server and are shown for reference.
 */
import React, { useState } from 'react';
import {
    Alert,
    App,
    Button,
    Card,
    Col,
    Descriptions,
    InputNumber,
    Progress,
    Row,
    Space,
    Statistic,
    Tag,
    Typography,
} from 'antd';
import { MessageOutlined, SendOutlined, WalletOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from 'recharts';
import { smsApi } from '../../api/sms.api';
import { slt } from '../../utils/datetime';
import { PRIMARY, axisProps, gridProps } from '../../utils/chartTheme';

const { Title, Text } = Typography;

const MAX_DAILY_LIMIT = 10_000;

/** 300 → "5 minutes"; 180 → "3 minutes"; 45 → "45 seconds". */
function duration(seconds: number): string {
    if (seconds % 60 === 0) {
        const m = seconds / 60;
        return `${m} minute${m === 1 ? '' : 's'}`;
    }
    return `${seconds} seconds`;
}

const SmsSettings: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const { data, isLoading, isError } = useQuery({ queryKey: ['sms'], queryFn: smsApi.overview });
    // What the Super Admin has typed; undefined = nothing typed, show the saved value.
    const [draft, setDraft] = useState<number | null | undefined>(undefined);

    const save = useMutation({
        mutationFn: (value: number) => smsApi.setDailyLimit(value),
        onSuccess: (next) => {
            queryClient.setQueryData(['sms'], next);
            setDraft(undefined);
            message.success('Daily SMS limit saved.');
        },
        onError: () => message.error('Could not save the daily SMS limit.'),
    });

    if (isError) return <Alert type="error" showIcon message="Could not load SMS status." />;
    if (isLoading || !data) return <Card loading />;

    const used = data.daily_limit > 0 ? Math.min(100, Math.round((data.sent_today / data.daily_limit) * 100)) : 100;
    const chart = [...data.history].reverse().map((d) => ({ day: slt(d.date).format('D MMM'), sent: d.sent }));
    const limit = draft === undefined ? data.daily_limit : draft;
    const dirty = limit !== null && limit !== data.daily_limit;

    return (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Title level={4} style={{ margin: 0 }}>SMS</Title>

            {!data.is_live && (
                <Alert
                    type="warning"
                    showIcon
                    message={
                        data.missing.length
                            ? `SMS is switched on but the server is missing: ${data.missing.join(', ')}. No codes are sent.`
                            : 'SMS is not switched on for this server. Codes are written to the server log only.'
                    }
                />
            )}

            <Row gutter={[16, 16]}>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic title="Sent today" value={data.sent_today} prefix={<SendOutlined />} />
                        <Progress percent={used} showInfo={false} size="small" status={used >= 90 ? 'exception' : 'normal'} />
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic title="Left today" value={data.remaining_today} prefix={<MessageOutlined />} />
                        <Text type="secondary" style={{ fontSize: 12 }}>of {data.daily_limit} a day</Text>
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Statistic
                            title="Account credit"
                            value={data.balance ?? '—'}
                            precision={data.balance === null ? undefined : 2}
                            prefix={<WalletOutlined />}
                        />
                        {data.balance_error && <Text type="danger" style={{ fontSize: 12 }}>{data.balance_error}</Text>}
                    </Card>
                </Col>
                <Col xs={24} sm={12} lg={6}>
                    <Card>
                        <Text type="secondary">Provider</Text>
                        <div style={{ marginTop: 8 }}>
                            <Tag color={data.is_live ? 'green' : 'default'}>{data.provider}</Tag>
                            {data.sender_id && <Tag>{data.sender_id}</Tag>}
                        </div>
                    </Card>
                </Col>
            </Row>

            <Card title="Daily SMS limit">
                <Space direction="vertical" size={8}>
                    <Text type="secondary">
                        Texts the whole server may send in one day (Sri Lanka time), all numbers together.
                        When it is reached, no more codes go out until midnight. 0 stops every text.
                    </Text>
                    <Space>
                        <InputNumber
                            aria-label="Daily SMS limit"
                            min={0}
                            max={MAX_DAILY_LIMIT}
                            precision={0}
                            value={limit}
                            onChange={(v) => setDraft(typeof v === 'number' ? v : null)}
                            style={{ width: 160 }}
                        />
                        <Button
                            type="primary"
                            disabled={!dirty || limit === null}
                            loading={save.isPending}
                            onClick={() => limit !== null && save.mutate(limit)}
                        >
                            Save
                        </Button>
                    </Space>
                </Space>
            </Card>

            <Card title="Last 7 days">
                <div style={{ width: '100%', height: 220 }}>
                    <ResponsiveContainer>
                        <BarChart data={chart}>
                            <CartesianGrid {...gridProps} />
                            <XAxis dataKey="day" {...axisProps} />
                            <YAxis allowDecimals={false} {...axisProps} />
                            <RTooltip />
                            <Bar dataKey="sent" name="Texts sent" fill={PRIMARY} radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </Card>

            <Card title="Sending rules" extra={<Text type="secondary">The same on every server</Text>}>
                <Descriptions column={{ xs: 1, md: 2 }} size="small">
                    <Descriptions.Item label="Wait before another code">{duration(data.rules.resend_wait_seconds)}</Descriptions.Item>
                    <Descriptions.Item label="A code is valid for">{duration(data.rules.code_valid_seconds)}</Descriptions.Item>
                    <Descriptions.Item label="Codes per number">
                        {data.rules.per_number_per_hour} an hour, {data.rules.per_number_per_day} a day
                    </Descriptions.Item>
                    <Descriptions.Item label="Codes per internet address">
                        {data.rules.per_address_per_hour} an hour
                    </Descriptions.Item>
                    <Descriptions.Item label="Wrong tries per code">{data.rules.wrong_tries_per_code}</Descriptions.Item>
                    <Descriptions.Item label="Test numbers">Never texted; they use the test code</Descriptions.Item>
                </Descriptions>
            </Card>
        </Space>
    );
};

export default SmsSettings;
