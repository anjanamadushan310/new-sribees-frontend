/**
 * Support Ticket Management Page (/support-tickets)
 *
 * Super Admin sees all branches with optional branch filter.
 * Branch Manager & Customer Support are branch-scoped.
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
    Drawer,
    Form,
    App,
    Typography,
    Row,
    Col,
    Statistic,
    Descriptions,
    Divider,
} from 'antd';
import {
    CustomerServiceOutlined,
    ClockCircleOutlined,
    SyncOutlined,
    CheckCircleOutlined,
    PhoneOutlined,
    SearchOutlined,
    EditOutlined,
    UserOutlined,
    BranchesOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supportApi } from '../../api/support.api';
import type { SupportTicketItem } from '../../api/support.api';
import { branchesApi } from '../../api/branches.api';
import type { Branch } from '../../api/branches.api';
import { useAuthStore } from '../../store/authStore';
import { AdminRole } from '../../types/admin.types';

const { Title, Text, Paragraph } = Typography;
const { TextArea } = Input;

const STATUS_TAGS: Record<string, { color: string; label: string }> = {
    pending: { color: 'gold', label: 'Pending' },
    in_progress: { color: 'processing', label: 'In Progress' },
    resolved: { color: 'success', label: 'Resolved' },
    closed: { color: 'default', label: 'Closed' },
};

const CATEGORY_COLORS: Record<string, string> = {
    general: 'blue',
    order: 'cyan',
    delivery: 'purple',
    app: 'geekblue',
    payment: 'magenta',
};

export const SupportTicketList: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const user = useAuthStore((state) => state.user);
    const isSuperAdmin = user?.role === AdminRole.SUPER_ADMIN;

    // Filters
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [branchFilter, setBranchFilter] = useState<string | undefined>(undefined);
    const [searchQuery, setSearchQuery] = useState<string>('');

    // Selected ticket for drawer
    const [selectedTicket, setSelectedTicket] = useState<SupportTicketItem | null>(null);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [form] = Form.useForm();

    // Query tickets
    const { data, isLoading } = useQuery({
        queryKey: [
            'admin',
            'supportTickets',
            { page, limit: pageSize, status: statusFilter, branch_id: branchFilter, search: searchQuery },
        ],
        queryFn: () =>
            supportApi.list({
                page,
                limit: pageSize,
                status: statusFilter === 'all' ? undefined : statusFilter,
                branch_id: branchFilter,
                search: searchQuery.trim() || undefined,
            }),
    });

    // Query branches for super admin filter
    const { data: branches = [] } = useQuery<Branch[]>({
        queryKey: ['admin', 'branches'],
        queryFn: branchesApi.list,
        enabled: isSuperAdmin,
    });

    // Update ticket mutation
    const updateMutation = useMutation({
        mutationFn: ({
            ticketId,
            payload,
        }: {
            ticketId: string;
            payload: { status?: string; resolution_notes?: string };
        }) => supportApi.update(ticketId, payload),
        onSuccess: (updated) => {
            message.success(`Ticket ${updated.ticket_number} updated successfully.`);
            queryClient.invalidateQueries({ queryKey: ['admin', 'supportTickets'] });
            setSelectedTicket(updated);
            setDrawerOpen(false);
        },
        onError: (err: any) => {
            message.error(err?.response?.data?.detail || 'Failed to update ticket.');
        },
    });

    const handleOpenDrawer = (ticket: SupportTicketItem) => {
        setSelectedTicket(ticket);
        form.setFieldsValue({
            status: ticket.status,
            resolution_notes: ticket.resolution_notes || '',
        });
        setDrawerOpen(true);
    };

    const handleFormSubmit = async () => {
        if (!selectedTicket) return;
        try {
            const values = await form.validateFields();
            updateMutation.mutate({
                ticketId: selectedTicket.ticket_id,
                payload: {
                    status: values.status,
                    resolution_notes: values.resolution_notes,
                },
            });
        } catch {
            // Validation failed
        }
    };

    const columns: ColumnsType<SupportTicketItem> = [
        {
            title: 'Ticket #',
            dataIndex: 'ticket_number',
            key: 'ticket_number',
            width: 150,
            render: (ticketNum: string, record) => (
                <Space direction="vertical" size={2}>
                    <Text strong style={{ color: '#E91E63' }}>
                        {ticketNum}
                    </Text>
                    <Tag color={CATEGORY_COLORS[record.category] || 'default'} style={{ fontSize: 11 }}>
                        {record.category?.toUpperCase()}
                    </Tag>
                </Space>
            ),
        },
        {
            title: 'Date & Time',
            dataIndex: 'created_at',
            key: 'created_at',
            width: 160,
            render: (dt: string) => {
                if (!dt) return '-';
                const d = new Date(dt);
                return (
                    <Space direction="vertical" size={0}>
                        <Text style={{ fontSize: 13 }}>{d.toLocaleDateString()}</Text>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            {d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                    </Space>
                );
            },
        },
        {
            title: 'Customer Details',
            key: 'customer',
            width: 200,
            render: (_, record) => (
                <Space direction="vertical" size={2}>
                    <Space size={6}>
                        <UserOutlined style={{ color: '#888' }} />
                        <Text strong>{record.customer_name || 'Anonymous User'}</Text>
                    </Space>
                    <Space size={6}>
                        <PhoneOutlined style={{ color: '#4CAF50' }} />
                        <a href={`tel:${record.contact_phone}`} style={{ color: '#1890ff', fontWeight: 600 }}>
                            {record.contact_phone}
                        </a>
                    </Space>
                </Space>
            ),
        },
        {
            title: 'Branch',
            dataIndex: 'branch_name',
            key: 'branch_name',
            width: 140,
            render: (branchName: string | null) =>
                branchName ? (
                    <Tag icon={<BranchesOutlined />} color="geekblue">
                        {branchName}
                    </Tag>
                ) : (
                    <Text type="secondary">General / Online</Text>
                ),
        },
        {
            title: 'Customer Message',
            dataIndex: 'message',
            key: 'message',
            ellipsis: true,
            render: (msg: string) => (
                <Paragraph ellipsis={{ rows: 2, expandable: false }} style={{ margin: 0, color: '#333' }}>
                    {msg}
                </Paragraph>
            ),
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            width: 130,
            render: (status: string) => {
                const conf = STATUS_TAGS[status] || { color: 'default', label: status };
                return (
                    <Tag color={conf.color} style={{ fontWeight: 600, padding: '2px 10px', borderRadius: 12 }}>
                        {conf.label}
                    </Tag>
                );
            },
        },
        {
            title: 'Action',
            key: 'action',
            width: 110,
            render: (_, record) => (
                <Button
                    type="primary"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => handleOpenDrawer(record)}
                >
                    View
                </Button>
            ),
        },
    ];

    return (
        <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
            {/* Header */}
            <div style={{ marginBottom: 20 }}>
                <Title level={3} style={{ margin: 0 }}>
                    <CustomerServiceOutlined style={{ marginRight: 10, color: '#E91E63' }} />
                    Customer Support Requests
                </Title>
                <Text type="secondary">
                    Review and respond to customer inquiries and issues submitted through the mobile app.
                </Text>
            </div>

            {/* Metrics cards */}
            <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
                <Col xs={12} sm={6}>
                    <Card bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderRadius: 12 }}>
                        <Statistic
                            title="Total Tickets"
                            value={data?.total ?? 0}
                            prefix={<CustomerServiceOutlined style={{ color: '#1890ff' }} />}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderRadius: 12 }}>
                        <Statistic
                            title="Pending"
                            value={data?.pending_count ?? 0}
                            valueStyle={{ color: '#faad14' }}
                            prefix={<ClockCircleOutlined style={{ color: '#faad14' }} />}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderRadius: 12 }}>
                        <Statistic
                            title="In Progress"
                            value={data?.in_progress_count ?? 0}
                            valueStyle={{ color: '#1890ff' }}
                            prefix={<SyncOutlined spin style={{ color: '#1890ff' }} />}
                        />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card bordered={false} style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderRadius: 12 }}>
                        <Statistic
                            title="Resolved"
                            value={data?.resolved_count ?? 0}
                            valueStyle={{ color: '#52c41a' }}
                            prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                        />
                    </Card>
                </Col>
            </Row>

            {/* Table and filter card */}
            <Card bordered={false} style={{ borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                {/* Search & filters */}
                <Row gutter={[12, 12]} style={{ marginBottom: 16 }} justify="space-between" align="middle">
                    <Col xs={24} md={8}>
                        <Input
                            placeholder="Search by phone, ticket # or name..."
                            prefix={<SearchOutlined />}
                            allowClear
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onPressEnter={() => setPage(1)}
                        />
                    </Col>
                    <Col xs={24} md={16} style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                        {isSuperAdmin && (
                            <Select
                                placeholder="Filter by Branch"
                                allowClear
                                style={{ width: 200 }}
                                value={branchFilter}
                                onChange={(val) => {
                                    setBranchFilter(val);
                                    setPage(1);
                                }}
                            >
                                {branches.map((b) => (
                                    <Select.Option key={b.branch_id} value={b.branch_id}>
                                        {b.name}
                                    </Select.Option>
                                ))}
                            </Select>
                        )}
                        <Select
                            value={statusFilter}
                            style={{ width: 150 }}
                            onChange={(val) => {
                                setStatusFilter(val);
                                setPage(1);
                            }}
                        >
                            <Select.Option value="all">All Statuses</Select.Option>
                            <Select.Option value="pending">Pending</Select.Option>
                            <Select.Option value="in_progress">In Progress</Select.Option>
                            <Select.Option value="resolved">Resolved</Select.Option>
                            <Select.Option value="closed">Closed</Select.Option>
                        </Select>
                    </Col>
                </Row>

                {/* Tickets Table */}
                <Table
                    columns={columns}
                    dataSource={data?.items || []}
                    rowKey="ticket_id"
                    loading={isLoading}
                    pagination={{
                        current: page,
                        pageSize,
                        total: data?.total || 0,
                        onChange: (p, ps) => {
                            setPage(p);
                            setPageSize(ps);
                        },
                        showSizeChanger: true,
                        showTotal: (total) => `Total ${total} requests`,
                    }}
                />
            </Card>

            {/* Ticket Details & Update Drawer */}
            <Drawer
                title={
                    <Space>
                        <CustomerServiceOutlined style={{ color: '#E91E63' }} />
                        <span>Ticket Details: {selectedTicket?.ticket_number}</span>
                    </Space>
                }
                width={520}
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                footer={
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                        <Button onClick={() => setDrawerOpen(false)}>Cancel</Button>
                        <Button
                            type="primary"
                            loading={updateMutation.isPending}
                            onClick={handleFormSubmit}
                        >
                            Save Changes
                        </Button>
                    </div>
                }
            >
                {selectedTicket && (
                    <div>
                        <Descriptions column={1} bordered size="small" style={{ marginBottom: 20 }}>
                            <Descriptions.Item label="Ticket Number">
                                <Text strong style={{ color: '#E91E63' }}>{selectedTicket.ticket_number}</Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="Customer Name">
                                {selectedTicket.customer_name || 'Anonymous User'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Contact Phone">
                                <Space>
                                    <PhoneOutlined style={{ color: '#4CAF50' }} />
                                    <a href={`tel:${selectedTicket.contact_phone}`} style={{ fontWeight: 600 }}>
                                        {selectedTicket.contact_phone}
                                    </a>
                                </Space>
                            </Descriptions.Item>
                            <Descriptions.Item label="Branch">
                                {selectedTicket.branch_name || 'General / Unassigned'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Category">
                                <Tag color={CATEGORY_COLORS[selectedTicket.category] || 'default'}>
                                    {selectedTicket.category?.toUpperCase()}
                                </Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="Submitted At">
                                {selectedTicket.created_at ? new Date(selectedTicket.created_at).toLocaleString() : '-'}
                            </Descriptions.Item>
                            {selectedTicket.resolved_at && (
                                <Descriptions.Item label="Resolved At">
                                    {new Date(selectedTicket.resolved_at).toLocaleString()}
                                </Descriptions.Item>
                            )}
                        </Descriptions>

                        <Divider titlePlacement="start" style={{ fontSize: 13 }}>Customer Message</Divider>
                        <Card
                            size="small"
                            style={{
                                backgroundColor: '#f9f9f9',
                                border: '1px solid #eee',
                                borderRadius: 8,
                                marginBottom: 24,
                            }}
                        >
                            <Paragraph style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 14 }}>
                                {selectedTicket.message}
                            </Paragraph>
                        </Card>

                        <Divider titlePlacement="start" style={{ fontSize: 13 }}>Update Status & Notes</Divider>
                        <Form form={form} layout="vertical">
                            <Form.Item
                                name="status"
                                label="Ticket Status"
                                rules={[{ required: true, message: 'Please select a status' }]}
                            >
                                <Select>
                                    <Select.Option value="pending">Pending</Select.Option>
                                    <Select.Option value="in_progress">In Progress</Select.Option>
                                    <Select.Option value="resolved">Resolved</Select.Option>
                                    <Select.Option value="closed">Closed</Select.Option>
                                </Select>
                            </Form.Item>

                            <Form.Item
                                name="resolution_notes"
                                label="Internal Staff Resolution Notes"
                                extra="Keep notes on actions taken or communication with the customer."
                            >
                                <TextArea
                                    rows={4}
                                    placeholder="e.g. Called customer at 11:30 AM, refunded damaged item via wallet..."
                                />
                            </Form.Item>
                        </Form>
                    </div>
                )}
            </Drawer>
        </div>
    );
};

export default SupportTicketList;
