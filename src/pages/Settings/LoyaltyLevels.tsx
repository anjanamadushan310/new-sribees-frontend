/**
 * Loyalty Levels — Super Admin only.
 *
 * Customers earn points on what they buy and keep (order value without
 * delivery, at the "Rupees per point" rate in Platform Settings), once each
 * order's 12-hour return window closes. Points never go down, and a
 * customer's level is read from them against these thresholds every time, so
 * editing a threshold moves people at once without touching their points.
 *
 * A level may carry a reward coupon: issued once to each customer who reaches
 * it, as a private, single-use code in their app. Adding a reward to an
 * existing level gives it to the customers already there at their next
 * settled order.
 */
import React, { useState } from 'react';
import {
    Alert,
    App,
    Button,
    Card,
    Col,
    ColorPicker,
    Form,
    Input,
    InputNumber,
    Modal,
    Popconfirm,
    Row,
    Select,
    Space,
    Switch,
    Table,
    Tag,
    Tooltip,
    Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CrownOutlined, DeleteOutlined, EditOutlined, GiftOutlined, PlusOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loyaltyApi, type LoyaltyTier, type LoyaltyTierPayload } from '../../api/loyalty.api';

const { Title, Text, Paragraph } = Typography;

const TIERS_KEY = ['admin', 'loyalty', 'tiers'];

interface TierFormValues {
    name: string;
    name_si?: string;
    name_ta?: string;
    min_points: number;
    color?: string;
    is_active: boolean;
    has_reward: boolean;
    reward_discount_type?: 'percentage' | 'fixed';
    reward_discount_value?: number;
    reward_min_order_value?: number;
    reward_max_discount?: number | null;
    reward_valid_days?: number;
}

const errorText = (err: unknown, fallback: string): string => {
    const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg).replace(/^Value error, /, '');
    return fallback;
};

const rewardText = (t: LoyaltyTier): string | null => {
    if (!t.reward_discount_type || t.reward_discount_value == null) return null;
    const off =
        t.reward_discount_type === 'percentage'
            ? `${t.reward_discount_value}% off`
            : `Rs ${t.reward_discount_value.toLocaleString()} off`;
    const cap = t.reward_max_discount ? `, up to Rs ${t.reward_max_discount.toLocaleString()}` : '';
    const min = t.reward_min_order_value ? ` on Rs ${t.reward_min_order_value.toLocaleString()}+` : '';
    return `${off}${cap}${min} · ${t.reward_valid_days} days`;
};

