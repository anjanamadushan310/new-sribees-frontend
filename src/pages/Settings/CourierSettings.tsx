/**
 * Settings -> Courier -- the SribeesExpress account plumbing.
 *
 * Every branch is its own SribeesExpress client with its own API key. Four
 * things have to be true before a real parcel can be collected:
 *
 * 1. **Postal cities synced.** Customer addresses are priced by SribeesExpress
 *    postal city id; a name we cannot match reaches the customer as
 *    "not serviceable".
 * 2. **Outlets registered.** Each branch's outlet postal city is the origin
 *    every cart quote is priced from, and where the rider collects.
 * 3. **Webhook registered per account.** The secret is stored encrypted by the
 *    backend and never shown.
 * 4. **The sweep runs.** Their webhooks are not retried, so the poll across
 *    every branch account is the real source of truth.
 */
import React, { useState } from 'react';
import {
    Alert,
    App,
    Button,
    Card,
    Descriptions,
    Empty,
    Input,
    Select,
    Space,
    Statistic,
    Table,
    Tag,
    Typography,
} from 'antd';
import {
    CloudSyncOutlined,
    EnvironmentOutlined,
    ReloadOutlined,
    ShopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery } from '@tanstack/react-query';
import { courierApi } from '../../api/courier.api';
import type {
    CoverageOrphan,
    CoverageSyncResponse,
    CoverageSkipped,
    OutletSyncResponse,
    OutletSyncResult,
    Remittance,
    WebhookRegistration,
} from '../../api/courier.api';
import { usePermissions } from '../../hooks/usePermissions';
import CourierKeysCard from './CourierKeysCard';

const { Text, Paragraph } = Typography;

const ACTION_COLORS: Record<string, string> = {
    created: 'green',
    updated: 'blue',
    recovered: 'gold',
    own_account: 'cyan',
    skipped: 'default',
    failed: 'red',
};

/** Render an unknown-shape object as a definition list rather than guessing a schema. */
const RawFields: React.FC<{ value: Record<string, unknown> }> = ({ value }) => {
    const entries = Object.entries(value ?? {});
    if (entries.length === 0) return <Empty description="Nothing reported" />;
    return (
        <Descriptions column={1} size="small" bordered>
            {entries.map(([k, v]) => (
                <Descriptions.Item key={k} label={k.replace(/_/g, ' ')}>
                    {v === null || v === undefined ? (
                        <Text type="secondary">—</Text>
                    ) : typeof v === 'object' ? (
                        <Text code>{JSON.stringify(v)}</Text>
                    ) : (
                        String(v)
                    )}
                </Descriptions.Item>
            ))}
        </Descriptions>
    );
};

