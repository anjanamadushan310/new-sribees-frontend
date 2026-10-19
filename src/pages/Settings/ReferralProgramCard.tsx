/**
 * Referral programme settings (Super Admin): the highest commission a Branch
 * Manager may set on a product, and the upline's share of each rate.
 *
 * Saved on its own endpoint (/admin/referral-commission/settings), so it has
 * its own button rather than riding on Platform Settings' save.
 */
import React, { useEffect } from 'react';
import { App, Button, Card, Form, InputNumber, Skeleton, Space, Typography } from 'antd';
import { SaveOutlined, TeamOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { referralCommissionApi, rateErrorMessage } from '../../api/referralCommission.api';

const { Text } = Typography;

interface Values {
    branch_max_percent: number;
    // Shown as a percentage of the product's rate (50 = half); stored as 0.5.
    level2_share_percent: number;
}

const ReferralProgramCard: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [form] = Form.useForm<Values>();
    const queryKey = ['admin', 'referral-commission', 'settings'];

    const { data, isLoading } = useQuery({ queryKey, queryFn: referralCommissionApi.settings });

    useEffect(() => {
        if (data) {
            form.setFieldsValue({
                branch_max_percent: data.branch_max_percent,
                level2_share_percent: Math.round(data.level2_share * 1000) / 10,
            });
        }
    }, [data, form]);

    const save = useMutation({
        mutationFn: (values: Values) =>
            referralCommissionApi.updateSettings({
                branch_max_percent: values.branch_max_percent,
                level2_share: values.level2_share_percent / 100,
            }),
        onSuccess: (next) => {
            queryClient.setQueryData(queryKey, next);
            message.success('Referral programme updated.');
        },
        onError: (err) => message.error(rateErrorMessage(err)),
    });

    return (
        <Card
            title={
                <Space>
                    <TeamOutlined />
                    Referral Programme
                </Space>
            }
            style={{ marginTop: 16 }}
        >
            {isLoading ? (
                <Skeleton active paragraph={{ rows: 3 }} />
            ) : (
                <Form form={form} layout="vertical" requiredMark={false} onFinish={save.mutate}>
                    <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                        Commission is set per product (Products) and per branch (Branch Inventory).
                        A product with no rate earns nothing.
                        {data && data.highest_live_percent > 0 && (
                            <> The best rate on sale right now is {data.highest_live_percent}%.</>
                        )}
                    </Text>

                    <Form.Item
                        label="Highest rate a branch can set"
                        name="branch_max_percent"
                        rules={[{ required: true, message: 'Enter the branch limit' }]}
                        tooltip="Stops a typo like 50% instead of 5% on a branch. Super Admins are not limited by it. Rates already set above a new limit stay until someone changes them."
                    >
                        <InputNumber min={0} max={100} step={0.5} style={{ width: 240 }} addonAfter="%" />
                    </Form.Item>

                    <Form.Item
                        label="Lead partner's share"
                        name="level2_share_percent"
                        rules={[{ required: true, message: 'Enter the lead share' }]}
                        tooltip="What the lead who recruited an agent earns, as a share of the product's rate. 50% of a 4% product pays the lead 2%. Applies to orders placed after the change."
                    >
                        <InputNumber
                            min={0}
                            max={100}
                            step={5}
                            style={{ width: 240 }}
                            addonAfter="% of the rate"
                        />
                    </Form.Item>

                    <Button
                        type="primary"
                        htmlType="submit"
                        icon={<SaveOutlined />}
                        loading={save.isPending}
                    >
                        Save Referral Programme
                    </Button>
                </Form>
            )}
        </Card>
    );
};

export default ReferralProgramCard;
