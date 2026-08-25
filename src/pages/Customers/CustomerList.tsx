/**
 * Customer Management (Super Admin + Customer Support)
 * Table of customer accounts with search, pagination and an active/inactive
 * toggle. TanStack Query against /api/v1/admin/customers.
 */
import React, { useState } from 'react';
import { Card, Table, Input, Tag, Switch, Space, Typography, App, Button } from 'antd';
import { SearchOutlined, UserOutlined, CheckCircleOutlined, DownloadOutlined } from '@ant-design/icons';
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

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [search, setSearch] = useState('');
    const [exporting, setExporting] = useState(false);

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

    const columns: ColumnsType<Customer> = [
        {
            title: 'Name',
            key: 'name',
            render: (_, record) => (
                <Space>
                    <UserOutlined style={{ color: record.is_active ? '#1890ff' : '#bbb' }} />
                    <Text strong>{record.full_name || 'Unnamed'}</Text>
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
            width: 160,
            render: (_, record) => (
                <Space>
                    <Switch
                        size="small"
                        checked={record.is_active}
                        loading={
                            statusMutation.isPending &&
                            statusMutation.variables?.id === record.user_id
                        }
                        onChange={(checked) =>
                            statusMutation.mutate({ id: record.user_id, isActive: checked })
                        }
                    />
                    <Tag color={record.is_active ? 'green' : 'default'}>
                        {record.is_active ? 'Active' : 'Inactive'}
                    </Tag>
                </Space>
            ),
        },
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
                    scroll={{ x: 'max-content' }}
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
        </div>
    );
};

export default CustomerList;
