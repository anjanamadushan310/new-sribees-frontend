/**
 * My Branch (Branch Manager self-service)
 *
 * A Super Admin creates a branch inactive by default — it's invisible to
 * customers until the manager who actually runs it says it's ready. This is
 * that switch: PATCH /admin/branches/{id}/status, which a Branch Manager may
 * call for their own branch only (see admin_branches.set_branch_status).
 */
import React from 'react';
import {
    Alert,
    Card,
    Descriptions,
    Skeleton,
    Space,
    Switch,
    Table,
    Tag,
    Typography,
    App,
} from 'antd';
import { ShopOutlined, AppstoreOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { branchesApi } from '../../api/branches.api';
import { branchCategoriesApi } from '../../api/branchCategories.api';
import type { BranchCategoryItem } from '../../api/branchCategories.api';

const { Title, Text } = Typography;

const MyBranch: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();

    const { data: branches, isLoading, isError } = useQuery({
        queryKey: ['admin', 'branches'],
        queryFn: branchesApi.list,
    });

    // A Branch Manager's list is server-scoped to just their own branch.
    const branch = branches?.[0];

    const statusMutation = useMutation({
        mutationFn: (isActive: boolean) => {
            if (!branch) throw new Error('No branch loaded');
            return branchesApi.setStatus(branch.branch_id, isActive);
        },
        onSuccess: (updated) => {
            message.success(updated.is_active ? 'Branch activated.' : 'Branch deactivated.');
            queryClient.invalidateQueries({ queryKey: ['admin', 'branches'] });
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to update branch status.'),
    });

    const categoriesQuery = useQuery({
        queryKey: ['admin', 'branch-categories'],
        queryFn: () => branchCategoriesApi.list(),
        enabled: !!branch,
    });

    const categoryStatusMutation = useMutation({
        mutationFn: ({ categoryId, isActive }: { categoryId: string; isActive: boolean }) =>
            branchCategoriesApi.setStatus(categoryId, isActive),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['admin', 'branch-categories'] });
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to update category visibility.'),
    });

    const categoryColumns: ColumnsType<BranchCategoryItem> = [
        {
            title: 'Category',
            key: 'name',
            render: (_, record) => (
                <Space>
                    {record.parent_category_id && (
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            ↳
                        </Text>
                    )}
                    <Text strong={!record.parent_category_id}>{record.name}</Text>
                    {!record.globally_active && <Tag color="default">Globally inactive</Tag>}
                </Space>
            ),
        },
        {
            title: 'Visible in this branch',
            key: 'is_active',
            width: 180,
            render: (_, record) => (
                <Switch
                    checked={record.is_active}
                    disabled={!record.globally_active}
                    loading={
                        categoryStatusMutation.isPending &&
                        categoryStatusMutation.variables?.categoryId === record.category_id
                    }
                    checkedChildren="Visible"
                    unCheckedChildren="Hidden"
                    onChange={(checked) =>
                        categoryStatusMutation.mutate({
                            categoryId: record.category_id,
                            isActive: checked,
                        })
                    }
                />
            ),
        },
    ];

    if (isLoading) {
        return (
            <Card>
                <Skeleton active />
            </Card>
        );
    }

    if (isError || !branch) {
        return (
            <Alert
                type="warning"
                showIcon
                message="No branch assigned"
                description="Your account isn't assigned to a branch yet — ask a Super Admin to assign one."
            />
        );
    }

    return (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card>
            <Title level={4} style={{ marginTop: 0 }}>
                <Space>
                    <ShopOutlined />
                    {branch.name}
                </Space>
            </Title>

            {!branch.is_active && (
                <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="This branch is inactive"
                    description="Customers can't see this branch or anything stocked in it until you activate it below."
                />
            )}

            <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
                <Descriptions.Item label="Code">{branch.code}</Descriptions.Item>
                <Descriptions.Item label="Location">
                    {branch.district || '—'}
                    {branch.province ? `, ${branch.province}` : ''}
                </Descriptions.Item>
                <Descriptions.Item label="Status">
                    <Tag color={branch.is_active ? 'green' : 'default'}>
                        {branch.is_active ? 'Active' : 'Inactive'}
                    </Tag>
                </Descriptions.Item>
            </Descriptions>

            <Space direction="vertical">
                <Text strong>Branch visible to customers</Text>
                <Switch
                    checked={branch.is_active}
                    loading={statusMutation.isPending}
                    checkedChildren="Active"
                    unCheckedChildren="Inactive"
                    onChange={(checked) => statusMutation.mutate(checked)}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                    Turn this on once your branch's products are stocked and ready to sell.
                </Text>
            </Space>
        </Card>

        <Card
            title={
                <Space>
                    <AppstoreOutlined />
                    Category Visibility
                </Space>
            }
        >
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                A category is created platform-wide but starts hidden in every branch.
                Turn on the ones you carry — customers here only browse what you activate.
            </Text>
            <Table
                rowKey="category_id"
                size="small"
                columns={categoryColumns}
                dataSource={categoriesQuery.data ?? []}
                loading={categoriesQuery.isLoading}
                pagination={false}
                locale={{
                    emptyText: categoriesQuery.isError
                        ? 'Failed to load categories.'
                        : 'No categories yet.',
                }}
            />
        </Card>
        </Space>
    );
};

export default MyBranch;
