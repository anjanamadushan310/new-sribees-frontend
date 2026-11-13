import { useState } from 'react';
import { Alert, App, Checkbox, Form, Input, Modal, Select } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Customer } from '../../api/customers.api';
import { partnersApi } from '../../api/partners.api';

interface UpgradeValues {
    invitationChannel?: 'email' | 'sms';
    masterPartnerId?: string;
    consent: boolean;
    note: string;
}

export default function UpgradePartnerModal({ customer, onClose }: {
    customer: Customer;
    onClose: () => void;
}) {
    const [form] = Form.useForm<UpgradeValues>();
    const [validationError, setValidationError] = useState('');
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const masters = useQuery({ queryKey: ['admin', 'partners'], queryFn: partnersApi.list });
    const upgrade = useMutation({
        mutationFn: (values: UpgradeValues) => partnersApi.upgradeCustomer(customer.user_id, {
            invitation_channel: values.invitationChannel ?? 'email',
            master_partner_id: values.masterPartnerId ?? null,
            customer_consent_confirmed: true,
            note: values.note.trim(),
        }),
        onSuccess: (result, values) => {
            const channel = values.invitationChannel === 'sms' ? 'SMS' : 'email';
            if (!result.invitation_sent) {
                message.warning(`Partner account is ready, but the ${channel} invitation could not be sent. Check delivery settings and retry here.`, 12);
                return;
            }
            message.success(`Partner invitation sent by ${channel}. The customer can set their own password.`);
            queryClient.invalidateQueries({ queryKey: ['admin', 'partners'] });
            queryClient.invalidateQueries({ queryKey: ['customers'] });
            onClose();
        },
    });

    const submit = async () => {
        const values = await form.validateFields();
        setValidationError('');
        upgrade.mutate(values);
    };
    const error = upgrade.error as { response?: { data?: { detail?: unknown } } } | null;
    const detail = error?.response?.data?.detail;

    return <Modal open title="Upgrade Customer to Partner" okText="Approve Partner Upgrade"
        onOk={() => { submit().catch(() => setValidationError('Check the required fields below.')); }}
        onCancel={onClose} confirmLoading={upgrade.isPending} closable={!upgrade.isPending}
        maskClosable={!upgrade.isPending} keyboard={!upgrade.isPending}
        cancelButtonProps={{ disabled: upgrade.isPending }}>
        <p><strong>{customer.full_name}</strong><br />{customer.email}<br />{customer.phone}</p>
        <Alert type="info" showIcon title="The customer keeps their invite code and referrals. Partner earnings use a separate Partner Wallet." />
        <Form form={form} initialValues={{ invitationChannel: 'email' }} layout="vertical" disabled={upgrade.isPending} style={{ marginTop: 16 }}>
            <Form.Item name="masterPartnerId" label="Master Partner (optional)">
                <Select allowClear showSearch optionFilterProp="label" loading={masters.isLoading}
                    disabled={masters.isError} placeholder="No Master Partner assigned"
                    options={(masters.data ?? []).filter(p => p.is_active &&
                        (p.role ?? (p.parent_partner_id ? 'partner' : 'master_partner')) === 'master_partner' &&
                        p.linked_user_id !== customer.user_id)
                        .map(p => ({ value: p.partner_id, label: `${p.full_name} — ${p.email}` }))} />
            </Form.Item>
            {masters.isError && <Alert type="warning" title="Master Partners could not be loaded. Reopen this form to retry, or proceed without assigning one." />}
            <Form.Item name="invitationChannel" label="Send password setup link by">
                <Select options={[
                    { value: 'email', label: `Email — ${customer.email}` },
                    { value: 'sms', label: customer.phone ? `SMS — ${customer.phone}` : 'SMS — no registered phone', disabled: !customer.phone },
                ]} />
            </Form.Item>
            <Alert type="info" showIcon title="The customer chooses their own password using a single-use link valid for 24 hours. SMS is sent only to their verified primary phone number and may incur SMS charges. SMS setup does not verify their email address." style={{ marginBottom: 16 }} />
            <Form.Item name="note" label="Customer request / verification reference" rules={[
                { required: true, whitespace: true, message: 'Record how the customer requested and authorized this upgrade.' },
            ]}><Input.TextArea maxLength={400} rows={2} placeholder="For example, support ticket reference and verification performed" /></Form.Item>
            <Form.Item name="consent" valuePropName="checked" rules={[{
                validator: (_, value) => value === true ? Promise.resolve() : Promise.reject(new Error('Confirm customer identity and consent.')),
            }]}><Checkbox>I verified this customer’s identity and their request to become a Partner.</Checkbox></Form.Item>
        </Form>
        {(upgrade.isError || validationError) && <Alert type="error" showIcon title={validationError ||
            (typeof detail === 'string' ? detail : 'Partner upgrade failed. Please check the customer details and try again.')} />}
    </Modal>;
}
