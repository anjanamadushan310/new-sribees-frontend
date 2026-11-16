/**
 * Referral programme settings (Super Admin): the highest commission a Branch
 * Manager may set on a product, and the Master Partner's share of the
 * direct Partner's commission.
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
    // Shown as a percentage of Partner earnings (25 = 25%); stored as 0.25.
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
                        Product rates set the total commission budget. Branch Inventory can set a lower rate.
                        A product with no rate earns nothing.
                        {data && data.highest_live_percent > 0 && (
                            <> The best rate on sale right now is {data.highest_live_percent}%.</>
                        )}
                    </Text>

                    <Form.Item
                        label="Highest rate a branch can set"
                        name="branch_max_percent"
                        rules={[{ required: true, message: 'Enter the branch limit' }]}
                        tooltip="Stops a typo like 50% instead of 5% on a branch. Each product maximum also applies to branch rates. Super Admins configure the product maximum."
                    >
                        <InputNumber min={0} max={100} step={0.5} style={{ width: 240 }} addonAfter="%" />
                    </Form.Item>

                    <Form.Item
                        label="Master Partner share of Partner commission"
                        name="level2_share_percent"
                        rules={[{ required: true, message: 'Enter the Master Partner share' }]}
                        tooltip="The Master Partner receives this percentage of the direct Partner's commission. At 25%, a Rs.10 product pool gives the Partner Rs.8 and the Master Partner Rs.2. Applies to new commissions."
                    >
                        <InputNumber
                            min={0}
                            max={100}
                            step={5}
                            style={{ width: 240 }}
                            addonAfter="% of Partner commission"
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
