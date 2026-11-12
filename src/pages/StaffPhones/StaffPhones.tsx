/**
 * Staff phones (Super Admin: every branch; Branch Manager: own branch)
 *
 * Which staff phones ring for a new order (Sribees New Orders app). A phone
 * can be registered and still stay quiet: notifications blocked, the "New
 * orders" category off or silent, or battery saving stopping the app. Each
 * phone reports this every time the app opens (app 0.8.0+). The reason sits
 * behind a quiet ⓘ, not a warning line (owner tone).
 */
import React, { useMemo, useState } from 'react';
import { Card, Empty, Select, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { CheckCircleFilled, CloseCircleFilled, InfoCircleOutlined, QuestionCircleOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useQuery } from '@tanstack/react-query';
import { staffPhonesApi } from '../../api/staffPhones.api';
import type { StaffPhone, StaffWithoutPhone } from '../../api/staffPhones.api';
import { slt } from '../../utils/datetime';
import { PROBLEM_TEXT } from './problemText';

const { Title, Text } = Typography;

const ROLE_LABEL: Record<string, string> = {
    super_admin: 'Super Admin',
    branch_manager: 'Branch Manager',
    inventory_manager: 'Inventory',
    customer_support: 'Support',
    marketing_manager: 'Marketing',
};

const when = (iso: string | null) => (iso ? slt(iso).format('D MMM, h:mm A') : '—');

const RingState: React.FC<{ phone: StaffPhone }> = ({ phone }) => {
    if (phone.can_ring === true) {
        return (
            <Space size={4}>
                <CheckCircleFilled style={{ color: '#52c41a' }} />
                <Text>Rings</Text>
            </Space>
        );
    }
    const text = phone.problem ? PROBLEM_TEXT[phone.problem] : '';
    return (
        <Space size={4}>
            {phone.can_ring === null ? (
                <QuestionCircleOutlined style={{ color: '#8c8c8c' }} />
            ) : (
                <CloseCircleFilled style={{ color: '#ff4d4f' }} />
            )}
            <Text type={phone.can_ring === null ? 'secondary' : 'danger'}>
                {phone.can_ring === null ? 'Unknown' : 'Will not ring'}
            </Text>
            {text && (
                <Tooltip title={text}>
                    <InfoCircleOutlined data-testid={`why-${phone.device_id}`} style={{ color: '#8c8c8c' }} />
                </Tooltip>
            )}
        </Space>
    );
};

const StaffPhones: React.FC = () => {
    const { data, isLoading } = useQuery({ queryKey: ['staff-phones'], queryFn: staffPhonesApi.list });
    const [branch, setBranch] = useState<string | 'all'>('all');

    const branches = useMemo(() => {
        const seen = new Map<string, string>();
        [...(data?.phones ?? []), ...(data?.staff_without_phone ?? [])].forEach((r) => {
            if (r.branch_id) seen.set(r.branch_id, r.branch_name || 'Branch');
        });
        return [...seen.entries()].map(([value, label]) => ({ value, label }));
    }, [data]);

    const inBranch = <T extends { branch_id: string | null }>(rows: T[]) =>
        branch === 'all' ? rows : rows.filter((r) => r.branch_id === branch);
    const phones = inBranch(data?.phones ?? []);
    const without = inBranch(data?.staff_without_phone ?? []);
    const ringing = phones.filter((p) => p.can_ring === true).length;

    const columns: ColumnsType<StaffPhone> = [
        {
            title: 'Staff',
            key: 'staff',
            render: (_, p) => (
                <div>
                    <Text strong style={{ display: 'block' }}>{p.full_name}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {ROLE_LABEL[p.role] ?? p.role}
                        {p.branch_name ? ` · ${p.branch_name}` : ''}
                    </Text>
                </div>
            ),
        },
        { title: 'Phone', key: 'model', render: (_, p) => p.device_model || <Text type="secondary">—</Text> },
        {
            title: 'App',
            key: 'version',
            render: (_, p) => (p.app_version ? <Tag>{p.app_version}</Tag> : <Text type="secondary">—</Text>),
        },
        { title: 'Rings?', key: 'ring', render: (_, p) => <RingState phone={p} /> },
        { title: 'Last opened', key: 'seen', render: (_, p) => when(p.last_seen_at) },
    ];

    return (
        <div>
            <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }} wrap>
                <div>
                    <Title level={3} style={{ margin: 0 }}>Staff Phones</Title>
                    <Text type="secondary">
                        Phones that ring for new orders (Sribees New Orders app).
                        {data ? ` ${ringing} of ${phones.length} ring.` : ''}
                    </Text>
                </div>
                {branches.length > 1 && (
                    <Select
                        aria-label="Branch"
                        style={{ minWidth: 200 }}
                        value={branch}
                        onChange={setBranch}
                        options={[{ value: 'all', label: 'All branches' }, ...branches]}
                    />
                )}
            </Space>

            <Card>
                <Table<StaffPhone>
                    rowKey="device_id"
                    loading={isLoading}
                    columns={columns}
                    dataSource={phones}
                    pagination={false}
                    scroll={{ x: 720 }}
                    locale={{ emptyText: <Empty description="No staff phone has signed in to the app yet" /> }}
                />
            </Card>

            {without.length > 0 && (
                <Card style={{ marginTop: 16 }} title="Staff with no phone">
                    <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                        They can see orders but have not signed in to the New Orders app on any phone, so
                        nothing rings for them.
                    </Text>
                    <Space wrap>
                        {without.map((s: StaffWithoutPhone) => (
                            <Tag key={s.admin_id}>
                                {s.full_name}
                                {s.branch_name ? ` · ${s.branch_name}` : ''}
                            </Tag>
                        ))}
                    </Space>
                </Card>
            )}
        </div>
    );
};

export default StaffPhones;