const LoyaltyLevels: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [form] = Form.useForm<TierFormValues>();
    const [editing, setEditing] = useState<LoyaltyTier | null>(null);
    const [open, setOpen] = useState(false);
    const hasReward = Form.useWatch('has_reward', form);
    const rewardType = Form.useWatch('reward_discount_type', form);

    const { data: tiers = [], isLoading, isError } = useQuery({
        queryKey: TIERS_KEY,
        queryFn: loyaltyApi.listTiers,
    });

    const refresh = () => queryClient.invalidateQueries({ queryKey: TIERS_KEY });

    const saveMutation = useMutation({
        mutationFn: (payload: LoyaltyTierPayload) =>
            editing ? loyaltyApi.updateTier(editing.tier_id, payload) : loyaltyApi.createTier(payload),
        onSuccess: () => {
            message.success(editing ? 'Level updated.' : 'Level added.');
            setOpen(false);
            refresh();
        },
        onError: (err) => message.error(errorText(err, 'Failed to save the level.')),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => loyaltyApi.deleteTier(id),
        onSuccess: () => {
            message.success('Level deleted.');
            refresh();
        },
        onError: (err) => message.error(errorText(err, 'Failed to delete the level.')),
    });

    const openForm = (tier: LoyaltyTier | null) => {
        setEditing(tier);
        form.resetFields();
        form.setFieldsValue(
            tier
                ? {
                      name: tier.name,
                      name_si: tier.name_si ?? undefined,
                      name_ta: tier.name_ta ?? undefined,
                      min_points: tier.min_points,
                      color: tier.color ?? undefined,
                      is_active: tier.is_active,
                      has_reward: !!tier.reward_discount_type,
                      reward_discount_type: tier.reward_discount_type ?? 'percentage',
                      reward_discount_value: tier.reward_discount_value ?? undefined,
                      reward_min_order_value: tier.reward_min_order_value ?? 0,
                      reward_max_discount: tier.reward_max_discount,
                      reward_valid_days: tier.reward_valid_days ?? 30,
                  }
                : {
                      is_active: true,
                      has_reward: false,
                      reward_discount_type: 'percentage',
                      reward_min_order_value: 0,
                      reward_valid_days: 30,
                  }
        );
        setOpen(true);
    };

    const handleSave = async () => {
        const v = await form.validateFields();
        const reward = v.has_reward;
        saveMutation.mutate({
            name: v.name.trim(),
            name_si: v.name_si?.trim() || null,
            name_ta: v.name_ta?.trim() || null,
            min_points: v.min_points,
            color: v.color || null,
            is_active: v.is_active,
            reward_discount_type: reward ? v.reward_discount_type ?? 'percentage' : null,
            reward_discount_value: reward ? v.reward_discount_value ?? null : null,
            reward_min_order_value: reward ? v.reward_min_order_value ?? 0 : 0,
            reward_max_discount:
                reward && v.reward_discount_type === 'percentage' ? v.reward_max_discount ?? null : null,
            reward_valid_days: reward ? v.reward_valid_days ?? null : null,
        });
    };

    const columns: ColumnsType<LoyaltyTier> = [
        {
            title: 'Level',
            key: 'name',
            render: (_, t) => (
                <Space>
                    <CrownOutlined style={{ color: t.color || undefined }} />
                    <Text strong>{t.name}</Text>
                    {!t.is_active && <Tag>Off</Tag>}
                </Space>
            ),
        },
        {
            title: 'From',
            dataIndex: 'min_points',
            render: (p: number) => `${p.toLocaleString()} points`,
        },
        {
            title: 'Customers',
            dataIndex: 'members',
            render: (n: number, t) => (t.is_active ? n.toLocaleString() : '—'),
        },
        {
            title: 'Level-up reward',
            key: 'reward',
            render: (_, t) => {
                const text = rewardText(t);
                return text ? (
                    <Space>
                        <GiftOutlined />
                        {text}
                    </Space>
                ) : (
                    <Text type="secondary">None</Text>
                );
            },
        },
        {
            title: 'Members-only coupons',
            dataIndex: 'coupons',
        },
        {
            title: '',
            key: 'actions',
            align: 'right',
            render: (_, t) => (
                <Space>
                    <Button icon={<EditOutlined />} onClick={() => openForm(t)}>
                        Edit
                    </Button>
                    <Tooltip title={t.coupons ? 'Coupons require this level. Switch it off instead.' : ''}>
                        <Popconfirm
                            title="Delete this level?"
                            description="Customers on it move to the level below. Their points do not change."
                            onConfirm={() => deleteMutation.mutate(t.tier_id)}
                            disabled={t.coupons > 0}
                        >
                            <Button danger icon={<DeleteOutlined />} disabled={t.coupons > 0} />
                        </Popconfirm>
                    </Tooltip>
                </Space>
            ),
        },
    ];

    return (
        <div style={{ maxWidth: 1100 }}>
            <Space style={{ width: '100%', justifyContent: 'space-between' }} align="start">
                <div>
                    <Title level={3} style={{ marginTop: 0 }}>
                        Loyalty Levels
                    </Title>
                    <Paragraph type="secondary" style={{ maxWidth: 720 }}>
                        Customers earn points on what they buy and keep, once each order's return window
                        closes, and points never go down. The rate is in Platform Settings. A level's reward
                        coupon is issued once to each customer who reaches it.
                    </Paragraph>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm(null)}>
                    Add level
                </Button>
            </Space>

            {isError ? (
                <Alert type="error" showIcon message="Failed to load the levels" />
            ) : (
                <Card>
                    <Table
                        rowKey="tier_id"
                        columns={columns}
                        dataSource={tiers}
                        loading={isLoading}
                        pagination={false}
                    />
                </Card>
            )}

            <Modal
                title={editing ? `Edit ${editing.name}` : 'Add a level'}
                open={open}
                onCancel={() => setOpen(false)}
                onOk={handleSave}
                okText="Save"
                confirmLoading={saveMutation.isPending}
                width={640}
                destroyOnHidden
            >
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Row gutter={12}>
                        <Col span={8}>
                            <Form.Item
                                label="Name"
                                name="name"
                                rules={[{ required: true, whitespace: true, message: 'Name the level' }]}
                            >
                                <Input maxLength={50} placeholder="Gold" />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item label="Sinhala" name="name_si">
                                <Input maxLength={50} />
                            </Form.Item>
                        </Col>
                        <Col span={8}>
                            <Form.Item label="Tamil" name="name_ta">
                                <Input maxLength={50} />
                            </Form.Item>
                        </Col>
                    </Row>
                    <Row gutter={12}>
                        <Col span={10}>
                            <Form.Item
                                label="Starts at"
                                name="min_points"
                                rules={[{ required: true, message: 'Enter the points needed' }]}
                            >
                                <InputNumber min={0} max={10000000} precision={0} addonAfter="points" style={{ width: '100%' }} />
                            </Form.Item>
                        </Col>
                        <Col span={7}>
                            <Form.Item
                                label="Colour"
                                name="color"
                                getValueFromEvent={(c) => (c ? c.toHexString().slice(0, 7).toUpperCase() : undefined)}
                            >
                                <ColorPicker allowClear disabledAlpha />
                            </Form.Item>
                        </Col>
                        <Col span={7}>
                            <Form.Item label="In use" name="is_active" valuePropName="checked">
                                <Switch />
                            </Form.Item>
                        </Col>
                    </Row>

                    <Form.Item
                        label="Give a coupon on reaching this level"
                        name="has_reward"
                        valuePropName="checked"
                        extra="A private, single-use code in the customer's app, network-wide, not usable on Quick Sale items."
                    >
                        <Switch />
                    </Form.Item>

                    {hasReward && (
                        <>
                            <Row gutter={12}>
                                <Col span={8}>
                                    <Form.Item label="Discount" name="reward_discount_type">
                                        <Select
                                            options={[
                                                { value: 'percentage', label: 'Percentage' },
                                                { value: 'fixed', label: 'Fixed (Rs)' },
                                            ]}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item
                                        label="Value"
                                        name="reward_discount_value"
                                        rules={[{ required: true, message: 'Enter the discount' }]}
                                    >
                                        <InputNumber
                                            min={0.01}
                                            max={rewardType === 'percentage' ? 100 : 1000000}
                                            addonAfter={rewardType === 'percentage' ? '%' : undefined}
                                            addonBefore={rewardType === 'fixed' ? 'Rs' : undefined}
                                            style={{ width: '100%' }}
                                        />
                                    </Form.Item>
                                </Col>
                                <Col span={8}>
                                    <Form.Item
                                        label="Valid for"
                                        name="reward_valid_days"
                                        rules={[{ required: true, message: 'How many days?' }]}
                                    >
                                        <InputNumber min={1} max={365} precision={0} addonAfter="days" style={{ width: '100%' }} />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Row gutter={12}>
                                <Col span={12}>
                                    <Form.Item
                                        label="Minimum order"
                                        name="reward_min_order_value"
                                        extra={rewardType === 'fixed' ? 'At least the discount amount.' : undefined}
                                    >
                                        <InputNumber min={0} addonBefore="Rs" style={{ width: '100%' }} />
                                    </Form.Item>
                                </Col>
                                {rewardType === 'percentage' && (
                                    <Col span={12}>
                                        <Form.Item label="Maximum discount" name="reward_max_discount" extra="Leave empty for no cap.">
                                            <InputNumber min={1} addonBefore="Rs" style={{ width: '100%' }} />
                                        </Form.Item>
                                    </Col>
                                )}
                            </Row>
                        </>
                    )}
                </Form>
            </Modal>
        </div>
    );
};

export default LoyaltyLevels;
