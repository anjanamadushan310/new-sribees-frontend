/**
 * Stock Transfers Page (Module 7.5b)
 *
 * Branch-to-branch inventory movement: request, approve/reject, ship,
 * complete. Targets /api/v1/admin/transfers — a scoped admin (Branch
 * Manager, Inventory Manager) sees and acts on transfers where their own
 * branch is either party; approve/ship/complete is further restricted to
 * Super Admin and Inventory Manager (canApproveTransfers).
 */
import React, { useState } from 'react';
import {
    Card,
    Table,
    Spin,
    Alert,
    Select,
    Tag,
    Space,
    Typography,
    Button,
    Modal,
    Form,
    InputNumber,
    Input,
    Tabs,
    Tooltip,
    Popconfirm,
    App,
    Statistic,
    Row,
    Col,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    SwapOutlined,
    SendOutlined,
    CheckOutlined,
    CloseOutlined,
    ClockCircleOutlined,
    PlusOutlined,
    ShopOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { useAuthStore } from '../../store/authStore';
import { usePermissions } from '../../hooks/usePermissions';
import { inventoryApi } from '../../api/inventory.api';
import {
    transfersApi,
    TRANSFER_STATUS_META,
    TRANSFER_STATUSES,
} from '../../api/transfers.api';
import type { StockTransfer, TransferStatus } from '../../api/transfers.api';
import { apiErrorMessage } from '../../utils/analytics';

dayjs.extend(relativeTime);

const { Title, Text } = Typography;
const { TextArea } = Input;

const StockTransfers: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<'all' | TransferStatus>('all');
    const [isNewTransferModalOpen, setIsNewTransferModalOpen] = useState(false);
    const [fromBranchId, setFromBranchId] = useState<string | undefined>(undefined);

    const user = useAuthStore((state) => state.user);
    const { isSuperAdmin, canApproveTransfers } = usePermissions();
    const [form] = Form.useForm();

    const { data: branches = [] } = useQuery({
        queryKey: ['admin', 'transfers', 'branches'],
        queryFn: transfersApi.branches,
    });

    // Fetched unfiltered and sliced client-side: the stat cards and tab
    // badges need every status's count regardless of which tab is open, and
    // 100 rows is small enough that a second server round-trip per tab
    // switch buys nothing.
    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['admin', 'transfers'],
        queryFn: () => transfersApi.list({ limit: 100 }),
    });
    const allTransfers = data?.transfers ?? [];
    const transfers = activeTab === 'all' ? allTransfers : allTransfers.filter((t) => t.status === activeTab);

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'transfers'] });

    const approveMutation = useMutation({
        mutationFn: (id: string) => transfersApi.approve(id),
        onSuccess: () => {
            message.success('Transfer approved — stock committed from the source branch.');
            invalidate();
        },
        onError: (err) => message.error(apiErrorMessage(err)),
    });
    const rejectMutation = useMutation({
        mutationFn: (id: string) => transfersApi.reject(id),
        onSuccess: () => {
            message.info('Transfer rejected.');
            invalidate();
        },
        onError: (err) => message.error(apiErrorMessage(err)),
    });
    const shipMutation = useMutation({
        mutationFn: (id: string) => transfersApi.ship(id),
        onSuccess: () => {
            message.success('Marked as in transit.');
            invalidate();
        },
        onError: (err) => message.error(apiErrorMessage(err)),
    });
    const completeMutation = useMutation({
        mutationFn: (id: string) => transfersApi.complete(id),
        onSuccess: () => {
            message.success('Transfer completed — stock arrived at the destination branch.');
            invalidate();
        },
        onError: (err) => message.error(apiErrorMessage(err)),
    });

    // Product picker for the New Transfer modal: whatever the chosen source
    // branch actually stocks, so a request can never name a product that
    // branch doesn't carry.
    const { data: sourceInventory, isFetching: loadingProducts } = useQuery({
        queryKey: ['admin', 'inventory', 'for-transfer', fromBranchId],
        queryFn: () => inventoryApi.list({ branch_id: fromBranchId, limit: 100 }),
        enabled: !!fromBranchId,
    });

    const createMutation = useMutation({
        mutationFn: transfersApi.create,
        onSuccess: () => {
            message.success('Transfer request created');
            setIsNewTransferModalOpen(false);
            form.resetFields();
            setFromBranchId(undefined);
            invalidate();
        },
        onError: (err) => message.error(apiErrorMessage(err)),
    });

    const handleNewTransfer = () => {
        form.validateFields().then((values) => {
            createMutation.mutate({
                from_branch_id: values.from_branch_id,
                // Scoped admins always receive into their own branch; Super
                // Admin picks a destination explicitly.
                to_branch_id: isSuperAdmin ? values.to_branch_id : user?.branch_id,
                product_id: values.product_id,
                quantity: values.quantity,
                notes: values.notes,
            });
        });
    };

    const columns: ColumnsType<StockTransfer> = [
        {
            title: 'Transfer',
            key: 'transfer',
            render: (_, record) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{record.product_name}</Text>
                    <Tag color="blue" style={{ marginTop: 4 }}>Qty: {record.quantity}</Tag>
                </Space>
            ),
        },
        {
            title: 'From → To',
            key: 'branches',
            render: (_, record) => (
                <Space>
                    <Tag icon={<ShopOutlined />}>{record.from_branch_name}</Tag>
                    <SwapOutlined />
                    <Tag icon={<ShopOutlined />} color="green">{record.to_branch_name}</Tag>
                </Space>
            ),
        },
        {
            title: 'Status',
            key: 'status',
            render: (_, record) => {
                const meta = TRANSFER_STATUS_META[record.status];
                return <Tag color={meta.color}>{meta.label}</Tag>;
            },
        },
        {
            title: 'Requested',
            key: 'requested',
            render: (_, record) => (
                <Space direction="vertical" size={0}>
                    <Text>{record.requested_by_name}</Text>
                    <Tooltip title={record.requested_at ? dayjs(record.requested_at).format('YYYY-MM-DD HH:mm') : ''}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            <ClockCircleOutlined /> {record.requested_at ? dayjs(record.requested_at).fromNow() : '—'}
                        </Text>
                    </Tooltip>
                </Space>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 220,
            render: (_, record) => {
                if (!canApproveTransfers) return <Text type="secondary">—</Text>;

                if (record.status === 'pending') {
                    return (
                        <Space>
                            <Popconfirm title="Approve this transfer?" onConfirm={() => approveMutation.mutate(record.transfer_id)}>
                                <Button type="primary" size="small" icon={<CheckOutlined />} loading={approveMutation.isPending}>
                                    Approve
                                </Button>
                            </Popconfirm>
                            <Popconfirm title="Reject this transfer?" onConfirm={() => rejectMutation.mutate(record.transfer_id)}>
                                <Button danger size="small" icon={<CloseOutlined />} loading={rejectMutation.isPending}>
                                    Reject
                                </Button>
                            </Popconfirm>
                        </Space>
                    );
                }
                if (record.status === 'approved') {
                    return (
                        <Button size="small" icon={<SendOutlined />} loading={shipMutation.isPending} onClick={() => shipMutation.mutate(record.transfer_id)}>
                            Mark In Transit
                        </Button>
                    );
                }
                if (record.status === 'in_transit') {
                    return (
                        <Button type="primary" size="small" icon={<CheckOutlined />} loading={completeMutation.isPending} onClick={() => completeMutation.mutate(record.transfer_id)}>
                            Complete
                        </Button>
                    );
                }
                return <Text type="secondary">—</Text>;
            },
        },
    ];

    const tabItems = [
        { key: 'all', label: `All (${allTransfers.length})` },
        ...TRANSFER_STATUSES.map((s) => ({
            key: s,
            label: `${TRANSFER_STATUS_META[s].label} (${allTransfers.filter((t) => t.status === s).length})`,
        })),
    ];

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <Title level={2} style={{ margin: 0 }}>
                        <Space>
                            <SwapOutlined />
                            Stock Transfers
                        </Space>
                    </Title>
                    <Text type="secondary">Move stock between branches</Text>
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => setIsNewTransferModalOpen(true)}>
                    New Transfer Request
                </Button>
            </div>

            {isError && (
                <Alert message={apiErrorMessage(error)} type="error" showIcon closable style={{ marginBottom: '24px' }} />
            )}

            <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
                {TRANSFER_STATUSES.map((s) => (
                    <Col xs={12} sm={6} key={s}>
                        <Card style={{ borderLeft: `4px solid ${TRANSFER_STATUS_META[s].color === 'gold' ? '#d97706' : TRANSFER_STATUS_META[s].color}` }}>
                            <Statistic
                                title={TRANSFER_STATUS_META[s].label}
                                value={allTransfers.filter((t) => t.status === s).length}
                                loading={isLoading}
                            />
                        </Card>
                    </Col>
                ))}
            </Row>

            <Card>
                <Space direction="vertical" style={{ width: '100%' }} size="large">
                    <Tabs activeKey={activeTab} onChange={(k) => setActiveTab(k as typeof activeTab)} items={tabItems} />
                    {isLoading ? (
                        <div style={{ textAlign: 'center', padding: 48 }}>
                            <Spin size="large" />
                        </div>
                    ) : (
                        <Table
                            dataSource={transfers}
                            columns={columns}
                            rowKey="transfer_id"
                            pagination={{ pageSize: 10, showSizeChanger: true }}
                        />
                    )}
                </Space>
            </Card>

            <Modal
                title="New Stock Transfer Request"
                open={isNewTransferModalOpen}
                onOk={handleNewTransfer}
                confirmLoading={createMutation.isPending}
                onCancel={() => {
                    setIsNewTransferModalOpen(false);
                    form.resetFields();
                    setFromBranchId(undefined);
                }}
                okText="Submit Request"
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="from_branch_id"
                        label="From Branch"
                        rules={[{ required: true, message: 'Please select the source branch' }]}
                    >
                        <Select
                            placeholder="Select source branch"
                            onChange={(v) => {
                                setFromBranchId(v);
                                form.setFieldValue('product_id', undefined);
                            }}
                        >
                            {branches
                                .filter((b) => isSuperAdmin || b.branch_id !== user?.branch_id)
                                .map((branch) => (
                                    <Select.Option key={branch.branch_id} value={branch.branch_id}>
                                        {branch.name}
                                    </Select.Option>
                                ))}
                        </Select>
                    </Form.Item>

                    {isSuperAdmin ? (
                        <Form.Item
                            name="to_branch_id"
                            label="To Branch"
                            rules={[{ required: true, message: 'Please select the destination branch' }]}
                        >
                            <Select placeholder="Select destination branch">
                                {branches
                                    .filter((b) => b.branch_id !== fromBranchId)
                                    .map((branch) => (
                                        <Select.Option key={branch.branch_id} value={branch.branch_id}>
                                            {branch.name}
                                        </Select.Option>
                                    ))}
                            </Select>
                        </Form.Item>
                    ) : (
                        <Form.Item label="To Branch">
                            <Input disabled value={`${user?.branch_name ?? 'Your branch'} (you)`} />
                        </Form.Item>
                    )}

                    <Form.Item
                        name="product_id"
                        label="Product"
                        rules={[{ required: true, message: 'Please select a product' }]}
                    >
                        <Select
                            placeholder={fromBranchId ? 'Select a product' : 'Choose the source branch first'}
                            disabled={!fromBranchId}
                            loading={loadingProducts}
                            showSearch
                            optionFilterProp="label"
                            options={(sourceInventory?.items ?? [])
                                .filter((i) => i.stock_quantity > 0)
                                .map((i) => ({
                                    label: `${i.product_name} (${i.stock_quantity} in stock)`,
                                    value: i.product_id,
                                }))}
                        />
                    </Form.Item>

                    <Form.Item
                        name="quantity"
                        label="Quantity"
                        rules={[{ required: true, message: 'Please enter a quantity' }]}
                    >
                        <InputNumber min={1} style={{ width: '100%' }} placeholder="Enter quantity" />
                    </Form.Item>

                    <Form.Item name="notes" label="Notes">
                        <TextArea rows={3} placeholder="Add any notes or reason for transfer" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default StockTransfers;
