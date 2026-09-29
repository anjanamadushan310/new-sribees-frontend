import React, { useState } from 'react';
import {
    Badge,
    Button,
    Card,
    Empty,
    Form,
    Input,
    Modal,
    Select,
    Space,
    Table,
    Tabs,
    Tag,
    Typography,
    Alert,
    Descriptions,
    Divider,
    App,
} from 'antd';
import {
    FlagOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    EyeOutlined,
    PlusOutlined,
    ExclamationCircleOutlined,
    UserOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useMutation } from '@tanstack/react-query';
import {
    ordersApi,
    type OrderEscalation,
    type EscalationCategory,
    type EscalationStatus,
} from '../../../api/orders.api';
import { useAuthStore } from '../../../store/authStore';
import { slt } from '../../../utils/datetime';

const { Text, Title, Paragraph } = Typography;

export const ESC_CATEGORIES: { value: EscalationCategory; label: string }[] = [
    { value: 'cancel_request', label: 'Urgent Cancellation' },
    { value: 'address_correction', label: 'Address Correction' },
    { value: 'hold_shipment', label: 'Hold Shipment' },
    { value: 'customer_complaint', label: 'Customer Complaint' },
    { value: 'other', label: 'Other' },
];

export const escLabel = (c: string) => ESC_CATEGORIES.find((x) => x.value === c)?.label ?? c;

interface EscalationSectionProps {
    orderId: string;
    escalations: OrderEscalation[];
    canDecide: boolean;
    onChanged: () => void;
}

