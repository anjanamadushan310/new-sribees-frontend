/**
 * Service Areas — where SRIBEESonline delivers, opened district by district.
 *
 *   1. Unlock a province   (locked ones show to customers as "Coming soon")
 *   2. Unlock a district   (its postal areas become available to switch on)
 *   3. Switch postal areas on (the branch form then offers them)
 *
 * Which branch serves a postal area is chosen on the branch form, not here.
 * A customer can pick an address only where all three are on AND a branch
 * covers it, and checkout applies the same rule, so what this page shows is
 * exactly what the app offers. Nothing here deletes anything: locking hides, and unlocking again
 * restores exactly what was live.
 */
import React, { useMemo, useState } from 'react';
import {
    Alert,
    Badge,
    Button,
    Card,
    Col,
    Empty,
    Input,
    Modal,
    Row,
    Segmented,
    Space,
    Spin,
    Statistic,
    Switch,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    CheckCircleFilled,
    ClockCircleOutlined,
    EnvironmentOutlined,
    LockOutlined,
    SearchOutlined,
    SyncOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    serviceAreasApi,
    type CourierState,
    type DistrictRollout,
    type PostalArea,
    type ProvinceRollout,
    type RolloutOverview,
} from '../../api/serviceAreas.api';
import { courierApi } from '../../api/courier.api';

const { Title, Text, Paragraph } = Typography;

const OVERVIEW = ['service-areas'];
const areasKey = (district: string) => ['service-areas', 'district', district];

function serverMessage(err: unknown, fallback: string): string {
    const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
    return typeof detail === 'string' ? detail : fallback;
}

// ---------------------------------------------------------------------------
// Status tags — the same three words everywhere on the page
// ---------------------------------------------------------------------------

function StateTag({ unlocked, live }: { unlocked: boolean; live: boolean }) {
    if (live) return <Tag color="success" icon={<CheckCircleFilled />}>Live</Tag>;
    if (unlocked)
        return (
            <Tooltip title="Unlocked, but nothing is active in it yet, so customers still see Coming soon.">
                <Tag color="gold">Unlocked · not live</Tag>
            </Tooltip>
        );
    return <Tag icon={<ClockCircleOutlined />}>Coming soon</Tag>;
}

const COURIER: Record<CourierState, { color: string; label: string; hint: string }> = {
    linked: { color: 'green', label: 'Linked', hint: 'Matched to SribeesExpress. Delivery can be priced.' },
    not_linked: {
        color: 'orange',
        label: 'Not linked',
        hint: 'Not matched to SribeesExpress yet. Run "Sync with SribeesExpress"; until then checkout cannot price delivery here.',
    },
    not_served: {
        color: 'red',
        label: 'Not served',
        hint: 'SribeesExpress does not deliver here yet, so it cannot be activated.',
    },
    unknown: { color: 'default', label: 'Unknown', hint: 'Not in the postal city directory.' },
};

// ---------------------------------------------------------------------------
// Left: provinces and their districts
// ---------------------------------------------------------------------------

