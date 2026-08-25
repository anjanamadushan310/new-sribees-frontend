/**
 * Customer Management (Super Admin + Customer Support)
 * Table of customer accounts with search, pagination and an active/inactive
 * toggle. TanStack Query against /api/v1/admin/customers.
 */
import React, { useState } from 'react';
import { Card, Table, Input, Tag, Switch, Space, Typography, App } from 'antd';
import { SearchOutlined, UserOutlined, CheckCircleOutlined } from '@ant-design/icons';
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
            <Title level={3} style={{ marginTop: 0 }}>
                <Space>
                    <UserOutlined />
                    Customers
                </Space>
            </Title>

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
