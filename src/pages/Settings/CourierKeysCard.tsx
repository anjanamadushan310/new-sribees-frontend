/**
 * Settings → Courier → merchant credentials.
 *
 * The deployment holds BOTH SribeesExpress environments at once and an
 * operator flips between them. That shape is deliberate:
 *
 * * Go-live is one switch, not a redeploy. It is the change most likely to be
 *   made under time pressure, and needing an engineer for it is how a launch
 *   slips.
 * * A branch that signs with SribeesExpress in its own name has its own key —
 *   and with it its own pickup locations and its own COD ledger. A branch with
 *   no key of its own books against the account-wide one.
 * * A branch can be pinned to an environment on its own, so the first branch
 *   can go live while the rest stay in the sandbox.
 *
 * Keys are write-only. The API returns masks and never the value, and the
 * values themselves are encrypted at rest, so there is nothing on this screen
 * or in the database to steal. The mask keeps the `sk_test_` / `sk_live_`
 * prefix because "did go-live actually happen?" should be answerable at a
 * glance.
 *
 * Super Admin only, enforced independently by the server.
 */
import React, { useState } from 'react';
import {
    Alert,
    App,
    Button,
    Card,
    Input,
    Modal,
    Segmented,
    Space,
    Table,
    Tag,
    Typography,
} from 'antd';
import { ApiOutlined, KeyOutlined, LinkOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { courierApi } from '../../api/courier.api';
import type {
    CourierBranchKeyStatus,
    CourierCredentials,
    CourierEnvironmentConfig,
} from '../../api/courier.api';

const { Text, Paragraph } = Typography;

type Env = 'test' | 'live';

const envTag = (env: string | null | undefined) => {
    if (env === 'live') return <Tag color="red">LIVE</Tag>;
    if (env === 'test') return <Tag color="gold">sandbox</Tag>;
    if (env === 'unknown') return <Tag color="volcano">unrecognised prefix</Tag>;
    return null;
};

/** One environment's host + key, and whether it is ready to be switched to. */
const EnvironmentCard: React.FC<{
    config: CourierEnvironmentConfig;
    isDefault: boolean;
    onEditKey: () => void;
    onEditUrl: () => void;
    onTest: () => void;
    testing: boolean;
}> = ({ config, isDefault, onEditKey, onEditUrl, onTest, testing }) => (
    <Card
        size="small"
        style={{ flex: 1, minWidth: 280 }}
        title={
            <Space>
                {envTag(config.environment)}
                {isDefault && <Tag color="blue">in use</Tag>}
            </Space>
        }
        extra={
            <Button size="small" icon={<ThunderboltOutlined />} loading={testing} onClick={onTest}>
                Test
            </Button>
        }
    >
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
            <Space size={6} wrap>
                <Text type="secondary" style={{ fontSize: 12 }}>
                    Host
                </Text>
                {config.base_url ? (
                    <Text code style={{ fontSize: 12 }}>
                        {config.base_url}
                    </Text>
                ) : (
                    <Text type="secondary">not set</Text>
                )}
                <Button size="small" type="link" icon={<LinkOutlined />} onClick={onEditUrl}>
                    Edit
                </Button>
            </Space>

            {!config.base_url_ok && config.base_url && (
                <Alert
                    type="error"
                    showIcon
                    message="This URL already contains /api/v1/ecommerce"
                    description="The backend appends that itself, so every call 404s. Enter the origin only."
                />
            )}

            <Space size={6} wrap>
                <Text type="secondary" style={{ fontSize: 12 }}>
                    Key
                </Text>
                {config.api_key_unreadable ? (
                    <Tag color="red">stored but unreadable</Tag>
                ) : config.api_key_set ? (
                    <>
                        <Text code style={{ fontSize: 12 }}>
                            {config.api_key_masked}
                        </Text>
                        {config.api_key_environment !== config.environment &&
                            envTag(config.api_key_environment)}
                    </>
                ) : (
                    <Text type="secondary">not set</Text>
                )}
                <Button size="small" type="link" icon={<KeyOutlined />} onClick={onEditKey}>
                    {config.api_key_set ? 'Replace' : 'Set'}
                </Button>
            </Space>

            {/* A live key in the sandbox slot (or the reverse) authenticates
                against the wrong environment and is caught only by a booking. */}
            {config.api_key_set &&
                !config.api_key_unreadable &&
                config.api_key_environment !== config.environment && (
                    <Alert
                        type="warning"
                        showIcon
                        message={`This is a ${config.api_key_environment} key in the ${config.environment} slot`}
                    />
                )}
        </Space>
    </Card>
);

interface KeyEdit {
    environment: Env;
    branchId: string | null;
    title: string;
}

interface UrlEdit {
    environment: Env;
    current: string;
}

const CourierKeysCard: React.FC = () => {
    const { message, modal } = App.useApp();
    const queryClient = useQueryClient();

    const [keyEdit, setKeyEdit] = useState<KeyEdit | null>(null);
    const [urlEdit, setUrlEdit] = useState<UrlEdit | null>(null);
    const [draft, setDraft] = useState('');
    const [testing, setTesting] = useState<string | null>(null);

    const { data, isLoading, error } = useQuery({
        queryKey: ['admin', 'courier', 'credentials'],
        queryFn: () => courierApi.getCredentials(),
        retry: false,
    });

    const invalidate = () =>
        queryClient.invalidateQueries({ queryKey: ['admin', 'courier', 'credentials'] });

    const onSaved = (msg: string) => {
        message.success(msg);
        setKeyEdit(null);
        setUrlEdit(null);
        setDraft('');
        invalidate();
    };
    const onFailed = (err: any) =>
        message.error(err.response?.data?.detail || 'Could not save that.');

    const keyMut = useMutation({
        mutationFn: ({ environment, branchId, value }: KeyEdit & { value: string }) =>
            branchId
                ? courierApi.setBranchKey(branchId, environment, value)
                : courierApi.setAccountKey(environment, value),
        onSuccess: (_r, v) => onSaved(v.value.trim() ? 'Key saved.' : 'Key cleared.'),
        onError: onFailed,
    });

    const urlMut = useMutation({
        mutationFn: ({ environment, value }: { environment: Env; value: string }) =>
            courierApi.setBaseUrl(environment, value),
        onSuccess: () => onSaved('Host saved.'),
        onError: onFailed,
    });

    const envMut = useMutation({
        mutationFn: (environment: Env) => courierApi.setEnvironment(environment),
        onSuccess: (_r, v) => onSaved(`Every branch now books in the ${v} environment.`),
        onError: onFailed,
    });

    const branchEnvMut = useMutation({
        mutationFn: ({ branchId, environment }: { branchId: string; environment: Env | null }) =>
            courierApi.setBranchEnvironment(branchId, environment),
        onSuccess: () => onSaved('Branch environment updated.'),
        onError: onFailed,
    });

    const runTest = async (branchId?: string) => {
        setTesting(branchId ?? 'account');
        try {
            const res = await courierApi.testKey(branchId);
            if (res.ok) message.success(res.detail);
            else message.error(res.detail);
        } catch (err: any) {
            message.error(err.response?.data?.detail || 'Test failed.');
        } finally {
            setTesting(null);
        }
    };

    const saveKey = () => {
        if (!keyEdit) return;
        const value = draft.trim();
        // A live key is the one change here that starts moving real parcels
        // and real money, so it gets a second look rather than one click.
        if (value.startsWith('sk_live_')) {
            modal.confirm({
                title: 'Save a LIVE SribeesExpress key?',
                content: (
                    <span>
                        This key books <b>real parcels</b> and collects <b>real cash</b> for{' '}
                        <b>{keyEdit.title}</b>. It takes effect as soon as that scope is booking in
                        the live environment.
                    </span>
                ),
                okText: 'Save live key',
                okButtonProps: { danger: true },
                onOk: () => keyMut.mutateAsync({ ...keyEdit, value }),
            });
            return;
        }
        keyMut.mutate({ ...keyEdit, value });
    };

    const confirmGoLive = (credentials: CourierCredentials, target: Env) => {
        if (target === credentials.environment) return;
        if (target === 'test') {
            envMut.mutate(target);
            return;
        }
        modal.confirm({
            title: 'Switch every branch to LIVE?',
            content: (
                <span>
                    From now on, orders create <b>real SribeesExpress parcels</b> and riders
                    collect <b>real cash</b>. Branches pinned to their own environment are not
                    affected. This can be switched back.
                </span>
            ),
            okText: 'Go live',
            okButtonProps: { danger: true },
            onOk: () => envMut.mutateAsync(target),
        });
    };

    const branchColumns: ColumnsType<CourierBranchKeyStatus> = [
        {
            title: 'Branch',
            key: 'branch',
            render: (_, r) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{r.branch_name}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {r.branch_code}
                    </Text>
                    {/* Who last touched this branch's keys. The key itself is
                        not recoverable; who changed it is. */}
                    {r.set_at && (
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            {dayjs(r.set_at).format('DD MMM YYYY')}
                            {r.set_by ? ` · ${r.set_by}` : ''}
                        </Text>
                    )}
                </Space>
            ),
        },
        {
            title: 'Books in',
            key: 'env',
            width: 200,
            render: (_, r) => (
                <Space direction="vertical" size={2}>
                    <Segmented
                        size="small"
                        value={r.environment_override ?? 'follow'}
                        onChange={(v) =>
                            branchEnvMut.mutate({
                                branchId: r.branch_id,
                                environment: v === 'follow' ? null : (v as Env),
                            })
                        }
                        options={[
                            { label: 'Follow', value: 'follow' },
                            { label: 'Sandbox', value: 'test' },
                            { label: 'Live', value: 'live' },
                        ]}
                    />
                    <Text type="secondary" style={{ fontSize: 11 }}>
                        {r.effective_environment} · {r.key_source} key
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Own sandbox key',
            key: 'test',
            width: 180,
            render: (_, r) => (
                <Space size={4}>
                    {r.test_key_set ? (
                        <Text code style={{ fontSize: 12 }}>
                            {r.test_key_masked ?? 'unreadable'}
                        </Text>
                    ) : (
                        <Text type="secondary">—</Text>
                    )}
                    <Button
                        size="small"
                        type="link"
                        onClick={() => {
                            setKeyEdit({
                                environment: 'test',
                                branchId: r.branch_id,
                                title: `${r.branch_name} (sandbox)`,
                            });
                            setDraft('');
                        }}
                    >
                        {r.test_key_set ? 'Replace' : 'Set'}
                    </Button>
                </Space>
            ),
        },
        {
            title: 'Own live key',
            key: 'live',
            width: 180,
            render: (_, r) => (
                <Space size={4}>
                    {r.live_key_set ? (
                        <Text code style={{ fontSize: 12 }}>
                            {r.live_key_masked ?? 'unreadable'}
                        </Text>
                    ) : (
                        <Text type="secondary">—</Text>
                    )}
                    <Button
                        size="small"
                        type="link"
                        onClick={() => {
                            setKeyEdit({
                                environment: 'live',
                                branchId: r.branch_id,
                                title: `${r.branch_name} (live)`,
                            });
                            setDraft('');
                        }}
                    >
                        {r.live_key_set ? 'Replace' : 'Set'}
                    </Button>
                </Space>
            ),
        },
        {
            title: '',
            key: 'test-action',
            width: 90,
            render: (_, r) => (
                <Button
                    size="small"
                    icon={<ThunderboltOutlined />}
                    loading={testing === r.branch_id}
                    onClick={() => runTest(r.branch_id)}
                >
                    Test
                </Button>
            ),
        },
    ];

    return (
        <Card
            size="small"
            loading={isLoading}
            title={
                <Space>
                    <ApiOutlined />
                    <span>SribeesExpress credentials</span>
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
                data && (
                    <>
                        {data.any_key_unreadable && (
                            <Alert
                                type="error"
                                showIcon
                                style={{ marginBottom: 12 }}
                                message="A stored key cannot be decrypted"
                                description="CREDENTIAL_ENCRYPTION_KEY changed since it was saved. Nothing can book until every slot marked unreadable is re-entered."
                            />
                        )}
                        {data.credential_encryption === 'derived' && (
                            <Alert
                                type="warning"
                                showIcon
                                style={{ marginBottom: 12 }}
                                message="Keys are encrypted with a key derived from JWT_SECRET_KEY"
                                description="It works, but rotating the JWT secret would make every stored courier key unreadable. Set a dedicated CREDENTIAL_ENCRYPTION_KEY before storing a live key."
                            />
                        )}
                        {!data.webhook_secret_configured && (
                            <Alert
                                type="warning"
                                showIcon
                                style={{ marginBottom: 12 }}
                                message="No webhook secret on this server"
                                description="SribeesExpress status pushes are all rejected. Orders will only move when the reconciliation sweep runs."
                            />
                        )}

                        <Space wrap style={{ marginBottom: 12 }}>
                            <Text strong>Every branch books in:</Text>
                            <Segmented
                                value={data.environment}
                                onChange={(v) => confirmGoLive(data, v as Env)}
                                options={[
                                    { label: 'Sandbox', value: 'test' },
                                    { label: 'Live', value: 'live' },
                                ]}
                            />
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                unless a branch below is pinned
                            </Text>
                        </Space>

                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
                            {data.environments.map((cfg) => (
                                <EnvironmentCard
                                    key={cfg.environment}
                                    config={cfg}
                                    isDefault={cfg.environment === data.environment}
                                    testing={testing === 'account' && cfg.environment === data.environment}
                                    onTest={() => runTest()}
                                    onEditKey={() => {
                                        setKeyEdit({
                                            environment: cfg.environment,
                                            branchId: null,
                                            title: `every branch (${cfg.environment})`,
                                        });
                                        setDraft('');
                                    }}
                                    onEditUrl={() => {
                                        setUrlEdit({
                                            environment: cfg.environment,
                                            current: cfg.base_url ?? '',
                                        });
                                        setDraft(cfg.base_url ?? '');
                                    }}
                                />
                            ))}
                        </div>

                        <Paragraph type="secondary" style={{ marginBottom: 8 }}>
                            Give a branch its own key only when it holds its own SribeesExpress
                            merchant account — its pickup locations and COD ledger then live
                            there too, so re-run the pickup-location sync after changing one.
                        </Paragraph>
                        <Table
                            columns={branchColumns}
                            dataSource={data.branches}
                            rowKey="branch_id"
                            size="small"
                            pagination={false}
                            scroll={{ x: true }}
                        />
                    </>
                )
            )}

            <Modal
                title={`Set the SribeesExpress key for ${keyEdit?.title ?? ''}`}
                open={!!keyEdit}
                onCancel={() => setKeyEdit(null)}
                onOk={saveKey}
                okText="Save key"
                confirmLoading={keyMut.isPending}
            >
                <Paragraph type="secondary">
                    Paste the merchant key from SribeesExpress. It is encrypted before it is
                    stored and this screen will only ever show it masked again, so keep your own
                    copy. Leave it empty to clear the slot.
                </Paragraph>
                <Input.Password
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={keyEdit?.environment === 'live' ? 'sk_live_…' : 'sk_test_…'}
                    autoFocus
                />
                {draft.trim().startsWith('sk_live_') && (
                    <Alert
                        type="warning"
                        showIcon
                        style={{ marginTop: 12 }}
                        message="This is a LIVE key"
                        description="Real parcels and real cash collection for this scope."
                    />
                )}
            </Modal>

            <Modal
                title={`SribeesExpress ${urlEdit?.environment ?? ''} host`}
                open={!!urlEdit}
                onCancel={() => setUrlEdit(null)}
                onOk={() =>
                    urlEdit && urlMut.mutate({ environment: urlEdit.environment, value: draft.trim() })
                }
                okText="Save host"
                confirmLoading={urlMut.isPending}
            >
                <Paragraph type="secondary">
                    The origin only — <Text code>https://devapiexpress.sribees.com</Text>. The
                    backend adds <Text code>/api/v1/ecommerce</Text> itself; including it here
                    doubles the path and every call fails.
                </Paragraph>
                <Input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="https://…"
                    autoFocus
                />
            </Modal>
        </Card>
    );
};

export default CourierKeysCard;
