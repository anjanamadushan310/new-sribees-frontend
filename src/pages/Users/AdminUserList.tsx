/**
 * Admin User Management (Super Admin only)
 * Table + create/edit modal with Role and Branch-assignment dropdowns.
 * Data layer is TanStack Query against /api/v1/admin/users.
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
    App,
    Typography,
    Popconfirm,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    SearchOutlined,
    UserOutlined,
    StopOutlined,
    CheckCircleOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminUsersApi } from '../../api/adminUsers.api';
import type {
    AdminUser,
    CreateAdminUserPayload,
    UpdateAdminUserPayload,
} from '../../api/adminUsers.api';
import { branchesApi } from '../../api/branches.api';
import { AdminRole, ROLE_NAMES, VALID_ADMIN_ROLES } from '../../types/admin.types';

const { Title, Text } = Typography;

const USERS_KEY = ['admin', 'adminUsers'];

const ROLE_COLOR: Record<string, string> = {
    [AdminRole.SUPER_ADMIN]: 'red',
    [AdminRole.BRANCH_MANAGER]: 'blue',
    [AdminRole.MARKETING_MANAGER]: 'green',
    [AdminRole.INVENTORY_MANAGER]: 'purple',
    [AdminRole.CUSTOMER_SUPPORT]: 'orange',
};

interface UserFormValues {
    full_name: string;
    email: string;
    password?: string;
    role: AdminRole;
    branch_id?: string | null;
}

const AdminUserList: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [form] = Form.useForm<UserFormValues>();
    const selectedRole = Form.useWatch('role', form);
    const selectedBranchId = Form.useWatch('branch_id', form);

    const getBranchExtraText = () => {
        if (selectedRole === AdminRole.CUSTOMER_SUPPORT) {
            if (!selectedBranchId) {
                return '🌐 Global Support: Not pinned to a branch. Will have access to support tickets and orders across ALL branches.';
            }
            return '📍 Branch-Scoped Support: Pinned strictly to this branch. Will only access data for this branch.';
        }
        if (selectedRole === AdminRole.SUPER_ADMIN) {
            return '🌐 Global Role: Super Admins manage the entire network across all branches (leave empty).';
        }
        if (selectedRole) {
            return '⚠️ Required: Branch Managers and Operations Staff must be assigned to a specific branch.';
        }
        return 'Required for branch-scoped roles; leave empty for global roles.';
    };

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<AdminUser | null>(null);
    const [search, setSearch] = useState('');

    const { data: users = [], isLoading, isError } = useQuery({
        queryKey: USERS_KEY,
        queryFn: adminUsersApi.list,
    });

    // Branch options for the assignment dropdown (now that the API is real).
    const { data: branches = [] } = useQuery({
        queryKey: ['admin', 'branches'],
        queryFn: branchesApi.list,
    });

    const invalidate = () => queryClient.invalidateQueries({ queryKey: USERS_KEY });

    const createMutation = useMutation({
        mutationFn: (payload: CreateAdminUserPayload) => adminUsersApi.create(payload),
        onSuccess: () => {
            message.success('Admin user created.');
            closeModal();
            invalidate();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to create admin user.'),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: UpdateAdminUserPayload }) =>
            adminUsersApi.update(id, payload),
        onSuccess: () => {
            message.success('Admin user updated.');
            closeModal();
            invalidate();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to update admin user.'),
    });

    const deactivateMutation = useMutation({
        mutationFn: (id: string) => adminUsersApi.deactivate(id),
        onSuccess: () => {
            message.success('Admin user deactivated.');
            invalidate();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to deactivate admin user.'),
    });

    const reactivateMutation = useMutation({
        mutationFn: (id: string) => adminUsersApi.update(id, { is_active: true }),
        onSuccess: () => {
            message.success('Admin user activated.');
            invalidate();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to activate admin user.'),
    });

    const openCreate = () => {
        setEditing(null);
        form.resetFields();
        setModalOpen(true);
    };

    const openEdit = (user: AdminUser) => {
        setEditing(user);
        form.setFieldsValue({
            full_name: user.full_name,
            email: user.email,
            password: undefined,
            role: user.role,
            branch_id: user.branch_id ?? undefined,
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
            const payload: UpdateAdminUserPayload = {
                full_name: values.full_name.trim(),
                email: values.email.trim(),
                role: values.role,
                branch_id: values.branch_id || null,
            };
            if (values.password) payload.password = values.password;
            updateMutation.mutate({ id: editing.admin_id, payload });
        } else {
            const payload: CreateAdminUserPayload = {
                full_name: values.full_name.trim(),
                email: values.email.trim(),
                password: values.password!,
                role: values.role,
                branch_id: values.branch_id || null,
            };
            createMutation.mutate(payload);
        }
    };

    const filtered = users.filter(
        (u) =>
            u.full_name.toLowerCase().includes(search.toLowerCase()) ||
            u.email.toLowerCase().includes(search.toLowerCase())
    );

    const roleOptions = VALID_ADMIN_ROLES.map((r) => ({ label: ROLE_NAMES[r], value: r }));

    const columns: ColumnsType<AdminUser> = [
        {
            title: 'User',
            key: 'user',
            width: 220,
            render: (_, record) => (
                <Space direction="vertical" size={0} style={{ maxWidth: 220 }}>
                    <Text strong>{record.full_name}</Text>
                    <Text
                        type="secondary"
                        style={{
                            fontSize: 12,
                            wordBreak: 'break-word',
                        }}
                        ellipsis={{ tooltip: record.email }}
                    >
                        {record.email}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Role',
            dataIndex: 'role',
            key: 'role',
            render: (role: AdminRole) => (
                <Tag color={ROLE_COLOR[role] || 'default'}>{ROLE_NAMES[role] ?? role}</Tag>
            ),
            filters: roleOptions.map((o) => ({ text: o.label, value: o.value })),
            onFilter: (val, record) => record.role === val,
        },
        {
            title: 'Branch',
            dataIndex: 'branch_name',
            key: 'branch_name',
            render: (name: string | null) =>
                name ? <Tag>{name}</Tag> : <Text type="secondary">All / None</Text>,
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
                            title="Deactivate this admin?"
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
                        <UserOutlined />
                        Admin Users
                    </Space>
                </Title>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                    Add Admin User
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
                    locale={{ emptyText: isError ? 'Failed to load admin users.' : 'No admin users yet.' }}
                    scroll={{ x: 'max-content' }}
                    pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `Total ${t} users` }}
                />
            </Card>

            <Modal
                title={editing ? 'Edit Admin User' : 'New Admin User'}
                open={modalOpen}
                onOk={handleSubmit}
                onCancel={closeModal}
                okText={editing ? 'Save' : 'Create'}
                confirmLoading={createMutation.isPending || updateMutation.isPending}
                destroyOnHidden
            >
                <Form form={form} layout="vertical" initialValues={{ is_active: true }}>
                    <Form.Item
                        label="Full Name"
                        name="full_name"
                        rules={[{ required: true, message: 'Name is required' }]}
                    >
                        <Input placeholder="e.g. Nimal Perera" />
                    </Form.Item>

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

                    <Form.Item
                        label="Role"
                        name="role"
                        rules={[{ required: true, message: 'Select a role' }]}
                    >
                        <Select placeholder="Select a role" options={roleOptions} />
                    </Form.Item>

                    <Form.Item
                        label="Branch Assignment"
                        name="branch_id"
                        extra={getBranchExtraText()}
                    >
                        <Select
                            placeholder="Select a branch (optional)"
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            options={branches.map((b) => ({ label: b.name, value: b.branch_id }))}
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default AdminUserList;
