/**
 * Settings → Courier — the SribeesExpress account plumbing.
 *
 * Four things have to be true before a real parcel can be collected, and none
 * of them belong on a checkout path:
 *
 * 1. **Coverage synced.** Our post office directory was hand-seeded and two of
 *    its three names do not match SribeesExpress's spelling. Their matching is
 *    exact, so a mismatch reaches the customer as "not serviceable".
 * 2. **Pickup locations registered.** Unregistered branches book against the
 *    account's default address, which for a multi-branch merchant means the
 *    rider drives to the wrong shop.
 * 3. **Webhook registered.** Its secret is shown once and is what every
 *    inbound status update is verified against.
 * 4. **The sweep runs.** Their webhooks are not retried, so the poll is the
 *    real source of truth.
 *
 * Steps 1–3 are one-time-ish Super Admin actions, which is why this is a
 * checklist rather than a dashboard. Step 4 belongs to an external cron; the
 * button here is for ops after an outage.
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
    PickupLocationSyncResponse,
    PickupLocationSyncResult,
    Remittance,
    WebhookRegistration,
} from '../../api/courier.api';
import { usePermissions } from '../../hooks/usePermissions';

const { Text, Paragraph } = Typography;

const ACTION_COLORS: Record<string, string> = {
    created: 'green',
    updated: 'blue',
    recovered: 'gold',
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
    const [pickup, setPickup] = useState<PickupLocationSyncResponse | null>(null);
    const [webhook, setWebhook] = useState<WebhookRegistration | null>(null);
    const [webhookUrl, setWebhookUrl] = useState('');

    const coverageMut = useMutation({
        mutationFn: () => courierApi.syncCoverage(),
        onSuccess: (res) => {
            setCoverage(res);
            message.success(
                `Coverage synced — ${res.fetched} post offices across ${res.districts_covered.length} district(s).`,
            );
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Coverage sync failed.'),
    });

    const pickupMut = useMutation({
        mutationFn: () => courierApi.syncPickupLocations(),
        onSuccess: (res) => {
            setPickup(res);
            if (res.failed > 0) {
                message.warning(`${res.synced} branch(es) registered, ${res.failed} failed.`);
            } else {
                message.success(`${res.synced} branch(es) registered with SribeesExpress.`);
            }
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Pickup location sync failed.'),
    });

    const sweepMut = useMutation({
        mutationFn: () => courierApi.runSweep(),
        onSuccess: (res) =>
            message.success(
                `Sweep done — ${res.seen} shipment(s) read, ${res.applied} order(s) updated.`,
            ),
        onError: (err: any) => message.error(err.response?.data?.detail || 'Sweep failed.'),
    });

    const webhookMut = useMutation({
        mutationFn: (url: string) => courierApi.registerWebhook(url, 'SRIBEES Online admin'),
        onSuccess: (res) => {
            setWebhook(res);
            message.success('Webhook registered. Copy the secret now — it is never shown again.');
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Webhook registration failed.'),
    });

    // Reads are allowed one role wider than the writes, so they load for a
    // Branch Manager too — they are the ones chasing an overdue payout.
    const { data: codBalance, isLoading: codLoading, refetch: refetchCod, error: codError } = useQuery({
        queryKey: ['admin', 'courier', 'cod-balance'],
        queryFn: () => courierApi.getCodBalance(),
        retry: false,
    });

    const { data: remittances, isLoading: remLoading, error: remError } = useQuery({
        queryKey: ['admin', 'courier', 'remittances'],
        queryFn: () => courierApi.listRemittances(20, 0),
        retry: false,
    });

    const pickupColumns: ColumnsType<PickupLocationSyncResult> = [
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
            title: 'Pickup ID',
            dataIndex: 'pickup_location_id',
            key: 'pickup_location_id',
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
        { title: 'Post Office', dataIndex: 'post_office', key: 'post_office' },
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
                    description="Registering pickup locations, syncing coverage and rotating the webhook secret configure the whole SribeesExpress account, so they are Super Admin actions. You can still see what SribeesExpress owes us below."
                />
            )}

            {isSuperAdmin && (
                <>
                    {/* 1. Coverage */}
                    <Card
                        size="small"
                        title={
                            <Space>
                                <EnvironmentOutlined />
                                <span>1. Post office coverage</span>
                            </Space>
                        }
                        extra={
                            <Button
                                type="primary"
                                icon={<CloudSyncOutlined />}
                                loading={coverageMut.isPending}
                                onClick={() => coverageMut.mutate()}
                            >
                                Sync Coverage
                            </Button>
                        }
                    >
                        <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                            Replaces our hand-typed post office list with SribeesExpress's own, in
                            their spelling. Their matching is exact — our seeded{' '}
                            <Text code>Mathugama</Text> does not match their{' '}
                            <Text code>Matugama</Text>, and the customer sees "not serviceable".
                            Run this before the first live order, and again whenever they configure
                            a new district.
                        </Paragraph>

                        {coverage && (
                            <>
                                <Space size="large" wrap style={{ marginBottom: 12 }}>
                                    <Statistic title="Fetched" value={coverage.fetched} />
                                    <Statistic title="Added" value={coverage.created} />
                                    <Statistic title="Updated" value={coverage.updated} />
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
                                        message="Post offices switched off that customers still use"
                                        description="SribeesExpress does not deliver to these. Any saved address naming one will be refused at checkout until the customer picks a different address — worth reaching out rather than waiting for the complaint."
                                    />
                                )}
                                {coverage.orphaned.length > 0 && (
                                    <Table
                                        columns={orphanColumns}
                                        dataSource={coverage.orphaned}
                                        rowKey={(r) => `${r.district}:${r.post_office}`}
                                        size="small"
                                        pagination={false}
                                    />
                                )}
                            </>
                        )}
                    </Card>

                    {/* 2. Pickup locations */}
                    <Card
                        size="small"
                        title={
                            <Space>
                                <ShopOutlined />
                                <span>2. Branch pickup locations</span>
                            </Space>
                        }
                        extra={
                            <Button
                                type="primary"
                                icon={<CloudSyncOutlined />}
                                loading={pickupMut.isPending}
                                onClick={() => pickupMut.mutate()}
                            >
                                Register Branches
                            </Button>
                        }
                    >
                        <Paragraph type="secondary" style={{ marginBottom: 12 }}>
                            Tells SribeesExpress where a rider collects for each branch. A branch
                            that is not registered still books successfully — the rider is just
                            sent to the account's default address instead, so the parcel is never
                            collected and nothing in the booking says why. Re-run after adding a
                            branch or changing its address.
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
                            SribeesExpress signs every status push with a secret that is shown{' '}
                            <b>exactly once</b>, at registration. Registering again mints a new
                            secret and immediately invalidates the old one, so do it only when the
                            URL changes or the secret is lost.
                        </Paragraph>
                        <Space.Compact style={{ width: '100%', maxWidth: 640 }}>
                            <Input
                                value={webhookUrl}
                                onChange={(e) => setWebhookUrl(e.target.value)}
                                placeholder="https://api.example.com/api/v1/courier/webhooks/shipment-status"
                            />
                            <Button
                                danger
                                loading={webhookMut.isPending}
                                disabled={!webhookUrl.trim().startsWith('https://')}
                                onClick={() => webhookMut.mutate(webhookUrl.trim())}
                            >
                                Register &amp; Mint Secret
                            </Button>
                        </Space.Compact>

                        {webhook && (
                            <Alert
                                type="success"
                                showIcon
                                style={{ marginTop: 12 }}
                                message="Registered — copy the secret now"
                                description={
                                    <>
                                        <Paragraph style={{ marginBottom: 8 }}>
                                            Put this in <Text code>COURIER_WEBHOOK_SECRET</Text> and
                                            redeploy the backend <b>before the next status change</b>,
                                            or every inbound push will fail signature verification.
                                            It cannot be read back.
                                        </Paragraph>
                                        <RawFields value={webhook} />
                                    </>
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
                            re-reads everything that changed since the last run and is what an
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
                    <Button size="small" icon={<ReloadOutlined />} onClick={() => refetchCod()}>
                        Refresh
                    </Button>
                }
                loading={codLoading}
            >
                <Paragraph type="secondary">
                    Cash collected from our customers that has not been paid out to us yet. Their
                    payout runs are triggered by their ops team rather than a scheduler, so this
                    sitting still for days is normal — it is a growing gap with no matching payout
                    that is worth raising.
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
