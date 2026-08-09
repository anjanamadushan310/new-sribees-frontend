/**
 * Low Stock Report Page (Module 7.5a)
 *
 * Every row comes from /api/v1/admin/inventory?low_stock_only=true, which is
 * branch-scoped on the server — a Branch/Inventory Manager only ever sees
 * their own branch's alerts, a Super Admin sees the network and can narrow
 * with the branch filter. "Request Transfer" creates a real pending
 * /api/v1/admin/transfers row (see StockTransfers.tsx for the approve →
 * ship → complete lifecycle).
 */
import React, { useMemo, useState } from 'react';
import {
    Card,
    Row,
    Col,
    Statistic,
    Table,
    Alert,
    Select,
    Tag,
    Progress,
    Space,
    Typography,
    Button,
    Input,
    Modal,
    Form,
    InputNumber,
    App,
} from 'antd';
import {
    WarningOutlined,
    ExclamationCircleOutlined,
    ShopOutlined,
    SendOutlined,
    ReloadOutlined,
} from '@ant-design/icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '../../hooks/usePermissions';
import { inventoryApi } from '../../api/inventory.api';
import type { InventoryItem } from '../../api/inventory.api';
import { transfersApi } from '../../api/transfers.api';
import { apiErrorMessage } from '../../utils/analytics';

const { Title, Text } = Typography;
const { Search } = Input;

type Severity = 'critical' | 'warning';

/** <=25% of threshold is a "we might run out today" alert; the rest is "reorder soon". */
const severityOf = (item: InventoryItem): Severity =>
    item.stock_quantity === 0 || item.stock_quantity / Math.max(item.low_stock_threshold, 1) <= 0.25
        ? 'critical'
        : 'warning';

const SEVERITY_CONFIG: Record<Severity, { color: string; icon: React.ReactNode; label: string }> = {
    critical: { color: '#ff4d4f', icon: <ExclamationCircleOutlined />, label: 'Critical' },
    warning: { color: '#faad14', icon: <WarningOutlined />, label: 'Warning' },
};