const ProvinceCard: React.FC<{
    province: ProvinceRollout;
    selected: string | null;
    onSelect: (district: string) => void;
    onProvince: (p: ProvinceRollout, on: boolean) => void;
    onDistrict: (d: DistrictRollout, p: ProvinceRollout, on: boolean) => void;
    busy: boolean;
}> = ({ province, selected, onSelect, onProvince, onDistrict, busy }) => (
    <div
        style={{
            border: '1px solid #f0f0f0',
            borderRadius: 12,
            marginBottom: 10,
            background: province.is_unlocked ? '#fff' : '#fafafa',
        }}
    >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
                <Text strong>{province.name}</Text>
                <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                    {province.displayName.si}
                </Text>
            </div>
            <StateTag unlocked={province.is_unlocked} live={province.live} />
            <Tooltip title={province.is_unlocked ? 'Lock province' : 'Unlock province'}>
                <Switch
                    size="small"
                    checked={province.is_unlocked}
                    disabled={busy}
                    onChange={(on) => onProvince(province, on)}
                />
            </Tooltip>
        </div>
        <div style={{ borderTop: '1px solid #f5f5f5' }}>
            {province.districts.map((d) => {
                const isSelected = selected === d.name;
                return (
                    <div
                        key={d.name}
                        onClick={() => onSelect(d.name)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 14px 8px 26px',
                            cursor: 'pointer',
                            background: isSelected ? '#fff0f6' : undefined,
                            borderLeft: `3px solid ${isSelected ? '#d81b60' : 'transparent'}`,
                        }}
                    >
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontWeight: isSelected ? 700 : 500 }}>{d.name}</Text>
                            <div style={{ fontSize: 12, color: '#8c8c97' }}>
                                {d.active} active of {d.postal_total}
                                {d.needs_branch > 0 && (
                                    <span style={{ color: '#d48806' }}> · {d.needs_branch} need a branch</span>
                                )}
                            </div>
                        </div>
                        {d.live ? (
                            <Badge status="success" text="Live" />
                        ) : d.is_unlocked ? (
                            <Badge status="warning" text="Not live" />
                        ) : null}
                        <Tooltip
                            title={
                                !province.is_unlocked
                                    ? `Unlock ${province.name} province first`
                                    : d.is_unlocked
                                      ? 'Lock district'
                                      : 'Unlock district'
                            }
                        >
                            <span onClick={(e) => e.stopPropagation()}>
                                <Switch
                                    size="small"
                                    checked={d.is_unlocked}
                                    disabled={busy || (!province.is_unlocked && !d.is_unlocked)}
                                    onChange={(on) => onDistrict(d, province, on)}
                                />
                            </span>
                        </Tooltip>
                    </div>
                );
            })}
        </div>
    </div>
);

// ---------------------------------------------------------------------------
// What a customer sees in the Province dropdown right now
// ---------------------------------------------------------------------------

const CustomerPreview: React.FC<{ overview: RolloutOverview }> = ({ overview }) => (
    <Card size="small" title="What customers see" style={{ marginTop: 12 }}>
        <Text type="secondary" style={{ fontSize: 12 }}>
            Province dropdown in the app
        </Text>
        <div style={{ marginTop: 8, border: '1px solid #f0f0f0', borderRadius: 10, overflow: 'hidden' }}>
            {overview.provinces.map((p) => (
                <div
                    key={p.name}
                    style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '6px 12px',
                        borderBottom: '1px solid #fafafa',
                        color: p.live ? '#1a1a22' : '#b0adb6',
                    }}
                >
                    <span>{p.name}</span>
                    {!p.live && (
                        <Tag bordered={false} style={{ marginRight: 0, fontSize: 11 }}>
                            Coming soon
                        </Tag>
                    )}
                </div>
            ))}
        </div>
    </Card>
);

// ---------------------------------------------------------------------------
// Right: one district's postal areas
// ---------------------------------------------------------------------------

