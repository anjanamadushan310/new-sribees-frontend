/**
 * Assign Promo — the 1-to-1 retention workflow.
 *
 * Issues a coupon that only ONE named customer can redeem, drops it into their
 * in-app wallet, and pushes them a notification. Used from the customer profile
 * drawer when the directory has flagged someone `at_risk`, or when a refund
 * needs an apology.
 *
 * The terms come from the server (`promosApi.presets`) rather than being typed
 * here, so every branch offers the same "15% Win-Back" and changing it is a
 * config change rather than a frontend release. The fields below are
 * pre-filled from the chosen preset and remain editable — presets are a
 * starting point, not a straitjacket.
 */
import React, { useEffect, useState } from 'react';
import {
    Alert,
    App,
    Form,
    Input,
    InputNumber,
    Modal,
    Select,
    Space,
    Tag,
    Typography,
} from 'antd';
import { GiftOutlined, NotificationOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { promosApi } from '../../api/promos.api';
import type { AssignPromoPayload, PromoPresetKey } from '../../api/promos.api';

const { Text } = Typography;

const PRESET_ICON: Record<PromoPresetKey, string> = {
    winback: '🎯',
    freedel: '🛵',
    apology: '🎁',
};

interface Props {
    open: boolean;
    userId: string | null;
    customerName: string;
    onClose: () => void;
}

interface FormValues {
    preset: PromoPresetKey;
    code: string;
    discount_value: number;
    min_order_value: number;
    valid_days: number;
}

const AssignPromoModal: React.FC<Props> = ({ open, userId, customerName, onClose }) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [form] = Form.useForm<FormValues>();
    const [preset, setPreset] = useState<PromoPresetKey>('winback');

    const presetsQuery = useQuery({
        queryKey: ['admin', 'promo-presets'],
        queryFn: promosApi.presets,
        enabled: open,
    });

    const chosen = presetsQuery.data?.find((p) => p.key === preset);

    // Re-seed the form whenever the preset changes (or the presets arrive), so
    // switching from "Win-Back" to "Apology" visibly rewrites the terms instead
    // of leaving the previous ones in place under a new label.
    useEffect(() => {
        if (!chosen || !open) return;
        form.setFieldsValue({
            preset: chosen.key,
            // The final code is generated server-side with a random suffix; a
            // guessable RECOVER15-KASUN is something any Kasun could type in.
            // Left blank here so the server names it unless a manager insists.
            code: '',
            discount_value: chosen.discount_value,
            min_order_value: chosen.min_order_value,
            valid_days: chosen.valid_days,
        });
    }, [chosen, open, form]);

    const assignMutation = useMutation({
        mutationFn: (payload: AssignPromoPayload) => promosApi.assign(userId!, payload),
        onSuccess: (promo) => {
            // Report what actually happened. The coupon exists regardless, but
            // if the push or the wallet drop failed the manager needs to know
            // to pass the code on themselves rather than assume it landed.
            if (promo.auto_collected && promo.push_sent) {
                message.success(`${promo.code} is in ${customerName}'s wallet — they've been notified.`);
            } else if (promo.auto_collected) {
                message.warning(
                    `${promo.code} is in their wallet, but the notification could not be sent. Tell them the code.`,
                );
            } else {
                message.warning(
                    `${promo.code} was created but could not be delivered to the app. Give the customer the code directly.`,
                );
            }
            queryClient.invalidateQueries({ queryKey: ['coupons'] });
            onClose();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to issue the coupon.'),
    });

    const handleOk = async () => {
        const values = await form.validateFields();
        if (!userId) return;
        assignMutation.mutate({
            preset: values.preset,
            code: values.code?.trim() ? values.code.trim().toUpperCase() : undefined,
            discount_type: chosen?.discount_type,
            discount_value: values.discount_value,
            min_order_value: values.min_order_value,
            valid_days: values.valid_days,
        });
    };

    const isPercentage = chosen?.discount_type === 'percentage';

    return (
        <Modal
            title={
                <Space>
                    <GiftOutlined />
                    Assign Exclusive Promo
                </Space>
            }
            open={open}
            onOk={handleOk}
            onCancel={onClose}
            okText="Issue & send to wallet"
            confirmLoading={assignMutation.isPending}
            destroyOnHidden
            width={520}
        >
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                Creates a coupon only <Text strong>{customerName}</Text> can redeem. It cannot
                be shared — the code is refused for anyone else, so it is safe to offer terms
                you would not publish.
            </Text>

            <Form form={form} layout="vertical" initialValues={{ preset: 'winback' }}>
                <Form.Item label="Offer" name="preset">
                    <Select
                        loading={presetsQuery.isLoading}
                        onChange={(value: PromoPresetKey) => setPreset(value)}
                        options={(presetsQuery.data ?? []).map((p) => ({
                            value: p.key,
                            label: `${PRESET_ICON[p.key] ?? ''} ${p.label}`,
                        }))}
                    />
                </Form.Item>

                <Space style={{ display: 'flex' }} align="start">
                    <Form.Item
                        label={isPercentage ? 'Discount (%)' : 'Discount (LKR)'}
                        name="discount_value"
                        rules={[{ required: true, message: 'Enter a value' }]}
                        style={{ flex: 1 }}
                    >
                        <InputNumber
                            min={1}
                            max={isPercentage ? 100 : undefined}
                            style={{ width: '100%' }}
                        />
                    </Form.Item>

                    <Form.Item
                        label="Min. order (LKR)"
                        name="min_order_value"
                        rules={[{ required: true, message: 'Enter a minimum' }]}
                        style={{ flex: 1 }}
                    >
                        <InputNumber min={0} style={{ width: '100%' }} />
                    </Form.Item>

                    <Form.Item
                        label="Valid for"
                        name="valid_days"
                        rules={[{ required: true }]}
                        style={{ width: 120 }}
                    >
                        <InputNumber min={1} max={90} addonAfter="days" style={{ width: '100%' }} />
                    </Form.Item>
                </Space>

                <Form.Item
                    label="Coupon code"
                    name="code"
                    extra="Leave blank and the server generates one with a random suffix, so nobody can guess another customer's code."
                >
                    <Input placeholder={chosen ? `${chosen.code_prefix}-…` : 'Auto-generated'} />
                </Form.Item>
            </Form>

            <Alert
                type="info"
                showIcon
                icon={<NotificationOutlined />}
                message="What happens next"
                description={
                    <span>
                        The coupon is added to their wallet automatically and a push
                        notification tells them it is there — a retention offer nobody opens
                        the app to find does not retain anyone.{' '}
                        <Tag color="orange" style={{ marginInlineStart: 4 }}>
                            Excludes Quick Sale items
                        </Tag>
                    </span>
                }
            />
        </Modal>
    );
};

export default AssignPromoModal;
