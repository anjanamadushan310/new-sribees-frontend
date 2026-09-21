import React, { useState } from 'react';
import { Card, Table, Input, Tag, Switch, Space, Typography, App, Button, Dropdown, Modal, Drawer, Form, Popconfirm, Descriptions, List, Segmented, Avatar, Tooltip, Statistic, Row, Col } from 'antd';
import { UserOutlined, CheckCircleOutlined, DownloadOutlined, EyeOutlined, EditOutlined, LockOutlined, UnlockOutlined, DeleteOutlined, EllipsisOutlined, HomeOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import AssignPromoModal from './AssignPromoModal';
import type { CustomerSegment } from '../../api/customers.api';
import { customersApi } from '../../api/customers.api';
import type { Customer } from '../../api/customers.api';
import { usePermissions } from '../../hooks/usePermissions';
import { DebouncedSearchInput } from '../../components/common/DebouncedSearchInput';
import { slt } from '../../utils/datetime';

const { Title, Text } = Typography;

const CUSTOMERS_KEY = 'customers';

const SEGMENT_META: Record<CustomerSegment, { label: string; color: string; hint: string }> = {
    returning: {
        label: 'Returning',
        color: 'green',
        hint: 'Two or more completed orders, and bought within the last 30 days',
    },
    new: {
        label: 'New Customer',
        color: 'blue',
        hint: 'One completed order or none yet, and recently joined',
    },
    at_risk: {
        label: 'At Risk (30d+)',
        color: 'orange',
        hint:
            'No completed order in 30 days. Outranks "Returning" on purpose — a ' +
            'good customer who has gone quiet is the one worth winning back.',
    },
};

type FilterTab = 'all' | 'active' | 'blocked' | CustomerSegment;

const FILTER_TABS: { label: string; value: FilterTab }[] = [
    { label: 'All Customers', value: 'all' },
    { label: 'Active', value: 'active' },
    { label: 'Returning', value: 'returning' },
    { label: 'New', value: 'new' },
    { label: 'At Risk (30d+)', value: 'at_risk' },
    { label: 'Blocked', value: 'blocked' },
];

const formatLKR = (value: number): string =>
    new Intl.NumberFormat('en-LK', {
        style: 'currency',
        currency: 'LKR',
        maximumFractionDigits: 0,
    }).format(value ?? 0);

const CustomerList: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [form] = Form.useForm();
    // Editing / blocking a customer is a network-wide action (super_admin +
    // customer_support only on the server); a Branch Manager sees their branch's
    // customers read-only. Deleting is super_admin only.
    const { isSuperAdmin, isSupport } = usePermissions();
    const canManageCustomers = isSuperAdmin || isSupport;

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [search, setSearch] = useState('');
    const [exporting, setExporting] = useState(false);
    const [tab, setTab] = useState<FilterTab>('all');
    const [promoOpen, setPromoOpen] = useState(false);

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
            const headers = ['Name', 'NIC', 'Email', 'Phone', 'Second Phone', 'Joined Date', 'Status'];
            const rows = exportData.map(c => [
                c.full_name || 'Unnamed',
                c.nic || '',
                c.email || '',
                c.phone || '',
                c.alternate_phone || '',
                c.created_at ? slt(c.created_at).format('YYYY-MM-DD HH:mm:ss') : '',
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
            link.setAttribute('download', `customers_export_${slt().format('YYYYMMDD_HHmmss')}.csv`);
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
        queryKey: [CUSTOMERS_KEY, { page, pageSize, search, tab }],
        queryFn: () =>
            customersApi.list({
                page,
                limit: pageSize,
                search: search || undefined,
                // Segment is derived server-side from order history; account
                // status is a stored column. Both are applied there so the
                // rules live in one place.
                segment:
                    tab === 'returning' || tab === 'new' || tab === 'at_risk' ? tab : undefined,
                is_blocked: tab === 'blocked' ? true : tab === 'active' ? false : undefined,
            }),
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
        mutationFn: ({ id, values }: { id: string; values: { full_name: string; email?: string | null; phone?: string | null; nic?: string | null; alternate_phone?: string | null } }) =>
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
            title: 'Customer',
            key: 'name',
            render: (_, record) => {
                const meta = SEGMENT_META[record.segment] ?? SEGMENT_META.new;
                return (
                    <Space align="start">
                        <Avatar
                            style={{
                                backgroundColor: record.is_blocked ? '#fee2e2' : '#e0f2fe',
                                color: record.is_blocked ? '#dc2626' : '#0284c7',
                                fontWeight: 700,
                            }}
                        >
                            {(record.full_name || record.email || '?').charAt(0).toUpperCase()}
                        </Avatar>
                        <Space direction="vertical" size={2}>
                            <Space size={4}>
                                <Text strong delete={record.is_blocked}>
                                    {record.full_name || 'Unnamed'}
                                </Text>
                                {record.is_verified && (
                                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                                )}
                            </Space>
                            <Tooltip title={meta.hint}>
                                <Tag color={meta.color} style={{ marginInlineEnd: 0 }}>
                                    {meta.label}
                                </Tag>
                            </Tooltip>
                        </Space>
                    </Space>
                );
            },
            sorter: (a, b) => (a.full_name || '').localeCompare(b.full_name || ''),
        },
        {
            title: 'Completed Orders',
            key: 'completed_orders',
            width: 130,
            render: (_, record) => (
                <Tooltip title="Delivered orders only. Cancelled and refunded orders are not purchases.">
                    <span>
                        <strong>{record.completed_orders}</strong> order
                        {record.completed_orders === 1 ? '' : 's'}
                    </span>
                </Tooltip>
            ),
            sorter: (a, b) => a.completed_orders - b.completed_orders,
        },
        {
            title: (
                <Tooltip title="Lifetime spend on DELIVERED orders. Refunded money is not revenue — this figure used to include it.">
                    <span>Total Spent (Net)</span>
                </Tooltip>
            ),
            key: 'net_spent',
            width: 150,
            render: (_, record) => (
                <div>
                    <div style={{ fontWeight: 600 }}>{formatLKR(record.net_spent)}</div>
                    {record.has_refund && (
                        <Tooltip
                            title={`${formatLKR(record.refunded_amount)} refunded and excluded from this figure.`}
                        >
                            <div style={{ fontSize: 11, color: '#94a3b8' }}>Refund deducted</div>
                        </Tooltip>
                    )}
                </div>
            ),
            sorter: (a, b) => a.net_spent - b.net_spent,
        },
        {
            title: 'Email',
            dataIndex: 'email',
            key: 'email',
            sorter: (a, b) => (a.email || '').localeCompare(b.email || ''),
        },
        {
            title: 'NIC',
            dataIndex: 'nic',
            key: 'nic',
            render: (nic: string | null) => nic || <span style={{ color: '#bbb' }}>—</span>,
        },
        {
            title: 'Phone',
            dataIndex: 'phone',
            key: 'phone',
            render: (phone: string | null, record) => (
                <>
                    {phone || <span style={{ color: '#bbb' }}>—</span>}
                    {record.alternate_phone ? (
                        <div style={{ color: '#888', fontSize: 12 }}>{record.alternate_phone}</div>
                    ) : null}
                </>
            ),
        },
        {
            title: 'Joined',
            dataIndex: 'created_at',
            key: 'created_at',
            render: (d: string | null) => (d ? slt(d).format('MMM DD, YYYY') : '—'),
            sorter: (a, b) =>
                slt(a.created_at ?? 0).valueOf() - slt(b.created_at ?? 0).valueOf(),
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
                        disabled={record.is_blocked || !canManageCustomers}
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
                    ...(canManageCustomers ? [
                        {
                            key: 'edit',
                            label: 'Edit Info',
                            icon: <EditOutlined />,
                            onClick: () => {
                                setSelectedCustomerId(record.user_id);
                                form.setFieldsValue({
                                    full_name: record.full_name,
                                    email: record.email,
                                    phone: record.phone,
                                    nic: record.nic,
                                    alternate_phone: record.alternate_phone
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
                    ] : []),
                    ...(isSuperAdmin ? [
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
                    ] : [])
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
                <Segmented
                    value={tab}
                    onChange={(value) => {
                        setPage(1);
                        setTab(value as FilterTab);
                    }}
                    options={FILTER_TABS}
                    style={{ marginBottom: 16 }}
                />

                <div style={{ marginBottom: 16 }}>
                    <DebouncedSearchInput
                        placeholder="Search name, NIC, phone, email…"
                        value={search}
                        onChange={(v) => {
                            setPage(1);
                            setSearch(v);
                        }}
                        urlParam="q"
                        style={{ width: 340 }}
                    />
                </div>

                <Table
                    rowKey="user_id"
                    columns={columns}
                    dataSource={data?.customers ?? []}
                    loading={isLoading}
                    locale={{ emptyText: isError ? 'Failed to load customers.' : 'No customers found.' }}
                    scroll={{ x: 'max-content' }}
                    sticky
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

            <AssignPromoModal
                open={promoOpen}
                userId={selectedCustomerId}
                customerName={profile?.full_name || profile?.email || 'this customer'}
                onClose={() => setPromoOpen(false)}
            />

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
                            
                            {/* Retention action, above the numbers that justify it:
                                a manager who has just read "At Risk" should not
                                have to scroll to do something about it. */}
                            <Card
                                size="small"
                                style={{
                                    marginBottom: 16,
                                    background: 'linear-gradient(135deg, #eff6ff, #f5f3ff)',
                                    borderColor: '#bfdbfe',
                                }}
                            >
                                <div
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 12,
                                        flexWrap: 'wrap',
                                    }}
                                >
                                    <div>
                                        <Text strong style={{ color: '#1e3a8a' }}>
                                            🎁 Issue exclusive coupon
                                        </Text>
                                        <div style={{ fontSize: 12, color: '#3b82f6' }}>
                                            A code only this customer can redeem, sent straight
                                            to their wallet.
                                        </div>
                                    </div>
                                    <Button
                                        type="primary"
                                        onClick={() => setPromoOpen(true)}
                                    >
                                        ⚡ Assign Promo
                                    </Button>
                                </div>
                            </Card>

                            <Row gutter={12} style={{ marginBottom: 16 }}>
                                <Col span={12}>
                                    <Card size="small">
                                        <Statistic
                                            title={
                                                <Tooltip title="Delivered orders only. Refunded money is excluded — it is not revenue from this customer.">
                                                    <span>Total Spent (Net)</span>
                                                </Tooltip>
                                            }
                                            value={profile.stats.net_spent}
                                            precision={2}
                                            prefix="Rs."
                                        />
                                        {profile.stats.has_refund && (
                                            <Text type="warning" style={{ fontSize: 11 }}>
                                                {formatLKR(profile.stats.refunded_amount)} refunded
                                                and excluded
                                            </Text>
                                        )}
                                    </Card>
                                </Col>
                                <Col span={12}>
                                    <Card size="small">
                                        <Statistic
                                            title="Completed Orders"
                                            value={profile.stats.completed_orders}
                                        />
                                        <Tag
                                            color={
                                                (SEGMENT_META[profile.stats.segment] ??
                                                    SEGMENT_META.new).color
                                            }
                                        >
                                            {
                                                (SEGMENT_META[profile.stats.segment] ??
                                                    SEGMENT_META.new).label
                                            }
                                        </Tag>
                                    </Card>
                                </Col>
                            </Row>

                            <Descriptions bordered column={1} size="small">
                                <Descriptions.Item label="Email">{profile.email || <span style={{ color: '#bbb' }}>—</span>}</Descriptions.Item>
                                <Descriptions.Item label="NIC">{profile.nic || <span style={{ color: '#bbb' }}>—</span>}</Descriptions.Item>
                                <Descriptions.Item label="Phone">{profile.phone || <span style={{ color: '#bbb' }}>—</span>}</Descriptions.Item>
                                <Descriptions.Item label="Second Phone">{profile.alternate_phone || <span style={{ color: '#bbb' }}>—</span>}</Descriptions.Item>
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
                                <Descriptions.Item label="Joined Date">{profile.created_at ? slt(profile.created_at).format('MMMM DD, YYYY hh:mm A') : '—'}</Descriptions.Item>
                                <Descriptions.Item label="Last Login">{profile.last_login ? slt(profile.last_login).format('MMMM DD, YYYY hh:mm A') : '—'}</Descriptions.Item>
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
                                                <Text type="secondary">{addr.postal_city}, {addr.district}, {addr.province} (Postal Code: {addr.postal_code})</Text>
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
                                    { title: 'Date', dataIndex: 'created_at', key: 'created_at', render: (d) => slt(d).format('MMM DD, YYYY') }
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
                    {/* The customer cannot change their own NIC, so this form
                        is the only way a mistyped one ever gets corrected. */}
                    <Form.Item
                        name="nic"
                        label="NIC Number"
                        extra="The customer cannot edit this themselves."
                        rules={[{
                            pattern: /^(\d{9}[VXvx]|\d{12})$/,
                            message: '9 digits and V/X, or 12 digits',
                        }]}
                    >
                        <Input placeholder="199512345678" />
                    </Form.Item>
                    <Form.Item
                        name="alternate_phone"
                        label="Second Phone Number"
                    >
                        <Input placeholder="+94719876543" />
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
