/**
 * Settings → Courier → merchant API keys.
 *
 * Two things this card exists to make possible:
 *
 * 1. **Go-live without a redeploy.** The sandbox → live switch is one key
 *    change, and it is the change most likely to be made under time pressure.
 *    Requiring an engineer and a deploy for it is how a launch slips.
 * 2. **A branch with its own SribeesExpress account.** A branch that signs
 *    with them in its own name has its own key — and with it its own pickup
 *    locations and its own COD ledger. A branch with no key of its own books
 *    against the account-wide one.
 *
 * Keys are write-only here. The API returns masks and never the value, so
 * there is nothing on this screen to steal; the mask keeps the
 * `sk_test_`/`sk_live_` prefix because "did go-live actually happen?" should
 * be answerable at a glance.
 *
 * Super Admin only, and the server enforces that independently — this key
 * decides where every branch's parcels go.
 */
import React, { useState } from 'react';
import { Alert, App, Button, Card, Input, Modal, Space, Table, Tag, Typography } from 'antd';
import { ApiOutlined, KeyOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { courierApi } from '../../api/courier.api';
import type { CourierKeyStatus } from '../../api/courier.api';

const { Text, Paragraph } = Typography;

/** Where the key this row actually uses comes from — not the same as "is one set here". */
const SOURCE_META: Record<string, { label: string; color: string }> = {
    branch: { label: 'Own account', color: 'purple' },
    account: { label: 'Account key', color: 'blue' },
    environment: { label: 'Server .env', color: 'default' },
    none: { label: 'Not configured', color: 'red' },
};

const envTag = (env: string | null) => {
    if (!env) return null;
    if (env === 'live') return <Tag color="red">LIVE</Tag>;
    if (env === 'test') return <Tag color="gold">sandbox</Tag>;
    return <Tag>unrecognised prefix</Tag>;
};

interface EditTarget {
    /** null = the account-wide key. */
    branchId: string | null;
    title: string;
}

const CourierKeysCard: React.FC = () => {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();

    const [edit, setEdit] = useState<EditTarget | null>(null);
    const [draftKey, setDraftKey] = useState('');

    const { data, isLoading, error } = useQuery({
        queryKey: ['admin', 'courier', 'credentials'],
        queryFn: () => courierApi.getCredentials(),
        retry: false,
    });

    const invalidate = () =>
        queryClient.invalidateQueries({ queryKey: ['admin', 'courier', 'credentials'] });

    const saveMut = useMutation({
        mutationFn: ({ branchId, key }: { branchId: string | null; key: string }) =>
            branchId ? courierApi.setBranchKey(branchId, key) : courierApi.setAccountKey(key),
        onSuccess: (_r, v) => {
            message.success(v.key.trim() ? 'Key saved.' : 'Key cleared.');
            setEdit(null);
            setDraftKey('');
            invalidate();
        },
        onError: (err: any) => message.error(err.response?.data?.detail || 'Could not save the key.'),
    });

    const testMut = useMutation({
        mutationFn: (branchId?: string) => courierApi.testKey(branchId),
        onSuccess: (res) => {
            if (res.ok) message.success(res.detail);
            else message.error(res.detail);
        },
        onError: (err: any) => message.error(err.response?.data?.detail || 'Test failed.'),
    });

    const confirmSave = () => {
        if (!edit) return;
        const key = draftKey.trim();
        // A live key is the one change on this screen that moves real parcels
        // and real money, so it gets a second look rather than one click.
        if (key.startsWith('sk_live_')) {
            modal.confirm({
                title: 'Switch to the LIVE SribeesExpress environment?',
                content: (
                    <span>
                        This key books <b>real parcels</b> and collects <b>real cash</b> for{' '}
                        <b>{edit.title}</b>. Sandbox orders will no longer be created.
                    </span>
                ),
                okText: 'Go live',
                okButtonProps: { danger: true },
                onOk: () => saveMut.mutateAsync({ branchId: edit.branchId, key }),
            });
            return;
        }
        saveMut.mutate({ branchId: edit.branchId, key });
    };

    const columns: ColumnsType<CourierKeyStatus> = [
        {
            title: 'Branch',
            key: 'branch',
            render: (_, r) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{r.branch_name}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {r.branch_code}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Books against',
            key: 'source',
            width: 150,
            render: (_, r) => {
                const meta = SOURCE_META[r.source] ?? SOURCE_META.none;
                return <Tag color={meta.color}>{meta.label}</Tag>;
            },
        },
        {
            title: 'Own key',
            key: 'masked',
            width: 190,
            render: (_, r) =>
                r.is_set ? (
                    <Space direction="vertical" size={0}>
                        <Space size={4}>
                            <Text code>{r.masked}</Text>
                            {envTag(r.environment)}
                        </Space>
                        {r.set_at && (
                            <Text type="secondary" style={{ fontSize: 11 }}>
                                {dayjs(r.set_at).format('DD MMM YYYY')}
                                {r.set_by ? ` · ${r.set_by}` : ''}
                            </Text>
                        )}
                    </Space>
                ) : (
                    <Text type="secondary">—</Text>
                ),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 190,
            render: (_, r) => (
                <Space>
                    <Button
                        size="small"
                        icon={<KeyOutlined />}
                        onClick={() => {
                            setEdit({ branchId: r.branch_id, title: r.branch_name ?? 'this branch' });
                            setDraftKey('');
                        }}
                    >
                        {r.is_set ? 'Replace' : 'Set key'}
                    </Button>
                    <Button
                        size="small"
                        icon={<ThunderboltOutlined />}
                        loading={testMut.isPending && testMut.variables === r.branch_id}
                        onClick={() => testMut.mutate(r.branch_id ?? undefined)}
                    >
                        Test
                    </Button>
                </Space>
            ),
        },
    ];

    const account = data?.account;

    return (
        <Card
            size="small"
            loading={isLoading}
            title={
                <Space>
                    <ApiOutlined />
                    <span>SribeesExpress API keys</span>
                </Space>
            }
        >
            {error ? (
                <Alert
                    type="error"
                    showIcon
                    message="Could not load credentials"
                    description={
                        (error as any)?.response?.data?.detail ??
                        'Only a Super Admin can view or change courier credentials.'
                    }
                />
            ) : (
                <>
                    <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                        A branch with no key of its own books against the account-wide key. Give a
                        branch its own key only when it holds its own SribeesExpress merchant
                        account — its pickup locations and COD ledger then live there too, so
                        re-run the pickup-location sync after changing one.
                    </Paragraph>

                    {account && (
                        <div
                            style={{
                                border: '1px solid #f0f0f0',
                                borderRadius: 6,
                                padding: 12,
                                marginBottom: 16,
                            }}
                        >
                            <Space wrap style={{ justifyContent: 'space-between', width: '100%' }}>
                                <Space direction="vertical" size={0}>
                                    <Text strong>Account-wide key</Text>
                                    <Space size={6}>
                                        {account.is_set ? (
                                            <Text code>{account.masked}</Text>
                                        ) : (
                                            <Text type="secondary">not set</Text>
                                        )}
                                        {envTag(account.environment)}
                                        <Tag color={(SOURCE_META[account.source] ?? SOURCE_META.none).color}>
                                            {(SOURCE_META[account.source] ?? SOURCE_META.none).label}
                                        </Tag>
                                    </Space>
                                </Space>
                                <Space>
                                    <Button
                                        icon={<KeyOutlined />}
                                        onClick={() => {
                                            setEdit({ branchId: null, title: 'every branch' });
                                            setDraftKey('');
                                        }}
                                    >
                                        {account.is_set ? 'Replace' : 'Set key'}
                                    </Button>
                                    <Button
                                        icon={<ThunderboltOutlined />}
                                        loading={testMut.isPending && !testMut.variables}
                                        onClick={() => testMut.mutate(undefined)}
                                    >
                                        Test
                                    </Button>
                                </Space>
                            </Space>
                            {account.source === 'environment' && (
                                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
                                    Currently using the key baked into the server's environment.
                                    Setting one here overrides it without a redeploy; clearing it
                                    falls back here again.
                                </Text>
                            )}
                        </div>
                    )}

                    <Table
                        columns={columns}
                        dataSource={data?.branches ?? []}
                        rowKey={(r) => r.branch_id ?? 'account'}
                        size="small"
                        pagination={false}
                    />
                </>
            )}

            <Modal
                title={`Set the SribeesExpress key for ${edit?.title ?? ''}`}
                open={!!edit}
                onCancel={() => setEdit(null)}
                onOk={confirmSave}
                okText="Save key"
                confirmLoading={saveMut.isPending}
            >
                <Paragraph type="secondary">
                    Paste the merchant key from SribeesExpress. It is stored write-only — this
                    screen will only ever show it masked again, so keep your own copy.
                    {edit?.branchId && ' Leave it empty to return this branch to the account-wide key.'}
                </Paragraph>
                <Input.Password
                    value={draftKey}
                    onChange={(e) => setDraftKey(e.target.value)}
                    placeholder="sk_test_… or sk_live_…"
                    autoFocus
                />
                {draftKey.trim().startsWith('sk_live_') && (
                    <Alert
                        type="warning"
                        showIcon
                        style={{ marginTop: 12 }}
                        message="This is a LIVE key"
                        description="Saving it means real parcels and real cash collection for this scope."
                    />
                )}
            </Modal>
        </Card>
    );
};

export default CourierKeysCard;
