import React, { useState } from 'react';
import { Card, Table, Input, Tag, Switch, Space, Typography, App, Button, Dropdown, Modal, Drawer, Form, Popconfirm, Descriptions, List } from 'antd';
import { SearchOutlined, UserOutlined, CheckCircleOutlined, DownloadOutlined, EyeOutlined, EditOutlined, LockOutlined, UnlockOutlined, DeleteOutlined, EllipsisOutlined, HomeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { customersApi } from '../../api/customers.api';
import type { Customer } from '../../api/customers.api';

const { Title, Text } = Typography;

const CUSTOMERS_KEY = 'customers';

const CustomerList: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [form] = Form.useForm();

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [search, setSearch] = useState('');
    const [exporting, setExporting] = useState(false);

    // Selected customer & popup state
    const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
    const [drawerVisible, setDrawerVisible] = useState(false);
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [blockModalVisible, setBlockModalVisible] = useState(false);
    const [blockReason, setBlockReason] = useState('');
    const [ordersPage, setOrdersPage] = useState(1);

    // Fetch profile and order history
    const { data: profile, isLoading: isProfileLoading } = useQuery({
        queryKey: ['customerProfile', selectedCustomerId],
        queryFn: () => customersApi.getProfile(selectedCustomerId!),
        enabled: !!selectedCustomerId && drawerVisible,
    });

    const { data: ordersData, isLoading: isOrdersLoading } = useQuery({
        queryKey: ['customerOrders', selectedCustomerId, ordersPage],
        queryFn: () => customersApi.getOrders(selectedCustomerId!, ordersPage, 5),
        enabled: !!selectedCustomerId && drawerVisible,
    });

    const exportToCSV = async () => {
        setExporting(true);
        try {
            const result = await customersApi.list({
                page: 1,
                limit: data?.total || 10000,
                search: search || undefined,
            });
            
            const exportData = result.customers;
            const headers = ['Name', 'Email', 'Phone', 'Joined Date', 'Status'];
            const rows = exportData.map(c => [
                c.full_name || 'Unnamed',
                c.email || '',
                c.phone || '',
                c.created_at ? dayjs(c.created_at).format('YYYY-MM-DD HH:mm:ss') : '',
                c.is_active ? 'Active' : 'Inactive'
            ]);
            
            const csvContent = [
                headers.join(','),
                ...rows.map(row => 
                    row.map(val => {
                        const escaped = ('' + val).replace(/"/g, '""');
                        return `"${escaped}"`;
                    }).join(',')
                )
            ].join('\n');
            
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.setAttribute('href', url);
            link.setAttribute('download', `customers_export_${dayjs().format('YYYYMMDD_HHmmss')}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            message.success('Customer list exported successfully.');
        } catch (error) {
            message.error('Failed to export customer list.');
        } finally {
            setExporting(false);
        }
    };

    const { data, isLoading, isError } = useQuery({
        queryKey: [CUSTOMERS_KEY, { page, pageSize, search }],
        queryFn: () => customersApi.list({ page, limit: pageSize, search: search || undefined }),
        placeholderData: keepPreviousData,
    });

    const statusMutation = useMutation({
        mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
            customersApi.setStatus(id, isActive),
        onSuccess: (_res, vars) => {
            message.success(`Customer ${vars.isActive ? 'activated' : 'deactivated'}.`);
            queryClient.invalidateQueries({ queryKey: [CUSTOMERS_KEY] });
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to update status.'),
    });

    const editMutation = useMutation({
        mutationFn: ({ id, values }: { id: string; values: { full_name: string; email?: string | null; phone?: string | null } }) =>
            customersApi.update(id, values),
        onSuccess: () => {
            message.success('Customer profile updated successfully.');
            setEditModalVisible(false);
            queryClient.invalidateQueries({ queryKey: [CUSTOMERS_KEY] });
            queryClient.invalidateQueries({ queryKey: ['customerProfile', selectedCustomerId] });
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail?.error?.message || err.response?.data?.detail || 'Failed to update customer info.'),
    });

    const blockMutation = useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) =>
            customersApi.block(id, reason),
        onSuccess: () => {
            message.success('Customer account blocked successfully.');
            setBlockModalVisible(false);
            setBlockReason('');
            queryClient.invalidateQueries({ queryKey: [CUSTOMERS_KEY] });
            queryClient.invalidateQueries({ queryKey: ['customerProfile', selectedCustomerId] });
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail?.error?.message || err.response?.data?.detail || 'Failed to block customer.'),
    });

    const unblockMutation = useMutation({
        mutationFn: (id: string) => customersApi.unblock(id),
        onSuccess: () => {
            message.success('Customer account unblocked successfully.');
            queryClient.invalidateQueries({ queryKey: [CUSTOMERS_KEY] });
            queryClient.invalidateQueries({ queryKey: ['customerProfile', selectedCustomerId] });
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail?.error?.message || err.response?.data?.detail || 'Failed to unblock customer.'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => customersApi.delete(id),
        onSuccess: (res) => {
            message.success(res.message || 'Customer deleted successfully.');
            queryClient.invalidateQueries({ queryKey: [CUSTOMERS_KEY] });
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail?.error?.message || err.response?.data?.detail || 'Failed to delete customer.'),
    });

    const columns: ColumnsType<Customer> = [
        {
            title: 'Name',
            key: 'name',
            render: (_, record) => (
                <Space>
                    <UserOutlined style={{ color: record.is_blocked ? '#ff4d4f' : record.is_active ? '#1890ff' : '#bbb' }} />
                    <Text strong delete={record.is_blocked}>{record.full_name || 'Unnamed'}</Text>
                    {record.is_verified && <CheckCircleOutlined style={{ color: '#52c41a' }} />}
                </Space>
            ),
            sorter: (a, b) => (a.full_name || '').localeCompare(b.full_name || ''),
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
            sorter: (a, b) => (a.email || '').localeCompare(b.email || ''),
        },
        {
            title: 'Phone',
            dataIndex: 'phone',
            key: 'phone',
            render: (phone: string | null) => phone || <span style={{ color: '#bbb' }}>—</span>,
        },
        {
            title: 'Joined',
            dataIndex: 'created_at',
            key: 'created_at',
            render: (d: string | null) => (d ? dayjs(d).format('MMM DD, YYYY') : '—'),
            sorter: (a, b) =>
                dayjs(a.created_at ?? 0).valueOf() - dayjs(b.created_at ?? 0).valueOf(),
        },
        {
            title: 'Status',
            key: 'status',
            width: 180,
            render: (_, record) => (
                <Space>
                    <Switch
                        size="small"
                        checked={record.is_active}
                        disabled={record.is_blocked}
                        loading={
                            statusMutation.isPending &&
                            statusMutation.variables?.id === record.user_id
                        }
                        onChange={(checked) =>
                            statusMutation.mutate({ id: record.user_id, isActive: checked })
                        }
                    />
                    {record.is_blocked ? (
                        <Tag color="red">Blocked</Tag>
                    ) : (
                        <Tag color={record.is_active ? 'green' : 'default'}>
                            {record.is_active ? 'Active' : 'Inactive'}
                        </Tag>
                    )}
                </Space>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 80,
            fixed: 'right' as const,
            render: (_, record) => {
                const items = [
                    {
                        key: 'view',
                        label: 'View Profile',
                        icon: <EyeOutlined />,
                        onClick: () => {
                            setSelectedCustomerId(record.user_id);
                            setOrdersPage(1);
                            setDrawerVisible(true);
                        }
                    },
                    {
                        key: 'edit',
                        label: 'Edit Info',
                        icon: <EditOutlined />,
                        onClick: () => {
                            setSelectedCustomerId(record.user_id);
                            form.setFieldsValue({
                                full_name: record.full_name,
                                email: record.email,
                                phone: record.phone
                            });
                            setEditModalVisible(true);
                        }
                    },
                    record.is_blocked ? {
                        key: 'unblock',
                        label: 'Unblock Account',
                        icon: <UnlockOutlined />,
                        onClick: () => {
                            unblockMutation.mutate(record.user_id);
                        }
                    } : {
                        key: 'block',
                        label: 'Block Account',
                        icon: <LockOutlined />,
                        danger: true,
                        onClick: () => {
                            setSelectedCustomerId(record.user_id);
                            setBlockReason('');
                            setBlockModalVisible(true);
                        }
                    },
                    {
                        type: 'divider' as const
                    },
                    {
                        key: 'delete',
                        label: (
                            <Popconfirm
                                title="Delete/Anonymize Customer Account?"
                                description="Are you sure you want to delete this customer? If they have order history, they will be anonymized instead of hard-deleted."
                                onConfirm={() => deleteMutation.mutate(record.user_id)}
                                okText="Yes, Delete"
                                cancelText="Cancel"
                                okButtonProps={{ danger: true }}
                            >
                                <span style={{ display: 'block', width: '100%' }}>Delete Customer</span>
                            </Popconfirm>
                        ),
                        icon: <DeleteOutlined />,
                        danger: true
                    }
                ];

                return (
                    <Dropdown menu={{ items }} trigger={['click']}>
                        <Button type="text" icon={<EllipsisOutlined />} />
                    </Dropdown>
                );
            }
        }
    ];

    return (
        <div>
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Title level={3} style={{ margin: 0 }}>
                    <Space>
                        <UserOutlined />
                        Customers
                    </Space>
                </Title>
                <Button 
                    type="primary" 
                    icon={<DownloadOutlined />} 
                    onClick={exportToCSV}
                    loading={exporting}
                >
                    Export CSV
                </Button>
            </div>

            <Card>
                <Input.Search
                    placeholder="Search by name, email or phone…"
                    allowClear
                    enterButton={<SearchOutlined />}
                    style={{ width: 340, marginBottom: 16 }}
                    onSearch={(value) => {
                        setPage(1);
                        setSearch(value);
                    }}
                />

                <Table
                    rowKey="user_id"
                    columns={columns}
                    dataSource={data?.customers ?? []}
                    loading={isLoading}
                    locale={{ emptyText: isError ? 'Failed to load customers.' : 'No customers found.' }}
                    scroll={{ x: 900 }}
                    pagination={{
                        current: page,
                        pageSize,
                        total: data?.total ?? 0,
                        showSizeChanger: true,
                        showTotal: (t) => `Total ${t} customers`,
                        onChange: (p, s) => {
                            setPage(p);
                            setPageSize(s);
                        },
                    }}
                />
            </Card>

            {/* View Profile Drawer */}
            <Drawer
                title="Customer Profile Details"
                placement="right"
                width={640}
                onClose={() => setDrawerVisible(false)}
                open={drawerVisible}
                loading={isProfileLoading}
            >
                {profile && (
                    <Space direction="vertical" size="large" style={{ width: '100%' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16 }}>
                                <UserOutlined style={{ fontSize: 32, marginRight: 16, color: '#1890ff' }} />
                                <div>
                                    <Title level={4} style={{ margin: 0 }}>{profile.full_name || 'Unnamed'}</Title>
                                    <Text type="secondary">User ID: {profile.user_id}</Text>
                                </div>
                            </div>
                            
                            <Card size="small" style={{ marginBottom: 16, backgroundColor: '#fafafa' }}>
                                <Space size="large">
                                    <div>
                                        <Text type="secondary">Total Spent</Text>
                                        <Title level={4} style={{ margin: 0 }}>Rs. {profile.stats.total_spent.toLocaleString()}</Title>
                                    </div>
                                    <div>
                                        <Text type="secondary">Total Orders</Text>
                                        <Title level={4} style={{ margin: 0 }}>{profile.stats.total_orders}</Title>
                                    </div>
                                </Space>
                            </Card>

                            <Descriptions bordered column={1} size="small">
                                <Descriptions.Item label="Email">{profile.email || <span style={{ color: '#bbb' }}>—</span>}</Descriptions.Item>
                                <Descriptions.Item label="Phone">{profile.phone || <span style={{ color: '#bbb' }}>—</span>}</Descriptions.Item>
                                <Descriptions.Item label="Status">
                                    {profile.is_blocked ? (
                                        <Space direction="vertical" size={2}>
                                            <Tag color="red">Blocked</Tag>
                                            <Text type="danger" style={{ fontSize: '12px' }}>Reason: {profile.blocked_reason}</Text>
                                        </Space>
                                    ) : (
                                        <Tag color={profile.is_active ? 'green' : 'default'}>{profile.is_active ? 'Active' : 'Inactive'}</Tag>
                                    )}
                                </Descriptions.Item>
                                <Descriptions.Item label="Email Verified">{profile.is_verified ? <Tag color="green">Yes</Tag> : <Tag color="orange">No</Tag>}</Descriptions.Item>
                                <Descriptions.Item label="Joined Date">{profile.created_at ? dayjs(profile.created_at).format('MMMM DD, YYYY hh:mm A') : '—'}</Descriptions.Item>
                                <Descriptions.Item label="Last Login">{profile.last_login ? dayjs(profile.last_login).format('MMMM DD, YYYY hh:mm A') : '—'}</Descriptions.Item>
                            </Descriptions>
                        </div>

                        <div>
                            <Title level={5}>Saved Addresses</Title>
                            {profile.addresses && profile.addresses.length > 0 ? (
                                <List
                                    bordered
                                    dataSource={profile.addresses}
                                    renderItem={(addr) => (
                                        <List.Item>
                                            <div style={{ width: '100%' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                                    <Text strong><HomeOutlined /> Address</Text>
                                                    {addr.is_default && <Tag color="blue">Default</Tag>}
                                                </div>
                                                <Text>{addr.address_line1}{addr.address_line2 ? `, ${addr.address_line2}` : ''}</Text>
                                                <br />
                                                <Text type="secondary">{addr.post_office}, {addr.district}, {addr.province} (Postal Code: {addr.postal_code})</Text>
                                            </div>
                                        </List.Item>
                                    )}
                                />
                            ) : (
                                <Text type="secondary">No saved addresses found.</Text>
                            )}
                        </div>

                        <div>
                            <Title level={5}>Order History</Title>
                            <Table
                                size="small"
                                rowKey="order_id"
                                dataSource={ordersData?.orders ?? []}
                                loading={isOrdersLoading}
                                pagination={{
                                    current: ordersPage,
                                    pageSize: 5,
                                    total: ordersData?.total ?? 0,
                                    size: 'small',
                                    onChange: (p) => setOrdersPage(p),
                                }}
                                columns={[
                                    { title: 'Order No', dataIndex: 'order_number', key: 'order_number' },
                                    { title: 'Amount', dataIndex: 'total_amount', key: 'total_amount', render: (val) => `Rs. ${val.toLocaleString()}` },
                                    { title: 'Status', dataIndex: 'status', key: 'status', render: (s) => <Tag color={s === 'completed' ? 'green' : s === 'cancelled' ? 'red' : 'blue'}>{s.toUpperCase()}</Tag> },
                                    { title: 'Date', dataIndex: 'created_at', key: 'created_at', render: (d) => dayjs(d).format('MMM DD, YYYY') }
                                ]}
                            />
                        </div>
                    </Space>
                )}
            </Drawer>

            {/* Edit Info Modal */}
            <Modal
                title="Edit Customer Profile"
                open={editModalVisible}
                onCancel={() => setEditModalVisible(false)}
                onOk={() => {
                    form.validateFields().then(values => {
                        editMutation.mutate({ id: selectedCustomerId!, values });
                    });
                }}
                confirmLoading={editMutation.isPending}
                destroyOnClose
            >
                <Form form={form} layout="vertical" name="editCustomerForm">
                    <Form.Item
                        name="full_name"
                        label="Full Name"
                        rules={[{ required: true, message: 'Please enter customer name' }]}
                    >
                        <Input placeholder="John Doe" />
                    </Form.Item>
                    <Form.Item
                        name="email"
                        label="Email Address"
                        rules={[{ type: 'email', message: 'Please enter a valid email address' }]}
                    >
                        <Input placeholder="john@example.com" />
                    </Form.Item>
                    <Form.Item
                        name="phone"
                        label="Phone Number"
                    >
                        <Input placeholder="+94771234567" />
                    </Form.Item>
                </Form>
            </Modal>

            {/* Block Modal */}
            <Modal
                title="Block Customer Account"
                open={blockModalVisible}
                onCancel={() => setBlockModalVisible(false)}
                onOk={() => {
                    if (!blockReason.trim()) {
                        message.warning('Please state a reason for blocking this customer.');
                        return;
                    }
                    blockMutation.mutate({ id: selectedCustomerId!, reason: blockReason });
                }}
                confirmLoading={blockMutation.isPending}
                okText="Block Account"
                okButtonProps={{ danger: true }}
                destroyOnClose
            >
                <Space direction="vertical" style={{ width: '100%' }}>
                    <Text type="secondary">
                        Please state the reason for suspending this customer account. This reason will be shown to the customer on their app.
                    </Text>
                    <Input.TextArea
                        rows={4}
                        placeholder="e.g. Repeated fraudulent transactions, Fake cash-on-delivery orders"
                        value={blockReason}
                        onChange={(e) => setBlockReason(e.target.value)}
                    />
                </Space>
            </Modal>
        </div>
    );
};

export default CustomerList;