const LowStockReportPage: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const { isSuperAdmin } = usePermissions();

    const [selectedBranch, setSelectedBranch] = useState<string | undefined>(undefined);
    const [selectedSeverity, setSelectedSeverity] = useState<Severity | 'all'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [selectedAlert, setSelectedAlert] = useState<InventoryItem | null>(null);
    const [transferForm] = Form.useForm();

    // Unrestricted list (id/name/code only) so a Branch/Inventory Manager
    // can pick a source branch too, not just Super Admin — /admin/branches
    // itself is Super Admin only.
    const { data: branches = [] } = useQuery({
        queryKey: ['admin', 'transfers', 'branches'],
        queryFn: transfersApi.branches,
    });

    const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
        queryKey: ['admin', 'inventory', 'low-stock-report', selectedBranch],
        queryFn: () =>
            inventoryApi.list({
                low_stock_only: true,
                limit: 100,
                branch_id: isSuperAdmin ? selectedBranch : undefined,
            }),
    });
    const alerts = useMemo(() => data?.items ?? [], [data]);

    const filteredAlerts = useMemo(
        () =>
            alerts.filter((item) => {
                const severity = severityOf(item);
                if (selectedSeverity !== 'all' && severity !== selectedSeverity) return false;
                if (searchQuery && !item.product_name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
                return true;
            }),
        [alerts, selectedSeverity, searchQuery]
    );

    const stats = useMemo(() => {
        const critical = alerts.filter((a) => severityOf(a) === 'critical').length;
        return { total: alerts.length, critical, warning: alerts.length - critical };
    }, [alerts]);

    const createTransfer = useMutation({
        mutationFn: transfersApi.create,
        onSuccess: () => {
            message.success('Stock transfer request submitted');
            setIsTransferModalOpen(false);
            transferForm.resetFields();
            queryClient.invalidateQueries({ queryKey: ['admin', 'transfers'] });
        },
        onError: (err) => message.error(apiErrorMessage(err)),
    });

    const handleRequestTransfer = (alert: InventoryItem) => {
        setSelectedAlert(alert);
        transferForm.setFieldsValue({
            product: alert.product_name,
            from_branch_id: undefined,
            quantity: Math.max(alert.low_stock_threshold - alert.stock_quantity, 1),
        });
        setIsTransferModalOpen(true);
    };

    const handleSubmitTransfer = () => {
        transferForm.validateFields().then((values) => {
            if (!selectedAlert) return;
            createTransfer.mutate({
                from_branch_id: values.from_branch_id,
                to_branch_id: selectedAlert.branch_id,
                product_id: selectedAlert.product_id,
                quantity: values.quantity,
            });
        });
    };

    const columns = [
        {
            title: 'Severity',
            key: 'severity',
            width: 100,
            render: (_: unknown, record: InventoryItem) => {
                const config = SEVERITY_CONFIG[severityOf(record)];
                return (
                    <Tag color={config.color} icon={config.icon}>
                        {config.label}
                    </Tag>
                );
            },
        },
        {
            title: 'Product',
            key: 'product',
            render: (record: InventoryItem) => (
                <Space direction="vertical" size={0}>
                    <Text strong>{record.product_name}</Text>
                    {record.sku && <Text type="secondary" style={{ fontSize: 12 }}>{record.sku}</Text>}
                </Space>
            ),
        },
        ...(isSuperAdmin
            ? [
                  {
                      title: 'Branch',
                      dataIndex: 'branch_name',
                      key: 'branch_name',
                      render: (name: string) => (
                          <Space>
                              <ShopOutlined />
                              {name}
                          </Space>
                      ),
                  },
              ]
            : []),
        {
            title: 'Stock Level',
            key: 'stock',
            render: (record: InventoryItem) => {
                const percentage = Math.round((record.stock_quantity / Math.max(record.low_stock_threshold, 1)) * 100);
                return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Progress
                            percent={percentage}
                            size="small"
                            status={percentage <= 25 ? 'exception' : 'normal'}
                            style={{ width: 100 }}
                            format={() => ''}
                        />
                        <Text strong>{record.stock_quantity}</Text>
                        <Text type="secondary">/ {record.low_stock_threshold}</Text>
                    </div>
                );
            },
        },
        {
            title: 'Needed',
            key: 'needed',
            width: 100,
            render: (record: InventoryItem) => (
                <Tag color="red">+{Math.max(record.low_stock_threshold - record.stock_quantity, 0)}</Tag>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 150,
            render: (record: InventoryItem) => (
                <Button type="primary" size="small" icon={<SendOutlined />} onClick={() => handleRequestTransfer(record)}>
                    Transfer
                </Button>
            ),
        },
    ];

    return (
        <div style={{ padding: '24px' }}>
            <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                <div>
                    <Title level={2} style={{ margin: 0 }}>
                        <Space>
                            <WarningOutlined style={{ color: '#faad14' }} />
                            Low Stock Report
                        </Space>
                    </Title>
                    <Text type="secondary">Monitor and manage inventory levels across branches</Text>
                </div>
                <Button icon={<ReloadOutlined />} onClick={() => refetch()} loading={isRefetching}>
                    Refresh
                </Button>
            </div>

            {isError && (
                <Alert message={apiErrorMessage(error)} type="error" showIcon closable style={{ marginBottom: '24px' }} />
            )}

            <Row gutter={[16, 16]} style={{ marginBottom: '24px' }}>
                <Col xs={12} sm={6}>
                    <Card>
                        <Statistic title="Total Alerts" value={stats.total} loading={isLoading} prefix={<WarningOutlined style={{ color: '#8c8c8c' }} />} />
                    </Card>
                </Col>
                <Col xs={12} sm={6}>
                    <Card style={{ borderLeft: '4px solid #ff4d4f' }}>
                        <Statistic title="Critical" value={stats.critical} loading={isLoading} styles={{ content: { color: '#ff4d4f' } }} prefix={<ExclamationCircleOutlined />} />
                    </Card>
                </Col>
                <Col xs={12} sm={8}>
                    <Card style={{ borderLeft: '4px solid #faad14' }}>
                        <Statistic title="Warning" value={stats.warning} loading={isLoading} styles={{ content: { color: '#faad14' } }} prefix={<WarningOutlined />} />
                    </Card>
                </Col>
            </Row>

            <Card style={{ marginBottom: '24px' }}>
                <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
                    <Space wrap>
                        <Search
                            placeholder="Search products..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{ width: 250 }}
                            allowClear
                        />
                        {isSuperAdmin && (
                            <Select
                                placeholder="All branches"
                                value={selectedBranch}
                                onChange={setSelectedBranch}
                                style={{ width: 180 }}
                                allowClear
                                options={branches.map((b) => ({ label: b.name, value: b.branch_id }))}
                            />
                        )}
                        <Select
                            value={selectedSeverity}
                            onChange={setSelectedSeverity}
                            style={{ width: 150 }}
                            options={[
                                { label: 'All Severity', value: 'all' },
                                { label: 'Critical', value: 'critical' },
                                { label: 'Warning', value: 'warning' },
                            ]}
                        />
                    </Space>
                    <Text type="secondary">
                        Showing {filteredAlerts.length} of {alerts.length} alerts
                    </Text>
                </Space>
            </Card>

            <Card>
                <Table
                    dataSource={filteredAlerts}
                    columns={columns}
                    rowKey="inventory_id"
                    loading={isLoading}
                    pagination={{ pageSize: 20 }}
                />
            </Card>

            <Modal
                title={
                    <Space>
                        <SendOutlined />
                        Request Stock Transfer
                    </Space>
                }
                open={isTransferModalOpen}
                onOk={handleSubmitTransfer}
                confirmLoading={createTransfer.isPending}
                onCancel={() => setIsTransferModalOpen(false)}
                okText="Submit Request"
            >
                <Form form={transferForm} layout="vertical">
                    <Form.Item name="product" label="Product">
                        <Input disabled />
                    </Form.Item>
                    <Form.Item
                        name="from_branch_id"
                        label="Transfer From"
                        rules={[{ required: true, message: 'Select the source branch' }]}
                        extra={selectedAlert ? `Receiving into ${selectedAlert.branch_name}` : undefined}
                    >
                        <Select
                            placeholder="Select source branch"
                            options={branches
                                .filter((b) => b.branch_id !== selectedAlert?.branch_id)
                                .map((b) => ({ label: b.name, value: b.branch_id }))}
                        />
                    </Form.Item>
                    <Form.Item
                        name="quantity"
                        label="Quantity"
                        rules={[{ required: true, message: 'Enter a quantity' }]}
                    >
                        <InputNumber min={1} style={{ width: '100%' }} />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default LowStockReportPage;