const EscalationSection: React.FC<EscalationSectionProps> = ({
    orderId,
    escalations,
    canDecide,
    onChanged,
}) => {
    const { message } = App.useApp();
    const currentUser = useAuthStore((state) => state.user);

    const [activeTab, setActiveTab] = useState<'support' | 'my'>('support');
    const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'acknowledged' | 'resolved'>('all');

    // Modals
    const [supportModalTicket, setSupportModalTicket] = useState<OrderEscalation | null>(null);
    const [resolutionNote, setResolutionNote] = useState('');
    const [myModalTicket, setMyModalTicket] = useState<OrderEscalation | null>(null);
    const [raiseModalOpen, setRaiseModalOpen] = useState(false);
    const [raiseCategory, setRaiseCategory] = useState<EscalationCategory>('cancel_request');
    const [raiseMessage, setRaiseMessage] = useState('');

    // Separate tickets into:
    // Tab B (My Tickets): Raised by current logged in admin
    // Tab A (Support Tickets): Raised by Support / Call Center / other users for branch attention
    const myTickets = escalations.filter(
        (e) =>
            currentUser?.admin_id &&
            (e.raised_by_name?.toLowerCase().includes(currentUser.full_name?.toLowerCase() || '___') ||
                e.raised_by_name?.toLowerCase().includes('branch'))
    );
    const supportTickets = escalations.filter((e) => !myTickets.includes(e));

    // Filter Support Tickets
    const filteredSupportTickets = supportTickets.filter((e) => {
        if (statusFilter === 'all') return true;
        return e.status === statusFilter;
    });

    // Counts for badges
    const openCount = supportTickets.filter((e) => e.status === 'open').length;
    const ackCount = supportTickets.filter((e) => e.status === 'acknowledged').length;
    const resCount = supportTickets.filter((e) => e.status === 'resolved').length;

    // Mutations
    const updateMut = useMutation({
        mutationFn: ({
            eid,
            status,
            note,
        }: {
            eid: string;
            status: EscalationStatus;
            note?: string;
        }) => ordersApi.updateEscalation(orderId, eid, status, note),
        onSuccess: (_r, v) => {
            if (v.status === 'acknowledged') {
                message.success('Escalation acknowledged.');
            } else if (v.status === 'resolved') {
                message.success('Escalation resolved successfully.');
            }
            onChanged();
            if (supportModalTicket && supportModalTicket.escalation_id === v.eid) {
                setSupportModalTicket((prev) =>
                    prev
                        ? {
                              ...prev,
                              status: v.status,
                              resolution_note: v.note ?? prev.resolution_note,
                              handled_by_name: currentUser?.full_name || 'Admin',
                              resolved_at: v.status === 'resolved' ? new Date().toISOString() : prev.resolved_at,
                              acknowledged_at: v.status === 'acknowledged' ? new Date().toISOString() : prev.acknowledged_at,
                          }
                        : null
                );
            }
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to update escalation.'),
    });

    const raiseMut = useMutation({
        mutationFn: () => ordersApi.raiseEscalation(orderId, raiseCategory, raiseMessage.trim()),
        onSuccess: () => {
            message.success('Escalation ticket raised successfully.');
            setRaiseModalOpen(false);
            setRaiseMessage('');
            onChanged();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to raise escalation.'),
    });

    const handleAcknowledge = (ticket: OrderEscalation) => {
        updateMut.mutate({ eid: ticket.escalation_id, status: 'acknowledged' });
    };

    const handleResolve = (ticket: OrderEscalation) => {
        if (!resolutionNote.trim()) {
            message.warning('Please enter a resolution note before resolving.');
            return;
        }
        updateMut.mutate({
            eid: ticket.escalation_id,
            status: 'resolved',
            note: resolutionNote.trim(),
        });
        setResolutionNote('');
    };

    // Columns for Tab A: Support Tickets
    const supportColumns: ColumnsType<OrderEscalation> = [
        {
            title: 'Ticket ID',
            key: 'ticket_id',
            width: 120,
            render: (_, r) => (
                <Text strong style={{ fontFamily: 'monospace', color: '#1677ff', fontSize: 13 }}>
                    #SUP-{r.escalation_id.slice(0, 6).toUpperCase()}
                </Text>
            ),
        },
        {
            title: 'Category',
            key: 'category',
            width: 160,
            render: (_, r) => (
                <Tag color={r.category === 'cancel_request' ? 'red' : 'geekblue'} style={{ fontSize: 12 }}>
                    {escLabel(r.category)}
                </Tag>
            ),
        },
        {
            title: 'Support Message (Preview)',
            key: 'message',
            ellipsis: true,
            render: (_, r) => (
                <Text style={{ fontSize: 13 }} ellipsis title={r.message}>
                    {r.message}
                </Text>
            ),
        },
        {
            title: 'Created By & Time',
            key: 'created',
            width: 200,
            render: (_, r) => (
                <Space direction="vertical" size={0}>
                    <Text strong style={{ fontSize: 12 }}>
                        <UserOutlined style={{ marginRight: 4 }} />
                        {r.raised_by_name}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 11 }}>
                        <ClockCircleOutlined style={{ marginRight: 4 }} />
                        {r.created_at ? slt(r.created_at).format('MMM DD, YYYY · hh:mm A') : '—'}
                    </Text>
                </Space>
            ),
        },
        {
            title: 'Status',
            key: 'status',
            width: 130,
            align: 'center',
            render: (_, r) => {
                let color = 'default';
                if (r.status === 'open') color = 'red';
                if (r.status === 'acknowledged') color = 'gold';
                if (r.status === 'resolved') color = 'green';
                return (
                    <Tag color={color} style={{ textTransform: 'capitalize', fontWeight: 600, margin: 0 }}>
                        {r.status}
                    </Tag>
                );
            },
        },
        {
            title: 'Action',
            key: 'action',
            width: 130,
            align: 'center',
            render: (_, r) => (
                <Button
                    type="primary"
                    ghost
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                        setSupportModalTicket(r);
                        setResolutionNote(r.resolution_note || '');
                    }}
                >
                    {r.status === 'resolved' ? 'View Ticket' : 'View & Resolve'}
                </Button>
            ),
        },
    ];

    // Columns for Tab B: My Tickets
    const myColumns: ColumnsType<OrderEscalation> = [
        {
            title: 'Ticket ID',
            key: 'ticket_id',
            width: 120,
            render: (_, r) => (
                <Text strong style={{ fontFamily: 'monospace', color: '#722ed1', fontSize: 13 }}>
                    #ESC-{r.escalation_id.slice(0, 6).toUpperCase()}
                </Text>
            ),
        },
        {
            title: 'Category',
            key: 'category',
            width: 160,
            render: (_, r) => <Tag color="purple">{escLabel(r.category)}</Tag>,
        },
        {
            title: 'My Description (Preview)',
            key: 'message',
            ellipsis: true,
            render: (_, r) => (
                <Text style={{ fontSize: 13 }} ellipsis title={r.message}>
                    {r.message}
                </Text>
            ),
        },
        {
            title: 'Submitted Date & Time',
            key: 'created',
            width: 180,
            render: (_, r) => (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    <ClockCircleOutlined style={{ marginRight: 4 }} />
                    {r.created_at ? slt(r.created_at).format('MMM DD, YYYY · hh:mm A') : '—'}
                </Text>
            ),
        },
        {
            title: 'Super Admin Status',
            key: 'status',
            width: 140,
            align: 'center',
            render: (_, r) => {
                let color = 'gold';
                let label = 'In Review';
                if (r.status === 'open') {
                    color = 'orange';
                    label = 'Open';
                } else if (r.status === 'resolved') {
                    color = 'green';
                    label = 'Resolved';
                }
                return <Tag color={color}>{label}</Tag>;
            },
        },
        {
            title: 'Action',
            key: 'action',
            width: 110,
            align: 'center',
            render: (_, r) => (
                <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => setMyModalTicket(r)}
                >
                    View Details
                </Button>
            ),
        },
    ];

    return (
        <Card
            title={
                <Space>
                    <FlagOutlined style={{ color: '#faad14' }} />
                    <span style={{ fontWeight: 600 }}>Escalation Tickets</span>
                    {openCount > 0 && <Badge count={`${openCount} open`} style={{ backgroundColor: '#ff4d4f' }} />}
                </Space>
            }
            extra={
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    size="small"
                    onClick={() => setRaiseModalOpen(true)}
                >
                    Raise Escalation
                </Button>
            }
            style={{ borderRadius: 8, marginTop: 16 }}
            styles={{ body: { padding: '12px 16px' } }}
        >
            <Tabs
                activeKey={activeTab}
                onChange={(k) => setActiveTab(k as 'support' | 'my')}
                items={[
                    {
                        key: 'support',
                        label: (
                            <Space size={6}>
                                <span>Support Tickets</span>
                                <Badge
                                    count={supportTickets.length}
                                    style={{
                                        backgroundColor: activeTab === 'support' ? '#1677ff' : '#d9d9d9',
                                    }}
                                />
                            </Space>
                        ),
                        children: (
                            <div>
                                {/* Status Filter Pills */}
                                <Space wrap size={8} style={{ marginBottom: 16, marginTop: 4 }}>
                                    <Tag.CheckableTag
                                        checked={statusFilter === 'all'}
                                        onChange={() => setStatusFilter('all')}
                                        style={{ padding: '3px 10px', fontSize: 13 }}
                                    >
                                        All ({supportTickets.length})
                                    </Tag.CheckableTag>
                                    <Tag.CheckableTag
                                        checked={statusFilter === 'open'}
                                        onChange={() => setStatusFilter('open')}
                                        style={{
                                            padding: '3px 10px',
                                            fontSize: 13,
                                            border: statusFilter === 'open' ? '1px solid #ff4d4f' : undefined,
                                        }}
                                    >
                                        <Badge status="error" /> Open ({openCount})
                                    </Tag.CheckableTag>
                                    <Tag.CheckableTag
                                        checked={statusFilter === 'acknowledged'}
                                        onChange={() => setStatusFilter('acknowledged')}
                                        style={{
                                            padding: '3px 10px',
                                            fontSize: 13,
                                            border: statusFilter === 'acknowledged' ? '1px solid #faad14' : undefined,
                                        }}
                                    >
                                        <Badge status="warning" /> Acknowledged ({ackCount})
                                    </Tag.CheckableTag>
                                    <Tag.CheckableTag
                                        checked={statusFilter === 'resolved'}
                                        onChange={() => setStatusFilter('resolved')}
                                        style={{
                                            padding: '3px 10px',
                                            fontSize: 13,
                                            border: statusFilter === 'resolved' ? '1px solid #52c41a' : undefined,
                                        }}
                                    >
                                        <Badge status="success" /> Resolved ({resCount})
                                    </Tag.CheckableTag>
                                </Space>

                                <Table
                                    columns={supportColumns}
                                    dataSource={filteredSupportTickets}
                                    rowKey="escalation_id"
                                    pagination={false}
                                    size="small"
                                    locale={{
                                        emptyText: (
                                            <Empty
                                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                                description="No support escalation tickets found for this filter."
                                            />
                                        ),
                                    }}
                                />
                            </div>
                        ),
                    },
                    {
                        key: 'my',
                        label: (
                            <Space size={6}>
                                <span>My Tickets</span>
                                <Badge
                                    count={myTickets.length}
                                    style={{
                                        backgroundColor: activeTab === 'my' ? '#722ed1' : '#d9d9d9',
                                    }}
                                />
                            </Space>
                        ),
                        children: (
                            <div style={{ marginTop: 8 }}>
                                <Table
                                    columns={myColumns}
                                    dataSource={myTickets}
                                    rowKey="escalation_id"
                                    pagination={false}
                                    size="small"
                                    locale={{
                                        emptyText: (
                                            <Empty
                                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                                description="You haven't raised any escalations on this order."
                                            />
                                        ),
                                    }}
                                />
                            </div>
                        ),
                    },
                ]}
            />

            {/* Support Ticket Details & Action Modal */}
            <Modal
                title={
                    <Space>
                        <ExclamationCircleOutlined style={{ color: '#1677ff' }} />
                        <span>Support Ticket Details &amp; Action</span>
                        {supportModalTicket && (
                            <Tag color="blue" style={{ fontFamily: 'monospace' }}>
                                #SUP-{supportModalTicket.escalation_id.slice(0, 6).toUpperCase()}
                            </Tag>
                        )}
                    </Space>
                }
                open={!!supportModalTicket}
                onCancel={() => setSupportModalTicket(null)}
                footer={[
                    <Button key="close" onClick={() => setSupportModalTicket(null)}>
                        Close
                    </Button>,
                ]}
                width={650}
            >
                {supportModalTicket && (
                    <div style={{ marginTop: 12 }}>
                        {/* Section A: Support Context */}
                        <Card
                            size="small"
                            style={{ background: '#f9f9fc', border: '1px solid #e8e8ed', borderRadius: 6 }}
                        >
                            <Descriptions column={2} size="small">
                                <Descriptions.Item label="Category">
                                    <Tag color="geekblue">{escLabel(supportModalTicket.category)}</Tag>
                                </Descriptions.Item>
                                <Descriptions.Item label="Current Status">
                                    <Tag
                                        color={
                                            supportModalTicket.status === 'open'
                                                ? 'red'
                                                : supportModalTicket.status === 'acknowledged'
                                                ? 'gold'
                                                : 'green'
                                        }
                                        style={{ textTransform: 'capitalize', fontWeight: 600 }}
                                    >
                                        {supportModalTicket.status}
                                    </Tag>
                                </Descriptions.Item>
                                <Descriptions.Item label="Created By">
                                    <Text strong>{supportModalTicket.raised_by_name}</Text>
                                </Descriptions.Item>
                                <Descriptions.Item label="Created At">
                                    {supportModalTicket.created_at
                                        ? slt(supportModalTicket.created_at).format('MMM DD, YYYY · hh:mm A')
                                        : '—'}
                                </Descriptions.Item>
                            </Descriptions>

                            <Divider style={{ margin: '8px 0' }} />
                            <div>
                                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
                                    Support Agent Message &amp; Customer Request:
                                </Text>
                                <Paragraph
                                    style={{
                                        background: '#fff',
                                        padding: '10px 12px',
                                        borderRadius: 6,
                                        border: '1px solid #eee',
                                        fontSize: 13,
                                        marginBottom: 0,
                                        whiteSpace: 'pre-wrap',
                                    }}
                                >
                                    {supportModalTicket.message}
                                </Paragraph>
                            </div>
                        </Card>

                        {/* Step 1: Acknowledge */}
                        <div style={{ marginTop: 16 }}>
                            <Title level={5} style={{ fontSize: 14 }}>
                                Step 1: Acknowledge Ticket
                            </Title>
                            {supportModalTicket.status === 'open' ? (
                                <Alert
                                    type="warning"
                                    showIcon
                                    message="Ticket is currently Open"
                                    description={
                                        <div style={{ marginTop: 6 }}>
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                Click to confirm the branch manager has seen this issue and is working on it.
                                            </Text>
                                            <div style={{ marginTop: 8 }}>
                                                <Button
                                                    type="primary"
                                                    size="small"
                                                    loading={updateMut.isPending}
                                                    onClick={() => handleAcknowledge(supportModalTicket)}
                                                >
                                                    Acknowledge Ticket
                                                </Button>
                                            </div>
                                        </div>
                                    }
                                />
                            ) : (
                                <Alert
                                    type="success"
                                    showIcon
                                    message={
                                        <span>
                                            Acknowledged by{' '}
                                            <b>{supportModalTicket.handled_by_name || 'Branch Manager'}</b>
                                            {supportModalTicket.acknowledged_at && (
                                                <> at {slt(supportModalTicket.acknowledged_at).format('MMM DD, YYYY · hh:mm A')}</>
                                            )}
                                        </span>
                                    }
                                />
                            )}
                        </div>

                        {/* Step 2: Resolve with Note */}
                        <div style={{ marginTop: 16 }}>
                            <Title level={5} style={{ fontSize: 14 }}>
                                Step 2: Resolution &amp; Close Ticket
                            </Title>
                            {supportModalTicket.status === 'resolved' ? (
                                <Alert
                                    type="info"
                                    showIcon
                                    icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                                    message={
                                        <span>
                                            Resolved by <b>{supportModalTicket.handled_by_name || 'Admin'}</b>
                                            {supportModalTicket.resolved_at && (
                                                <> on {slt(supportModalTicket.resolved_at).format('MMM DD, YYYY · hh:mm A')}</>
                                            )}
                                        </span>
                                    }
                                    description={
                                        <div style={{ marginTop: 6 }}>
                                            <Text strong style={{ fontSize: 12 }}>
                                                Resolution Note:
                                            </Text>
                                            <div
                                                style={{
                                                    background: '#fff',
                                                    padding: '8px 12px',
                                                    borderRadius: 4,
                                                    border: '1px solid #d9d9d9',
                                                    marginTop: 4,
                                                    fontSize: 13,
                                                }}
                                            >
                                                {supportModalTicket.resolution_note || 'Resolved with no extra notes.'}
                                            </div>
                                        </div>
                                    }
                                />
                            ) : (
                                <div>
                                    <Text type="secondary" style={{ fontSize: 12, marginBottom: 6, display: 'block' }}>
                                        State how the issue was resolved (e.g. "Order held at branch counter", "Address updated with rider"):
                                    </Text>
                                    <Input.TextArea
                                        rows={3}
                                        placeholder="Enter resolution note before closing ticket…"
                                        value={resolutionNote}
                                        onChange={(e) => setResolutionNote(e.target.value)}
                                        maxLength={1000}
                                        showCount
                                    />
                                    <div style={{ marginTop: 10, textAlign: 'right' }}>
                                        <Button
                                            type="primary"
                                            style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                                            loading={updateMut.isPending}
                                            disabled={!canDecide}
                                            onClick={() => handleResolve(supportModalTicket)}
                                        >
                                            Submit &amp; Resolve
                                        </Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </Modal>

            {/* My Ticket Details Modal */}
            <Modal
                title={
                    <Space>
                        <FlagOutlined style={{ color: '#722ed1' }} />
                        <span>My Escalation Ticket Details</span>
                        {myModalTicket && (
                            <Tag color="purple" style={{ fontFamily: 'monospace' }}>
                                #ESC-{myModalTicket.escalation_id.slice(0, 6).toUpperCase()}
                            </Tag>
                        )}
                    </Space>
                }
                open={!!myModalTicket}
                onCancel={() => setMyModalTicket(null)}
                footer={[
                    <Button key="close" onClick={() => setMyModalTicket(null)}>
                        Close
                    </Button>,
                ]}
                width={600}
            >
                {myModalTicket && (
                    <div style={{ marginTop: 12 }}>
                        <Descriptions column={2} size="small" bordered>
                            <Descriptions.Item label="Category">
                                <Tag color="purple">{escLabel(myModalTicket.category)}</Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="Status">
                                <Tag
                                    color={myModalTicket.status === 'resolved' ? 'green' : 'orange'}
                                    style={{ textTransform: 'capitalize' }}
                                >
                                    {myModalTicket.status === 'open' ? 'In Review' : myModalTicket.status}
                                </Tag>
                            </Descriptions.Item>
                            <Descriptions.Item label="Submitted Date">
                                {myModalTicket.created_at
                                    ? slt(myModalTicket.created_at).format('MMM DD, YYYY · hh:mm A')
                                    : '—'}
                            </Descriptions.Item>
                            <Descriptions.Item label="Raised By">
                                {myModalTicket.raised_by_name}
                            </Descriptions.Item>
                        </Descriptions>

                        <div style={{ marginTop: 14 }}>
                            <Text strong style={{ fontSize: 13 }}>
                                My Original Description:
                            </Text>
                            <div
                                style={{
                                    marginTop: 4,
                                    padding: '10px 12px',
                                    background: '#fafafa',
                                    borderRadius: 6,
                                    border: '1px solid #eee',
                                    fontSize: 13,
                                }}
                            >
                                {myModalTicket.message}
                            </div>
                        </div>

                        <div style={{ marginTop: 16 }}>
                            <Text strong style={{ fontSize: 13 }}>
                                Super Admin Reply / Response:
                            </Text>
                            {myModalTicket.resolution_note ? (
                                <Alert
                                    style={{ marginTop: 6 }}
                                    type="success"
                                    showIcon
                                    message={
                                        <span>
                                            Response by <b>{myModalTicket.handled_by_name || 'Super Admin / HO'}</b>
                                            {myModalTicket.resolved_at && (
                                                <> · {slt(myModalTicket.resolved_at).format('MMM DD, YYYY · hh:mm A')}</>
                                            )}
                                        </span>
                                    }
                                    description={
                                        <div style={{ marginTop: 4, fontSize: 13 }}>
                                            {myModalTicket.resolution_note}
                                        </div>
                                    }
                                />
                            ) : (
                                <Alert
                                    style={{ marginTop: 6 }}
                                    type="info"
                                    showIcon
                                    message="Under Review"
                                    description="This escalation has been routed to Head Office / Super Admin and is currently awaiting action."
                                />
                            )}
                        </div>
                    </div>
                )}
            </Modal>

            {/* Raise Escalation Modal */}
            <Modal
                title={
                    <Space>
                        <FlagOutlined style={{ color: '#ff4d4f' }} />
                        <span>Raise Escalation Ticket</span>
                    </Space>
                }
                open={raiseModalOpen}
                onCancel={() => setRaiseModalOpen(false)}
                okText="Submit Ticket"
                confirmLoading={raiseMut.isPending}
                onOk={() => {
                    if (!raiseMessage.trim()) {
                        message.warning('Please enter a description for the escalation.');
                        return;
                    }
                    raiseMut.mutate();
                }}
            >
                <Form layout="vertical" style={{ marginTop: 12 }}>
                    <Form.Item label="Escalation Category" required>
                        <Select
                            value={raiseCategory}
                            onChange={(val) => setRaiseCategory(val)}
                            options={ESC_CATEGORIES}
                        />
                    </Form.Item>
                    <Form.Item
                        label={
                            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                                <span>What needs attention?</span>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {raiseMessage.length} / 2000
                                </Text>
                            </Space>
                        }
                        required
                    >
                        <Input.TextArea
                            rows={4}
                            placeholder="Explain the issue clearly (e.g. customer request to cancel before handover, address discrepancy, item stock issue)…"
                            value={raiseMessage}
                            onChange={(e) => setRaiseMessage(e.target.value)}
                            maxLength={2000}
                        />
                    </Form.Item>
                </Form>
            </Modal>
        </Card>
    );
};

export default EscalationSection;
