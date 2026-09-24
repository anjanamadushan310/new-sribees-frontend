/**
 * Branch Management (Super Admin only)
 * Ant Design table with a create/edit modal, backed by TanStack Query against
 * /api/v1/admin/branches.
 *
 * Province → District are dependent dropdowns describing where the branch
 * physically IS. They do NOT constrain what it DELIVERS to: "Coverage Areas" is
 * a multi-select over the entire national Postal City directory
 * (/admin/locations), because a branch near a district border routinely serves
 * postal cities on the other side of it. The selected district only decides
 * ordering — its postal cities are grouped at the top, with every other district
 * grouped beneath.
 *
 * Selected postal cities are sent as `coverage_postal_cities: string[]` and the
 * backend syncs PostalCityBranchMapping.
 */
import React, { useState } from 'react';
import {
    Card,
    Table,
    Button,
    Space,
    Tag,
    Input,
    Select,
    Modal,
    Form,
    Switch,
    Popconfirm,
    App,
    Typography,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    SearchOutlined,
    ShopOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { branchesApi } from '../../api/branches.api';
import type { Branch, BranchPayload } from '../../api/branches.api';
import { locationsApi } from '../../api/locations.api';
import { SL_PROVINCES, districtsForProvince } from '../../data/slLocations';

const { Title, Text } = Typography;
const { TextArea } = Input;

const BRANCHES_KEY = ['admin', 'branches'];

interface BranchFormValues {
    name: string;
    code: string;
    address?: string;
    province: string;
    district?: string;
    coverage_postal_cities?: string[];
    phone?: string;
    is_active?: boolean;
}

const uniq = (arr: (string | null | undefined)[]): string[] =>
    Array.from(new Set(arr.filter((s): s is string => !!s)));

const BranchList: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [form] = Form.useForm<BranchFormValues>();

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<Branch | null>(null);
    const [search, setSearch] = useState('');

    // Watch province/district so the dependent dropdowns + coverage query react.
    const provinceValue = Form.useWatch('province', form);
    const districtValue = Form.useWatch('district', form);

    const { data: branches = [], isLoading, isError } = useQuery({
        queryKey: BRANCHES_KEY,
        queryFn: branchesApi.list,
    });

    // Every postal area switched on in Settings > Service Areas — deliberately
    // not filtered by the branch's district. A branch near a district border
    // routinely delivers across it, so coverage is a logistics decision, not a
    // consequence of the branch's own address. The district only decides how
    // the list is *ordered* below. Postal areas that are not switched on are
    // not offered: opening an area is the Service Areas decision, and this form
    // only says which branch serves it.
    const { data: launchedPostalCities = [], isFetching: poLoading } = useQuery({
        queryKey: ['admin', 'locations', 'launched'],
        queryFn: () => locationsApi.list({ active_only: true, launched_only: true }),
        enabled: modalOpen,
    });
    // What the branch already covers stays listed even if it has since been
    // switched off, so saving an edit never silently drops it. Customers are
    // not offered those until the postal area is switched back on.
    const postalCities = React.useMemo(() => {
        const known = new Set(launchedPostalCities.map((p) => p.postal_city));
        const kept = (editing?.coverage_postal_cities ?? [])
            .filter((name) => !known.has(name))
            .map((name) => ({
                id: name,
                postal_city: name,
                district: 'Switched off in Service Areas',
                province: '',
                is_active: true,
                is_launched: false,
            }));
        return [...launchedPostalCities, ...kept];
    }, [launchedPostalCities, editing]);

    const invalidate = () => {
        queryClient.invalidateQueries({ queryKey: BRANCHES_KEY });
    };

    const createMutation = useMutation({
        mutationFn: (payload: BranchPayload) => branchesApi.create(payload),
        onSuccess: () => {
            message.success('Branch created.');
            closeModal();
            invalidate();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to create branch.'),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: Partial<BranchPayload> }) =>
            branchesApi.update(id, payload),
        onSuccess: () => {
            message.success('Branch updated.');
            closeModal();
            invalidate();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to update branch.'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => branchesApi.remove(id),
        onSuccess: () => {
            message.success('Branch deleted.');
            invalidate();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to delete branch.'),
    });

    const openCreate = () => {
        setEditing(null);
        form.resetFields();
        setModalOpen(true);
    };

    const openEdit = (branch: Branch) => {
        setEditing(branch);
        form.setFieldsValue({
            name: branch.name,
            code: branch.code,
            address: branch.address ?? '',
            province: branch.province,
            district: branch.district ?? undefined,
            coverage_postal_cities: branch.coverage_postal_cities ?? [],
            phone: branch.phone ?? '',
            is_active: branch.is_active,
        });
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditing(null);
        form.resetFields();
    };

    // Province still gates District — a district only exists inside its province.
    // Coverage is deliberately NOT cleared: postal cities are no longer scoped to
    // the branch's district, so a cross-border selection must survive an edit to
    // the branch's own address. Wiping it here is what forced admins back into
    // single-district coverage.
    const onProvinceChange = () => {
        form.setFieldsValue({ district: undefined });
    };

    const handleSubmit = async () => {
        const values = await form.validateFields();
        const payload: BranchPayload = {
            name: values.name.trim(),
            code: values.code.trim(),
            address: values.address?.trim() || null,
            province: values.province.trim(),
            district: values.district?.trim() || null,
            coverage_postal_cities: values.coverage_postal_cities ?? [],
            phone: values.phone?.trim() || null,
        };
        if (editing) {
            // New branches always start inactive (server-enforced) — only an
            // edit carries a meaningful status change.
            payload.is_active = values.is_active ?? true;
            updateMutation.mutate({ id: editing.branch_id, payload });
        } else {
            createMutation.mutate(payload);
        }
    };

    const filtered = branches.filter(
        (b) =>
            b.name.toLowerCase().includes(search.toLowerCase()) ||
            b.code.toLowerCase().includes(search.toLowerCase()) ||
            (b.district ?? '').toLowerCase().includes(search.toLowerCase())
    );

    // Defensive: if a saved branch uses a province/district outside the canonical
    // list, still surface it as an option so the Select shows the current value.
    const provinceOptions = uniq([...SL_PROVINCES, editing?.province]).map((p) => ({
        label: p,
        value: p,
    }));
    const districtOptions = uniq([
        ...districtsForProvince(provinceValue),
        editing?.district,
    ]).map((d) => ({ label: d, value: d }));
    // Coverage options, grouped so the common case is one click away without
    // hiding the rest of the country:
    //   1. the branch's own district (the 90% case) pinned to the top, then
    //   2. "Other Districts" — every remaining postal city, for border deliveries.
    //
    // Out-of-district entries carry their district in the label ("Panadura ·
    // Kalutara") so an admin can tell them apart and can search by district name.
    // The *value* stays the bare postal-city name, so the `coverage_postal_cities:
    // string[]` payload is byte-for-byte unchanged.
    const postalCityOptions = React.useMemo(() => {
        if (postalCities.length === 0) return [];

        const inDistrict = districtValue
            ? postalCities.filter((po) => po.district === districtValue)
            : [];
        const others = districtValue
            ? postalCities.filter((po) => po.district !== districtValue)
            : postalCities;

        const groups: {
            label: string;
            options: { label: string; value: string }[];
        }[] = [];

        if (inDistrict.length > 0) {
            groups.push({
                label: districtValue as string,
                options: inDistrict.map((po) => ({
                    label: po.postal_city,
                    value: po.postal_city,
                })),
            });
        }

        if (others.length > 0) {
            groups.push({
                // With no district chosen there is nothing to contrast against,
                // so the whole directory is simply one list.
                label: districtValue ? 'Other Districts' : 'All Postal Cities',
                options: others.map((po) => ({
                    label: `${po.postal_city} · ${po.district}`,
                    value: po.postal_city,
                })),
            });
        }

        return groups;
    }, [postalCities, districtValue]);

    const columns: ColumnsType<Branch> = [
        {
            title: 'Branch',
            key: 'branch',
            render: (_, record) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{record.name}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        Code: {record.code}
                    </Text>
                </Space>
            ),
            sorter: (a, b) => a.name.localeCompare(b.name),
        },
        {
            title: 'Location',
            key: 'location',
            render: (_, record) => (
                <Space direction="vertical" size={0}>
                    <Text>
                        {record.district || '—'}
                        {record.province ? `, ${record.province}` : ''}
                    </Text>
                    {record.address && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {record.address}
                        </Text>
                    )}
                </Space>
            ),
        },
        {
            title: 'Coverage',
            key: 'coverage',
            render: (_, record) => {
                const pos = record.coverage_postal_cities ?? [];
                if (pos.length === 0) return <Text type="secondary">—</Text>;
                const shown = pos.slice(0, 2);
                return (
                    <Space size={4} wrap>
                        {shown.map((po) => (
                            <Tag key={po} color="blue" style={{ marginInlineEnd: 0 }}>
                                {po}
                            </Tag>
                        ))}
                        {pos.length > shown.length && (
                            <Tag>+{pos.length - shown.length}</Tag>
                        )}
                    </Space>
                );
            },
        },
        {
            title: 'Phone',
            dataIndex: 'phone',
            key: 'phone',
            render: (phone: string | null) => phone || <span style={{ color: '#bbb' }}>—</span>,
        },
        {
            title: 'Status',
            dataIndex: 'is_active',
            key: 'is_active',
            width: 110,
            render: (active: boolean) => (
                <Tag color={active ? 'green' : 'default'}>{active ? 'Active' : 'Inactive'}</Tag>
            ),
            filters: [
                { text: 'Active', value: true },
                { text: 'Inactive', value: false },
            ],
            onFilter: (val, record) => record.is_active === val,
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 170,
            render: (_, record) => (
                <Space>
                    <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                        Edit
                    </Button>
                    <Popconfirm
                        title="Delete branch"
                        description="Branches with admins, inventory or mappings can't be deleted."
                        okText="Delete"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => deleteMutation.mutate(record.branch_id)}
                    >
                        <Button type="link" danger icon={<DeleteOutlined />}>
                            Delete
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div>
            <div
                style={{
                    marginBottom: 16,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}
            >
                <Title level={3} style={{ margin: 0 }}>
                    <Space>
                        <ShopOutlined />
                        Branches
                    </Space>
                </Title>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                    Add Branch
                </Button>
            </div>

            <Card>
                <Input
                    placeholder="Search by name, code or city"
                    allowClear
                    prefix={<SearchOutlined />}
                    style={{ width: 320, marginBottom: 16 }}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />

                <Table
                    rowKey="branch_id"
                    columns={columns}
                    dataSource={filtered}
                    loading={isLoading}
                    locale={{ emptyText: isError ? 'Failed to load branches.' : 'No branches yet.' }}
                    pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `Total ${t} branches` }}
                />
            </Card>

            <Modal
                title={editing ? 'Edit Branch' : 'New Branch'}
                open={modalOpen}
                onOk={handleSubmit}
                onCancel={closeModal}
                okText={editing ? 'Save' : 'Create'}
                confirmLoading={createMutation.isPending || updateMutation.isPending}
                destroyOnHidden
                width={560}
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        label="Branch Name"
                        name="name"
                        rules={[{ required: true, message: 'Name is required' }]}
                    >
                        <Input placeholder="e.g. Colombo Central" />
                    </Form.Item>

                    <Form.Item
                        label="Branch Code"
                        name="code"
                        rules={[
                            { required: true, message: 'Code is required' },
                            { min: 2, message: 'At least 2 characters' },
                        ]}
                    >
                        <Input placeholder="e.g. COL-CTR" />
                    </Form.Item>

                    <Form.Item
                        label="Province"
                        name="province"
                        rules={[{ required: true, message: 'Province is required' }]}
                    >
                        <Select
                            placeholder="Select province"
                            options={provinceOptions}
                            onChange={onProvinceChange}
                            showSearch
                            optionFilterProp="label"
                        />
                    </Form.Item>

                    <Form.Item
                        label="City / District"
                        name="district"
                        extra="Where the branch physically sits. It does not limit coverage — it just floats this district's postal cities to the top of the list below."
                    >
                        <Select
                            placeholder={provinceValue ? 'Select district' : 'Select a province first'}
                            options={districtOptions}
                            // No onChange handler: changing the district now only
                            // re-groups the coverage list, it never clears it.
                            disabled={!provinceValue}
                            allowClear
                            showSearch
                            optionFilterProp="label"
                        />
                    </Form.Item>

                    <Form.Item
                        label="Coverage Areas (Postal Cities)"
                        name="coverage_postal_cities"
                        extra={
                            districtValue
                                ? `Postal areas this branch delivers to. ${districtValue} is listed first, but you can select from any district — border branches often deliver across one. Only postal areas switched on in Settings → Service Areas are listed.`
                                : 'Postal areas this branch delivers to, from anywhere in the country. Only postal areas switched on in Settings → Service Areas are listed.'
                        }
                    >
                        <Select
                            mode="multiple"
                            placeholder="Search and select postal cities"
                            options={postalCityOptions}
                            // Never gated on district: coverage is independent of
                            // the branch's own address.
                            loading={poLoading}
                            allowClear
                            showSearch
                            // Searches the label of every option in BOTH groups —
                            // antd matches within groups, so an out-of-district
                            // postal city is reachable by typing its name (or its
                            // district, which is part of the label).
                            optionFilterProp="label"
                            maxTagCount="responsive"
                            notFoundContent={
                                poLoading
                                    ? 'Loading…'
                                    : 'No postal cities in the directory yet — add them in Settings → Delivery Zones.'
                            }
                        />
                    </Form.Item>

                    <Form.Item label="Address" name="address">
                        <TextArea rows={2} placeholder="Full address" />
                    </Form.Item>

                    <Form.Item label="Phone" name="phone">
                        <Input placeholder="+94 11 234 5678" />
                    </Form.Item>

                    {editing ? (
                        <Form.Item
                            label="Active"
                            name="is_active"
                            valuePropName="checked"
                            extra="New branches always start inactive — only the branch's own manager can bring it live."
                        >
                            <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
                        </Form.Item>
                    ) : (
                        <Text type="secondary" style={{ display: 'block', marginTop: -8 }}>
                            This branch will be created <b>inactive</b>. Its Branch Manager
                            activates it once it's ready to go live.
                        </Text>
                    )}
                </Form>
            </Modal>
        </div>
    );
};

export default BranchList;