const DistrictPanel: React.FC<{
    district: DistrictRollout;
    province: ProvinceRollout;
    onUnlock: () => void;
}> = ({ district, province, onUnlock }) => {
    const queryClient = useQueryClient();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');
    const [selectedKeys, setSelectedKeys] = useState<React.Key[]>([]);

    const { data, isLoading } = useQuery({
        queryKey: areasKey(district.name),
        queryFn: () => serviceAreasApi.postalAreas(district.name),
    });

    const refresh = () => {
        queryClient.invalidateQueries({ queryKey: areasKey(district.name) });
        queryClient.invalidateQueries({ queryKey: OVERVIEW });
    };

    const activate = useMutation({
        mutationFn: (names: string[]) => serviceAreasApi.activate(district.name, names),
        onSuccess: (r) => {
            if (r.activated.length)
                message.success(
                    `${r.activated.length} postal area(s) switched on. Branches can now cover them.`
                );
            r.skipped.forEach((s) => message.warning(`${s.postal_city}: ${s.reason}`));
            setSelectedKeys([]);
            refresh();
        },
        onError: (e) => message.error(serverMessage(e, 'Could not activate.')),
    });

    const deactivate = useMutation({
        mutationFn: (names: string[]) => serviceAreasApi.deactivate(names),
        onSuccess: (n) => {
            message.success(`${n} postal area(s) switched off.`);
            setSelectedKeys([]);
            refresh();
        },
        onError: (e) => message.error(serverMessage(e, 'Could not switch off.')),
    });

    const rows = useMemo(() => {
        const q = search.trim().toLowerCase();
        return (data?.postal_areas ?? []).filter(
            (r) =>
                (!q || r.postal_city.toLowerCase().includes(q)) &&
                (filter === 'all' || (filter === 'active') === r.is_active)
        );
    }, [data, search, filter]);


    const columns: ColumnsType<PostalArea> = [
        { title: 'Postal area', dataIndex: 'postal_city', sorter: (a, b) => a.postal_city.localeCompare(b.postal_city) },
        {
            title: 'Courier',
            dataIndex: 'courier',
            width: 120,
            render: (c: CourierState) => (
                <Tooltip title={COURIER[c].hint}>
                    <Tag color={COURIER[c].color}>{COURIER[c].label}</Tag>
                </Tooltip>
            ),
        },
        {
            title: 'Branch',
            dataIndex: 'branch_name',
            // Read-only: a postal area is given its branch on the branch form.
            render: (name: string | null, row) =>
                name ? (
                    name
                ) : row.is_active ? (
                    <Tooltip title="Switched on, but no branch covers it yet, so customers do not see it. Add it in Branches → Edit → Coverage Areas.">
                        <Tag color="gold">Needs a branch</Tag>
                    </Tooltip>
                ) : (
                    <Text type="secondary">—</Text>
                ),
        },
        {
            title: 'Saved addresses',
            dataIndex: 'saved_addresses',
            width: 130,
            align: 'right',
            sorter: (a, b) => a.saved_addresses - b.saved_addresses,
        },
        {
            title: 'Active',
            dataIndex: 'is_active',
            width: 90,
            align: 'center',
            render: (on: boolean, row) => (
                <Switch
                    size="small"
                    checked={on}
                    disabled={!district.is_unlocked || row.courier === 'not_served'}
                    loading={activate.isPending || deactivate.isPending}
                    onChange={(next) =>
                        next ? activate.mutate([row.postal_city]) : deactivate.mutate([row.postal_city])
                    }
                />
            ),
        },
    ];

    const selectedNames = selectedKeys.map(String);
    const activeCount = data?.postal_areas.filter((r) => r.is_active).length ?? 0;

    return (
        <Card
            title={
                <Space>
                    <EnvironmentOutlined />
                    <span>{district.name} district</span>
                    <Text type="secondary" style={{ fontWeight: 400 }}>
                        {province.name}
                    </Text>
                </Space>
            }
            extra={<StateTag unlocked={district.is_unlocked && province.is_unlocked} live={district.live} />}
        >
            {!district.is_unlocked ? (
                <Empty
                    image={<LockOutlined style={{ fontSize: 48, color: '#bfbfbf' }} />}
                    description={
                        <span>
                            {district.name} is locked, so customers see it as Coming soon.
                            <br />
                            Unlock it to start switching on its {district.postal_total} postal areas.
                        </span>
                    }
                >
                    <Button type="primary" onClick={onUnlock} disabled={!province.is_unlocked}>
                        Unlock {district.name}
                    </Button>
                    {!province.is_unlocked && (
                        <div style={{ marginTop: 8 }}>
                            <Text type="secondary">Unlock {province.name} province first.</Text>
                        </div>
                    )}
                </Empty>
            ) : (
                <>
                    {district.is_unlocked && activeCount === 0 && (
                        <Alert
                            type="warning"
                            showIcon
                            style={{ marginBottom: 12 }}
                            message="Unlocked, but not live yet"
                            description="Switch on the postal areas you serve, then add them to a branch in Branches → Coverage Areas."
                        />
                    )}
                    {district.needs_branch > 0 && (
                        <Alert
                            type="info"
                            showIcon
                            style={{ marginBottom: 12 }}
                            message={`${district.needs_branch} switched-on postal area(s) have no branch yet`}
                            description="Customers see a postal area once a branch covers it. Add them in Branches → Edit → Coverage Areas; only switched-on postal areas are listed there."
                        />
                    )}
                    <Space wrap style={{ marginBottom: 12, width: '100%', justifyContent: 'space-between' }}>
                        <Space wrap>
                            <Input
                                allowClear
                                prefix={<SearchOutlined />}
                                placeholder="Search postal areas"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                style={{ width: 220 }}
                            />
                            <Segmented
                                value={filter}
                                onChange={(v) => setFilter(v as typeof filter)}
                                options={[
                                    { label: 'All', value: 'all' },
                                    { label: `Active (${activeCount})`, value: 'active' },
                                    { label: 'Inactive', value: 'inactive' },
                                ]}
                            />
                        </Space>
                        <Space wrap>
                            <Button
                                type="primary"
                                disabled={!selectedNames.length}
                                loading={activate.isPending}
                                onClick={() => activate.mutate(selectedNames)}
                            >
                                Activate {selectedNames.length ? `(${selectedNames.length})` : ''}
                            </Button>
                            <Button
                                disabled={!selectedNames.length}
                                loading={deactivate.isPending}
                                onClick={() => deactivate.mutate(selectedNames)}
                            >
                                Deactivate
                            </Button>
                        </Space>
                    </Space>
                    <Table<PostalArea>
                        rowKey="postal_city"
                        size="small"
                        loading={isLoading}
                        dataSource={rows}
                        columns={columns}
                        pagination={{ pageSize: 50, showSizeChanger: false, hideOnSinglePage: true }}
                        rowSelection={{
                            selectedRowKeys: selectedKeys,
                            onChange: setSelectedKeys,
                            getCheckboxProps: (r) => ({ disabled: r.courier === 'not_served' }),
                        }}
                    />
                </>
            )}
        </Card>
    );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const ServiceAreas: React.FC = () => {
    const queryClient = useQueryClient();
    const [selected, setSelected] = useState<string | null>(null);

    const { data: overview, isLoading } = useQuery({ queryKey: OVERVIEW, queryFn: serviceAreasApi.overview });

    const settle = (data: RolloutOverview) => queryClient.setQueryData(OVERVIEW, data);

    const provinceMutation = useMutation({
        mutationFn: ({ name, on }: { name: string; on: boolean }) => serviceAreasApi.setProvince(name, on),
        onSuccess: settle,
        onError: (e) => message.error(serverMessage(e, 'Could not change the province.')),
    });
    const districtMutation = useMutation({
        mutationFn: ({ name, on }: { name: string; on: boolean }) => serviceAreasApi.setDistrict(name, on),
        onSuccess: (data, v) => {
            settle(data);
            queryClient.invalidateQueries({ queryKey: areasKey(v.name) });
        },
        onError: (e) => message.error(serverMessage(e, 'Could not change the district.')),
    });

    const sync = useMutation({
        mutationFn: courierApi.syncPostalCities,
        onSuccess: (r) => {
            message.success(
                `Synced ${r.fetched} postal cities from SribeesExpress: ${r.created} added, ${r.updated} updated, ${r.deactivated} not served.`
            );
            queryClient.invalidateQueries({ queryKey: ['service-areas'] });
        },
        onError: (e) => message.error(serverMessage(e, 'Could not reach SribeesExpress.')),
    });

    // Locking is the one change that takes something away from customers, so
    // it says exactly what, with numbers, before it happens.
    const confirmLock = (what: string, active: number, addresses: number, run: () => void) => {
        if (active === 0) return run();
        Modal.confirm({
            title: `Lock ${what}?`,
            content: (
                <span>
                    {active} active postal area(s) stop being offered, and customers with {addresses} saved
                    address(es) there cannot check out until it is unlocked again. Their active postal areas
                    are kept and come back when you unlock.
                </span>
            ),
            okText: 'Lock',
            okButtonProps: { danger: true },
            onOk: run,
        });
    };

    const onProvince = (p: ProvinceRollout, on: boolean) => {
        const run = () => provinceMutation.mutate({ name: p.name, on });
        if (on) return run();
        const active = p.districts.filter((d) => d.is_unlocked).reduce((n, d) => n + d.active, 0);
        const addresses = p.districts.reduce((n, d) => n + d.saved_addresses, 0);
        confirmLock(`${p.name} province`, active, addresses, run);
    };

    const onDistrict = (d: DistrictRollout, _p: ProvinceRollout, on: boolean) => {
        const run = () => districtMutation.mutate({ name: d.name, on });
        if (on) {
            setSelected(d.name);
            return run();
        }
        confirmLock(`${d.name} district`, d.active, d.saved_addresses, run);
    };

    if (isLoading || !overview) return <Spin />;

    const t = overview.totals;
    const firstUnlocked = overview.provinces.flatMap((p) => p.districts).find((d) => d.is_unlocked);
    const current = selected ?? firstUnlocked?.name ?? overview.provinces[0]?.districts[0]?.name ?? null;
    const currentProvince = overview.provinces.find((p) => p.districts.some((d) => d.name === current));
    const currentDistrict = currentProvince?.districts.find((d) => d.name === current);
    const busy = provinceMutation.isPending || districtMutation.isPending;

    return (
        <div style={{ maxWidth: 1400, margin: '0 auto' }}>
            <Title level={3} style={{ marginBottom: 4 }}>
                <EnvironmentOutlined style={{ marginRight: 8 }} />
                Service Areas
            </Title>
            <Paragraph type="secondary" style={{ maxWidth: 820 }}>
                Open delivery one district at a time: unlock a province, unlock a district, then switch on the
                postal areas you serve. Switched-on postal areas are what the branch form offers under Coverage
                Areas, and a postal area goes live once a branch covers it. Locked provinces and districts appear
                in the app as <b>Coming soon</b>, and checkout follows the same rules.
            </Paragraph>

            <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                <Col xs={12} md={6}>
                    <Card size="small">
                        <Statistic title="Provinces live" value={t.provinces_live} suffix={`/ ${t.provinces}`} />
                    </Card>
                </Col>
                <Col xs={12} md={6}>
                    <Card size="small">
                        <Statistic title="Districts live" value={t.districts_live} suffix={`/ ${t.districts}`} />
                    </Card>
                </Col>
                <Col xs={12} md={6}>
                    <Card size="small">
                        <Statistic
                            title="Postal areas live"
                            value={t.postal_serving}
                            suffix={`/ ${t.postal_active} switched on`}
                        />
                    </Card>
                </Col>
                <Col xs={12} md={6}>
                    <Card size="small">
                        <Statistic
                            title="Linked to SribeesExpress"
                            value={t.courier_linked}
                            suffix={`/ ${t.postal_total.toLocaleString()}`}
                        />
                        <Button
                            size="small"
                            icon={<SyncOutlined />}
                            loading={sync.isPending}
                            onClick={() => sync.mutate()}
                            style={{ marginTop: 6 }}
                        >
                            Sync with SribeesExpress
                        </Button>
                    </Card>
                </Col>
            </Row>

            <Row gutter={16}>
                <Col xs={24} lg={8}>
                    {overview.provinces.map((p) => (
                        <ProvinceCard
                            key={p.name}
                            province={p}
                            selected={current}
                            onSelect={setSelected}
                            onProvince={onProvince}
                            onDistrict={onDistrict}
                            busy={busy}
                        />
                    ))}
                    <CustomerPreview overview={overview} />
                </Col>
                <Col xs={24} lg={16}>
                    {currentDistrict && currentProvince ? (
                        <DistrictPanel
                            key={currentDistrict.name}
                            district={currentDistrict}
                            province={currentProvince}
                            onUnlock={() => onDistrict(currentDistrict, currentProvince, true)}
                        />
                    ) : (
                        <Empty description="Choose a district" />
                    )}
                </Col>
            </Row>
        </div>
    );
};

export default ServiceAreas;
