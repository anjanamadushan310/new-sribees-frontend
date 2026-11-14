import { App, Alert, Form, Input, Modal, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { partnersApi, type AdminPartner } from '../../api/partners.api';

interface Props {
    partner: AdminPartner;
    onClose: () => void;
}

export default function PromotePartnerModal({ partner, onClose }: Props) {
    const { message } = App.useApp();
    const [form] = Form.useForm<{ note: string }>();
    const cache = useQueryClient();
    const promote = useMutation({
        mutationFn: (values: { note: string }) => partnersApi.promote(partner.partner_id, { note: values.note.trim() }),
        onSuccess: async () => {
            await cache.invalidateQueries({ queryKey: ['admin', 'partners'] });
            message.success('Promoted to Master Partner.');
            onClose();
        },
        onError: (error: any) => message.error(error.response?.data?.detail || 'Could not promote this Partner.'),
    });

    return (
        <Modal title="Promote to Master Partner" open onCancel={onClose} onOk={() => form.submit()}
            okText="Approve promotion" confirmLoading={promote.isPending}
            cancelButtonProps={{ disabled: promote.isPending }} closable={!promote.isPending} maskClosable={!promote.isPending}>
            <Typography.Title level={5}>{partner.full_name}</Typography.Title>
            <Typography.Paragraph>This Partner will be eligible to have Partners assigned to their team by a Super Admin.</Typography.Paragraph>
            <Alert type="info" showIcon title="Commission attribution" description={partner.parent_partner_id
                ? 'Their existing Master Partner receives the configured share of their direct customer commission. Commission from their team is paid to this account only.'
                : 'They earn customer commission from direct customers and Partner commission from Partners assigned to their team.'} />
            <Form form={form} layout="vertical" onFinish={values => promote.mutate(values)} style={{ marginTop: 20 }}>
                <Form.Item label="Reason for promotion" name="note" rules={[{
                    validator: (_, value) => typeof value === 'string' && value.trim().length >= 5
                        ? Promise.resolve() : Promise.reject(new Error('Enter a reason of at least 5 characters.')),
                }]}>
                    <Input.TextArea rows={3} maxLength={1000} disabled={promote.isPending} />
                </Form.Item>
            </Form>
        </Modal>
    );
}
