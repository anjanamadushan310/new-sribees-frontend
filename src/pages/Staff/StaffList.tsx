/**
 * My Staff (any base-role admin) — create/manage delegated staff accounts
 * scoped to a subset of the current admin's own permissions.
 * Data layer is TanStack Query against /api/v1/admin/staff and /admin/roles.
 */
import React, { useMemo, useState } from 'react';
import {
    Card,
    Table,
    Button,
    Space,
    Tag,
    Input,
    Select,
    Radio,
    Checkbox,
    Modal,
    Form,
    App,
    Typography,
    Popconfirm,
    Popover,
    Divider,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    SearchOutlined,
    TeamOutlined,
    StopOutlined,
    CheckCircleOutlined,
    InfoCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { staffApi } from '../../api/staff.api';
import { rolesApi } from '../../api/roles.api';
import { branchesApi } from '../../api/branches.api';
import { useAuthStore } from '../../store/authStore';
import type { StaffUser } from '../../types/roles.types';

const { Title, Text } = Typography;

const STAFF_KEY = ['admin', 'staff'];
const ROLES_KEY = ['admin', 'roles'];
const CATALOG_KEY = ['admin', 'permissionCatalog'];

type RoleMode = 'new' | 'reuse';

interface StaffFormValues {
    full_name: string;
    email: string;
    password?: string;
    branch_id?: string;
    role_mode: RoleMode;
    role_id?: string;
    new_role_name?: string;
    permission_ids: string[];
}

const groupByResource = <T extends { resource: string }>(items: T[]): Record<string, T[]> =>
    items.reduce<Record<string, T[]>>((acc, item) => {
        (acc[item.resource] ??= []).push(item);
        return acc;
    }, {});

const StaffList: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const user = useAuthStore((state) => state.user);
    const [form] = Form.useForm<StaffFormValues>();

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<StaffUser | null>(null);
    const [search, setSearch] = useState('');
    const [roleMode, setRoleMode] = useState<RoleMode>('new');

    const { data: staff = [], isLoading, isError } = useQuery({
        queryKey: STAFF_KEY,
        queryFn: staffApi.list,
    });

    const { data: roles = [] } = useQuery({
        queryKey: ROLES_KEY,
        queryFn: rolesApi.list,
        enabled: modalOpen,
    });
    const myCustomRoles = useMemo(() => roles.filter((r) => !r.isSystem), [roles]);

    const { data: catalog } = useQuery({
        queryKey: CATALOG_KEY,
        queryFn: rolesApi.getCatalog,
        enabled: modalOpen,
    });
    const catalogPermissions = catalog?.permissions ?? [];
    const myPermissionIds = useMemo(() => new Set(catalog?.myPermissionIds ?? []), [catalog]);
    const groupedCatalog = useMemo(() => groupByResource(catalogPermissions), [catalogPermissions]);

    // Only a branchless creator (in practice: Super Admin) needs to pick a
    // branch — everyone else's staff default to the creator's own branch.
    const needsBranchPicker = !user?.branch_id;
    const { data: branches = [] } = useQuery({
        queryKey: ['admin', 'branches'],
        queryFn: branchesApi.list,
        enabled: modalOpen && needsBranchPicker,
    });

    const invalidate = () => queryClient.invalidateQueries({ queryKey: STAFF_KEY });

    const createMutation = useMutation({
        mutationFn: staffApi.create,
        onSuccess: () => {
            message.success('Staff account created.');
            closeModal();
            invalidate();
        },
        onError: (err: any) => message.error(err.response?.data?.detail || 'Failed to create staff account.'),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: Parameters<typeof staffApi.update>[1] }) =>
            staffApi.update(id, payload),
        onSuccess: () => {
            message.success('Staff account updated.');
            closeModal();
            invalidate();
        },
        onError: (err: any) => message.error(err.response?.data?.detail || 'Failed to update staff account.'),
    });

    const deactivateMutation = useMutation({
        mutationFn: staffApi.deactivate,
        onSuccess: () => {
            message.success('Staff account deactivated.');
            invalidate();
        },
        onError: (err: any) => message.error(err.response?.data?.detail || 'Failed to deactivate staff account.'),
    });

    const reactivateMutation = useMutation({
        mutationFn: (id: string) => staffApi.update(id, { isActive: true }),
        onSuccess: () => {
            message.success('Staff account activated.');
            invalidate();
        },
        onError: (err: any) => message.error(err.response?.data?.detail || 'Failed to activate staff account.'),
    });

    const openCreate = () => {
        setEditing(null);
        setRoleMode('new');
        form.resetFields();
        form.setFieldsValue({ role_mode: 'new', permission_ids: [] });
        setModalOpen(true);
    };

    const openEdit = (row: StaffUser) => {
        setEditing(row);
        setRoleMode('new'); // reset so edit modal doesn't inherit stale create-mode state
        form.resetFields();
        form.setFieldsValue({
            full_name: row.full_name,
            branch_id: row.branch_id ?? undefined,
            permission_ids: row.permissions.map((p) => p.permissionId),
        });
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditing(null);
        form.resetFields();
    };

    const handleSubmit = async () => {
        const values = await form.validateFields();
        if (editing) {
            updateMutation.mutate({
                id: editing.admin_id,
                payload: {
                    fullName: values.full_name.trim(),
                    // Only touch branch when the picker was actually shown
                    // (branchless creators only) — otherwise the field was
                    // never in the form and sending it would wipe branch_id.
                    ...(needsBranchPicker ? { branchId: values.branch_id || null } : {}),
                    ...(values.password ? { password: values.password } : {}),
                    permissionIds: values.permission_ids,
                },
            });
        } else {
            createMutation.mutate({
                fullName: values.full_name.trim(),
                email: values.email.trim(),
                password: values.password!,
                branchId: values.branch_id || null,
                ...(values.role_mode === 'reuse'
                    ? { roleId: values.role_id }
                    : { newRole: { name: values.new_role_name!.trim(), permissionIds: values.permission_ids } }),
            });
        }
    };

    const filtered = staff.filter(
        (s) =>
            s.full_name.toLowerCase().includes(search.toLowerCase()) ||
            s.email.toLowerCase().includes(search.toLowerCase())
    );

    const columns: ColumnsType<StaffUser> = [
        {
            title: 'Staff',
            key: 'user',
            render: (_, record) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{record.full_name}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {record.email}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Role',
            key: 'role',
            render: (_, record) => (
                <Popover
                    title={record.role_name}
                    content={
                        <Space direction="vertical" size={2}>
                            {record.permissions.map((p) => (
                                <Text key={p.permissionId} style={{ fontSize: 12 }}>
                                    {p.resource}:{p.action}
                                </Text>
                            ))}
                            {record.permissions.length === 0 && (
                                <Text type="secondary" style={{ fontSize: 12 }}>No permissions</Text>
                            )}
                        </Space>
                    }
                >
                    <Tag color="geekblue">
                        {record.role_name} <InfoCircleOutlined style={{ marginLeft: 4 }} />
                    </Tag>
                </Popover>
            ),
        },
        {
            title: 'Branch',
            dataIndex: 'branch_name',
            key: 'branch_name',
            render: (name: string | null) => (name ? <Tag>{name}</Tag> : <Text type="secondary">—</Text>),
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
            width: 220,
            render: (_, record) => (
                <Space>
                    <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                        Edit
                    </Button>
                    {record.is_active ? (
                        <Popconfirm
                            title="Deactivate this staff account?"
                            okText="Deactivate"
                            okButtonProps={{ danger: true }}
                            onConfirm={() => deactivateMutation.mutate(record.admin_id)}
                        >
                            <Button type="link" danger icon={<StopOutlined />}>
                                Deactivate
                            </Button>
                        </Popconfirm>
                    ) : (
                        <Button
                            type="link"
                            icon={<CheckCircleOutlined />}
                            onClick={() => reactivateMutation.mutate(record.admin_id)}
                        >
                            Activate
                        </Button>
                    )}
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
                        <TeamOutlined />
                        My Staff
                    </Space>
                </Title>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                    Add Staff
                </Button>
            </div>

            <Card>
                <Input
                    placeholder="Search by name or email"
                    allowClear
                    prefix={<SearchOutlined />}
                    style={{ width: 320, marginBottom: 16 }}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />

                <Table
                    rowKey="admin_id"
                    columns={columns}
                    dataSource={filtered}
                    loading={isLoading}
                    locale={{ emptyText: isError ? 'Failed to load staff.' : 'No staff accounts yet.' }}
                    pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `Total ${t} staff` }}
                />
            </Card>

            <Modal
                title={editing ? `Edit Staff — ${editing.full_name}` : 'New Staff Account'}
                open={modalOpen}
                onOk={handleSubmit}
                onCancel={closeModal}
                okText={editing ? 'Save' : 'Create'}
                confirmLoading={createMutation.isPending || updateMutation.isPending}
                width={640}
                destroyOnHidden
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        label="Full Name"
                        name="full_name"
                        rules={[{ required: true, message: 'Name is required' }]}
                    >
                        <Input placeholder="e.g. Nimal Perera" />
                    </Form.Item>

                    {!editing && (
                        <Form.Item
                            label="Email"
                            name="email"
                            rules={[
                                { required: true, message: 'Email is required' },
                                { type: 'email', message: 'Enter a valid email' },
                            ]}
                        >
                            <Input placeholder="name@sribees.lk" />
                        </Form.Item>
                    )}

                    <Form.Item
                        label={editing ? 'Password (leave blank to keep current)' : 'Password'}
                        name="password"
                        rules={
                            editing
                                ? [{ min: 8, message: 'At least 8 characters' }]
                                : [
                                      { required: true, message: 'Password is required' },
                                      { min: 8, message: 'At least 8 characters' },
                                  ]
                        }
                    >
                        <Input.Password placeholder={editing ? '••••••••' : 'Min 8 characters'} />
                    </Form.Item>

                    {needsBranchPicker && (
                        <Form.Item
                            label="Branch Assignment"
                            name="branch_id"
                            rules={[{ required: true, message: 'Select a branch for this staff account' }]}
                        >
                            <Select
                                placeholder="Select a branch"
                                showSearch
                                optionFilterProp="label"
                                options={branches.map((b) => ({ label: b.name, value: b.branch_id }))}
                            />
                        </Form.Item>
                    )}

                    <Divider />

                    {!editing && (
                        <Form.Item label="Role" name="role_mode" initialValue="new">
                            <Radio.Group
                                onChange={(e) => setRoleMode(e.target.value)}
                                options={[
                                    { label: 'Create a new role', value: 'new' },
                                    { label: 'Reuse a role I created', value: 'reuse', disabled: myCustomRoles.length === 0 },
                                ]}
                            />
                        </Form.Item>
                    )}

                    {!editing && roleMode === 'reuse' && (
                        <Form.Item
                            label="Existing Role"
                            name="role_id"
                            rules={[{ required: true, message: 'Select a role' }]}
                        >
                            <Select
                                placeholder="Select a role you created"
                                options={myCustomRoles.map((r) => ({ label: r.name, value: r.roleId }))}
                            />
                        </Form.Item>
                    )}

                    {!editing && roleMode === 'new' && (
                        <Form.Item
                            label="New Role Name"
                            name="new_role_name"
                            rules={[{ required: true, min: 2, message: 'Give this role a name (e.g. "Branch Support Staff")' }]}
                        >
                            <Input placeholder='e.g. "Branch Support Staff"' />
                        </Form.Item>
                    )}

                    {(editing || roleMode === 'new') && (
                        <Form.Item
                            label="Permissions (only what you hold yourself can be granted)"
                            name="permission_ids"
                            rules={[{ required: true, type: 'array', min: 1, message: 'Select at least one permission' }]}
                        >
                            <Checkbox.Group style={{ width: '100%' }}>
                                <Space direction="vertical" style={{ width: '100%' }}>
                                    {Object.entries(groupedCatalog).map(([resource, perms]) => (
                                        <div key={resource}>
                                            <Text strong style={{ textTransform: 'capitalize' }}>{resource}</Text>
                                            <div>
                                                {perms.map((p) => (
                                                    <Checkbox
                                                        key={p.permissionId}
                                                        value={p.permissionId}
                                                        disabled={!myPermissionIds.has(p.permissionId)}
                                                    >
                                                        {p.action}
                                                    </Checkbox>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </Space>
                            </Checkbox.Group>
                        </Form.Item>
                    )}
                </Form>
            </Modal>
        </div>
    );
};

export default StaffList;