const CourierSettings: React.FC = () => {
    const { message } = App.useApp();
    const { isSuperAdmin } = usePermissions();

    const [coverage, setCoverage] = useState<CoverageSyncResponse | null>(null);
    const [pickup, setPickup] = useState<OutletSyncResponse | null>(null);
    const [webhook, setWebhook] = useState<WebhookRegistration | null>(null);
    const [webhookBranchId, setWebhookBranchId] = useState<string | undefined>(undefined);
    // Every branch can be its own SribeesExpress account, so 'what are we owed'
    // has no single answer — it is asked per account.
    const [codBranchId, setCodBranchId] = useState<string | undefined>(undefined);
    // Defaulted from the API base this dashboard already talks to: the
    // endpoint is ours, its path is fixed, and hand-typing it is how a
    // registration ends up pointing at nothing.
    const [webhookUrl, setWebhookUrl] = useState(() => {
        // VITE_API_URL is absolute in a split deployment and relative when the
        // API is proxied under the dashboard's own origin, so both are handled
        // rather than assuming one.
        const base = (import.meta.env.VITE_API_URL as string | undefined) || '';
        const origin = base.startsWith('http')
            ? base.replace(/\/api\/v1\/?$/, '').replace(/\/$/, '')
            : window.location.origin;
        return `${origin}/api/v1/courier/webhooks/shipment-status`;
    });

    const coverageMut = useMutation({
        mutationFn: () => courierApi.syncPostalCities(),
        onSuccess: (res) => {
            setCoverage(res);
            message.success(
                `Postal cities synced — ${res.fetched} across ${res.districts_covered.length} district(s), ${res.addresses_matched} address(es) matched.`,
            );
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Postal city sync failed.'),
    });

    const pickupMut = useMutation({
        mutationFn: () => courierApi.syncOutlets(),
        onSuccess: (res) => {
            setPickup(res);
            if (res.failed > 0) {
                message.warning(`${res.synced} branch(es) registered, ${res.failed} failed.`);
            } else {
                message.success(`${res.synced} branch(es) registered as SribeesExpress outlets.`);
            }
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Outlet sync failed.'),
    });

    const sweepMut = useMutation({
        mutationFn: () => courierApi.runSweep(),
        onSuccess: (res) =>
            message.success(
                `Sweep done — ${res.accounts} account(s), ${res.seen} shipment(s) read, ${res.applied} order(s) updated.`,
            ),
        onError: (err: any) => message.error(err.response?.data?.detail || 'Sweep failed.'),
    });

    const webhookMut = useMutation({
        mutationFn: (url: string) => courierApi.registerWebhook(url, 'SRIBEES Online admin', webhookBranchId),
        onSuccess: (res) => {
            setWebhook(res);
            message.success(
                res.secret_stored
                    ? 'Webhook registered and its secret stored.'
                    : 'Webhook registered, but no secret was returned to store.',
            );
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Webhook registration failed.'),
    });

    const { data: credentials } = useQuery({
        queryKey: ['admin', 'courier', 'credentials'],
        queryFn: () => courierApi.getCredentials(),
        enabled: isSuperAdmin,
        retry: false,
    });

    // Reads are allowed one role wider than the writes, so they load for a
    // Branch Manager too — they are the ones chasing an overdue payout.
    const { data: codBalance, isLoading: codLoading, refetch: refetchCod, error: codError } = useQuery({
        queryKey: ['admin', 'courier', 'cod-balance', codBranchId ?? 'account'],
        queryFn: () => courierApi.getCodBalance(codBranchId),
        retry: false,
    });

    const { data: remittances, isLoading: remLoading, error: remError } = useQuery({
        queryKey: ['admin', 'courier', 'remittances', codBranchId ?? 'account'],
        queryFn: () => courierApi.listRemittances(20, 0, codBranchId),
        retry: false,
    });

    const pickupColumns: ColumnsType<OutletSyncResult> = [
        { title: 'Branch', dataIndex: 'branch_name', key: 'branch_name' },
        { title: 'Code', dataIndex: 'branch_code', key: 'branch_code', width: 90 },
        {
            title: 'Result',
            dataIndex: 'action',
            key: 'action',
            width: 110,
            render: (a: string) => <Tag color={ACTION_COLORS[a] ?? 'default'}>{a}</Tag>,
        },
        {
            title: 'Outlet ID',
            dataIndex: 'outlet_id',
            key: 'outlet_id',
            width: 100,
            render: (v: number | null) => v ?? <Text type="secondary">—</Text>,
        },
        {
            title: 'Detail',
            dataIndex: 'detail',
            key: 'detail',
            render: (d: string | null) => d ?? <Text type="secondary">—</Text>,
        },
    ];

    const orphanColumns: ColumnsType<CoverageOrphan> = [
        { title: 'Postal City', dataIndex: 'postal_city', key: 'postal_city' },
        { title: 'District', dataIndex: 'district', key: 'district' },
        {
            title: 'Saved addresses',
            dataIndex: 'addresses',
            key: 'addresses',
            width: 140,
            render: (n: number) =>
                n > 0 ? <Tag color="red">{n} customer(s) affected</Tag> : <Text type="secondary">none</Text>,
        },
    ];

    const skippedColumns: ColumnsType<CoverageSkipped> = [
        { title: 'Postal City', dataIndex: 'postal_city', key: 'postal_city' },
        { title: 'SribeesExpress district', dataIndex: 'district', key: 'district' },
        { title: 'Our directory has it under', dataIndex: 'held_by_district', key: 'held_by_district' },
    ];

    /** Columns derived from whatever the payout rows actually contain. */
    const remittanceColumns: ColumnsType<Remittance> =
        remittances && remittances.length > 0
            ? Object.keys(remittances[0]).map((key) => ({
                  title: key.replace(/_/g, ' '),
                  dataIndex: key,
                  key,
                  render: (v: unknown) =>
                      v === null || v === undefined ? (
                          <Text type="secondary">—</Text>
                      ) : typeof v === 'object' ? (
                          <Text code>{JSON.stringify(v)}</Text>
                      ) : (
                          String(v)
                      ),
              }))
            : [];

    return (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {!isSuperAdmin && (
                <Alert
                    type="info"
                    showIcon
                    message="Read-only"
                    description="Registering outlets, syncing postal cities and rotating webhook secrets configure the SribeesExpress accounts, so they are Super Admin actions. You can still see what SribeesExpress owes us below."
                />
            )}

            {isSuperAdmin && (
                <>
                    {/* 0. Credentials -- which account anything below even talks to. */}
                    <CourierKeysCard />

                    {/* 1. Coverage */}
                    <Card
                        size="small"
                        title={
                            <Space>
                                <EnvironmentOutlined />
                                <span>1. Postal cities</span>
                            </Space>
                        }
                        extra={
                            <Button
                                type="primary"
                                icon={<CloudSyncOutlined />}
                                loading={coverageMut.isPending}
                                onClick={() => coverageMut.mutate()}
                            >
                                Sync Postal Cities
                            </Button>
                        }
                    >
                        <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                            Pulls SribeesExpress's postal city list and links our directory and
                            every saved customer address to their postal city ids. Cart delivery
                            charges are priced between the branch outlet's postal city and the
                            customer's, so an unmatched address cannot be quoted. Run this before
                            the first live order, and again whenever they add coverage.
                        </Paragraph>

                        {coverage && (
                            <>
                                <Space size="large" wrap style={{ marginBottom: 12 }}>
                                    <Statistic title="Fetched" value={coverage.fetched} />
                                    <Statistic title="Added" value={coverage.created} />
                                    <Statistic title="Updated" value={coverage.updated} />
                                    <Statistic title="Addresses matched" value={coverage.addresses_matched} />
                                    <Statistic title="Re-enabled" value={coverage.reactivated} />
                                    <Statistic
                                        title="Disabled"
                                        value={coverage.deactivated}
                                        valueStyle={coverage.deactivated > 0 ? { color: '#cf1322' } : undefined}
                                    />
                                </Space>
                                <div style={{ marginBottom: 12 }}>
                                    <Text type="secondary">Districts reconciled: </Text>
                                    {coverage.districts_covered.length > 0 ? (
                                        coverage.districts_covered.map((d) => (
                                            <Tag key={d} color="blue">
                                                {d}
                                            </Tag>
                                        ))
                                    ) : (
                                        <Text type="secondary">none</Text>
                                    )}
                                    <div style={{ marginTop: 4 }}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>
                                            Districts SribeesExpress has not configured are left
                                            untouched — only the ones above were reconciled.
                                        </Text>
                                    </div>
                                </div>

                                {coverage.orphaned.length > 0 && (
                                    <Alert
                                        type="warning"
                                        showIcon
                                        style={{ marginBottom: 12 }}
                                        message="Postal cities switched off that customers still use"
                                        description="SribeesExpress does not deliver to these. Any saved address naming one will be refused at checkout until the customer picks a different address — worth reaching out rather than waiting for the complaint."
                                    />
                                )}
                                {coverage.orphaned.length > 0 && (
                                    <Table
                                        columns={orphanColumns}
                                        dataSource={coverage.orphaned}
                                        rowKey={(r) => `${r.district}:${r.postal_city}`}
                                        size="small"
                                        pagination={false}
                                    />
                                )}
                                {coverage.skipped.length > 0 && (
                                    <>
                                        <Alert
                                            type="info"
                                            showIcon
                                            style={{ margin: '12px 0' }}
                                            message="Skipped — same name, different district"
                                            description="These were not linked because our directory holds the name under another district. Fix the district in Delivery Zones and sync again."
                                        />
                                        <Table
                                            columns={skippedColumns}
                                            dataSource={coverage.skipped}
                                            rowKey={(r) => `${r.district}:${r.postal_city}`}
                                            size="small"
                                            pagination={false}
                                        />
                                    </>
                                )}
                            </>
                        )}
                    </Card>

                    {/* 2. Outlets */}
                    <Card
                        size="small"
                        title={
                            <Space>
                                <ShopOutlined />
                                <span>2. Branch outlets</span>
                            </Space>
                        }
                        extra={
                            <Button
                                type="primary"
                                icon={<CloudSyncOutlined />}
                                loading={pickupMut.isPending}
                                onClick={() => pickupMut.mutate()}
                            >
                                Register Outlets
                            </Button>
                        }
                    >
                        <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                            A branch with its own API key is its own SribeesExpress client: quotes
                            are priced from, and riders collect at, the postal city of the address
                            it registered with, so it needs no outlet (<Text code>own_account</Text>).
                            Branches that share the account key are registered as outlets so each
                            is priced and collected from its own postal city. Re-run after adding
                            a branch, changing its address or giving it a new API key.
                        </Paragraph>

                        {pickup && (
                            <Table
                                columns={pickupColumns}
                                dataSource={pickup.results}
                                rowKey="branch_code"
                                size="small"
                                pagination={false}
                            />
                        )}
                    </Card>

                    {/* 3. Webhook */}
                    <Card size="small" title="3. Status webhook">
                        <Paragraph type="secondary">
                            SribeesExpress signs every status push with a per-account secret. The
                            backend stores it encrypted the moment it is minted — it is never shown
                            here. Register once per branch account; registering the same URL again
                            rotates that account's secret.
                        </Paragraph>
                        <Select
                            allowClear
                            placeholder="Account default"
                            style={{ width: '100%', maxWidth: 640, marginBottom: 8 }}
                            value={webhookBranchId}
                            onChange={(v) => setWebhookBranchId(v)}
                            options={(credentials?.branches ?? []).map((b) => ({
                                value: b.branch_id,
                                label: `${b.branch_name} (${b.branch_code}) · ${b.key_source} key${
                                    b.webhook_secret_stored ? ' · secret stored' : ''
                                }`,
                            }))}
                        />
                        <Space.Compact style={{ width: '100%', maxWidth: 640 }}>
                            <Input
                                value={webhookUrl}
                                onChange={(e) => setWebhookUrl(e.target.value)}
                                placeholder="https://api.example.com/api/v1/courier/webhooks/shipment-status"
                                // Chrome autofilled this with the signed-in
                                // admin's email, which is a confusing thing to
                                // find in a field that mints a secret. A URL
                                // type and an explicit name it does not
                                // recognise keep the password manager out.
                                type="url"
                                name="sxp-webhook-endpoint"
                                autoComplete="off"
                            />
                            <Button
                                danger
                                loading={webhookMut.isPending}
                                disabled={!webhookUrl.trim().startsWith('https://')}
                                onClick={() => webhookMut.mutate(webhookUrl.trim())}
                            >
                                Register Webhook
                            </Button>
                        </Space.Compact>

                        {webhook && (
                            <Alert
                                type={webhook.secret_stored ? 'success' : 'warning'}
                                showIcon
                                style={{ marginTop: 12 }}
                                message={
                                    webhook.secret_stored
                                        ? 'Registered — secret stored encrypted'
                                        : 'Registered, but no secret was stored'
                                }
                                description={
                                    <Descriptions column={1} size="small">
                                        <Descriptions.Item label="Endpoint">
                                            {webhook.endpoint_id ?? '—'}
                                        </Descriptions.Item>
                                        <Descriptions.Item label="URL">{webhook.url}</Descriptions.Item>
                                        <Descriptions.Item label="Environment">
                                            {webhook.environment}
                                        </Descriptions.Item>
                                        <Descriptions.Item label="Key">{webhook.key_source}</Descriptions.Item>
                                    </Descriptions>
                                }
                            />
                        )}
                    </Card>

                    {/* 4. Sweep */}
                    <Card
                        size="small"
                        title="4. Reconciliation sweep"
                        extra={
                            <Button
                                icon={<ReloadOutlined />}
                                loading={sweepMut.isPending}
                                onClick={() => sweepMut.mutate()}
                            >
                                Run Sweep Now
                            </Button>
                        }
                    >
                        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                            SribeesExpress does not retry a webhook that fails to reach us, so a
                            missed push is invisible — the order simply stops moving. This sweep
                            re-reads everything that changed since the last run in every branch account and is what an
                            external cron should call every 10–15 minutes. The button is for after
                            an outage.
                        </Paragraph>
                    </Card>
                </>
            )}

            {/* COD — readable by Branch Managers too. */}
            <Card
                size="small"
                title="Cash on delivery held by SribeesExpress"
                extra={
                    <Space>
                        {isSuperAdmin && (
                            <Select
                                allowClear
                                size="small"
                                style={{ minWidth: 220 }}
                                placeholder="Account default"
                                value={codBranchId}
                                onChange={(v) => setCodBranchId(v)}
                                options={(credentials?.branches ?? []).map((b) => ({
                                    value: b.branch_id,
                                    label: `${b.branch_name} (${b.branch_code})`,
                                }))}
                            />
                        )}
                        <Button size="small" icon={<ReloadOutlined />} onClick={() => refetchCod()}>
                            Refresh
                        </Button>
                    </Space>
                }
                loading={codLoading}
            >
                <Paragraph type="secondary">
                    Cash collected from our customers that has not been paid out to us yet, for
                    the SribeesExpress account serving the branch above (leave it empty for the
                    account key). A branch with its own key has its own balance and its own payout
                    runs. Those runs are triggered by their ops team rather than a scheduler, so
                    this sitting still for days is normal — it is a growing gap with no matching
                    payout that is worth raising.
                </Paragraph>
                {codError ? (
                    <Alert
                        type="error"
                        showIcon
                        message="Could not reach SribeesExpress"
                        description={(codError as any)?.response?.data?.detail ?? 'The COD balance is unavailable right now.'}
                    />
                ) : (
                    codBalance && <RawFields value={codBalance} />
                )}
            </Card>

            <Card size="small" title="Payout history" loading={remLoading}>
                {remError ? (
                    <Alert
                        type="error"
                        showIcon
                        message="Could not reach SribeesExpress"
                        description={(remError as any)?.response?.data?.detail ?? 'Remittances are unavailable right now.'}
                    />
                ) : remittances && remittances.length > 0 ? (
                    <Table
                        columns={remittanceColumns}
                        dataSource={remittances}
                        rowKey={(r, i) => String((r as any).remittance_id ?? (r as any).id ?? i)}
                        size="small"
                        pagination={false}
                        scroll={{ x: true }}
                    />
                ) : (
                    <Empty description="No payouts yet" />
                )}
            </Card>
        </Space>
    );
};

export default CourierSettings;
