import { useState } from 'react';
import { Alert, App, Checkbox, Form, Input, Modal, Select } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Customer } from '../../api/customers.api';
import { partnersApi } from '../../api/partners.api';

interface UpgradeValues {
    password: string;
    confirmPassword: string;
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
            password: values.password,
            master_partner_id: values.masterPartnerId ?? null,
            customer_consent_confirmed: true,
            note: values.note.trim(),
        }),
        onSuccess: () => {
            message.success('Customer upgraded to Partner. Share the portal login details securely.');
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
        <Form form={form} layout="vertical" disabled={upgrade.isPending} style={{ marginTop: 16 }}>
            <Form.Item name="masterPartnerId" label="Master Partner (optional)">
                <Select allowClear showSearch optionFilterProp="label" loading={masters.isLoading}
                    disabled={masters.isError} placeholder="No Master Partner assigned"
                    options={(masters.data ?? []).filter(p => p.is_active &&
                        (p.role ?? (p.parent_partner_id ? 'partner' : 'master_partner')) === 'master_partner' &&
                        p.linked_user_id !== customer.user_id)
                        .map(p => ({ value: p.partner_id, label: `${p.full_name} — ${p.email}` }))} />
            </Form.Item>
            {masters.isError && <Alert type="warning" title="Master Partners could not be loaded. Reopen this form to retry, or proceed without assigning one." />}
            <Form.Item name="password" label="Partner Portal password" rules={[
                { required: true, whitespace: true, message: 'Set a Partner Portal password.' },
                { min: 8, max: 128, message: 'Use 8–128 characters.' },
            ]}><Input.Password autoComplete="new-password" maxLength={128} /></Form.Item>
            <Form.Item name="confirmPassword" label="Confirm password" dependencies={['password']} rules={[
                { required: true, message: 'Confirm the password.' },
                ({ getFieldValue }) => ({ validator(_, value) {
                    return value === getFieldValue('password') ? Promise.resolve() : Promise.reject(new Error('Passwords must match.'));
                } }),
            ]}><Input.Password autoComplete="new-password" maxLength={128} /></Form.Item>
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
