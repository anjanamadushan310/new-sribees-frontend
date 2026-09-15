/**
 * Delivery Zones — master Postal City directory management (Super Admin only).
 *
 * Add / edit / delete Postal Cities, each mapped to a District and Province.
 * This is the source-of-truth the Branch form reads from when picking coverage
 * areas. Backed by /api/v1/admin/locations.
 */
import React, { useMemo, useState } from 'react';
import {
    Table,
    Button,
    Space,
    Tag,
    Input,
    Select,
    Modal,
    Form,
    Switch,
    Popconfirm,
    App,
    Typography,
} from 'antd';
import {
    PlusOutlined,
    EditOutlined,
    DeleteOutlined,
    SearchOutlined,
    EnvironmentOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { locationsApi } from '../../api/locations.api';
import type { PostalCity, PostalCityPayload } from '../../api/locations.api';
import { SL_PROVINCES, districtsForProvince } from '../../data/slLocations';

const { Text } = Typography;

const LOCATIONS_KEY = ['admin', 'locations', 'all'];

interface ZoneFormValues {
    postal_city: string;
    province: string;
    district: string;
    is_active?: boolean;
}

const uniq = (arr: (string | null | undefined)[]): string[] =>
    Array.from(new Set(arr.filter((s): s is string => !!s)));

const DeliveryZones: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [form] = Form.useForm<ZoneFormValues>();

    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState<PostalCity | null>(null);
    const [search, setSearch] = useState('');

    const provinceValue = Form.useWatch('province', form);

    const { data: zones = [], isLoading, isError } = useQuery({
        queryKey: LOCATIONS_KEY,
        queryFn: () => locationsApi.list(),
    });

    const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'locations'] });

    const createMutation = useMutation({
        mutationFn: (payload: PostalCityPayload) => locationsApi.create(payload),
        onSuccess: () => {
            message.success('Post office added.');
            closeModal();
            invalidate();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to add postal city.'),
    });

    const updateMutation = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: Partial<PostalCityPayload> }) =>
            locationsApi.update(id, payload),
        onSuccess: () => {
            message.success('Post office updated.');
            closeModal();
            invalidate();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to update postal city.'),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => locationsApi.remove(id),
        onSuccess: () => {
            message.success('Post office removed.');
            invalidate();
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to remove postal city.'),
    });

    const openCreate = () => {
        setEditing(null);
        form.resetFields();
        form.setFieldsValue({ is_active: true });
        setModalOpen(true);
    };

    const openEdit = (zone: PostalCity) => {
        setEditing(zone);
        form.setFieldsValue({
            postal_city: zone.postal_city,
            province: zone.province,
            district: zone.district,
            is_active: zone.is_active,
        });
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setEditing(null);
        form.resetFields();
    };

    const onProvinceChange = () => {
        form.setFieldsValue({ district: undefined as unknown as string });
    };

    const handleSubmit = async () => {
        const values = await form.validateFields();
        const payload: PostalCityPayload = {
            postal_city: values.postal_city.trim(),
            province: values.province.trim(),
            district: values.district.trim(),
            is_active: values.is_active ?? true,
        };
        if (editing) {
            updateMutation.mutate({ id: editing.id, payload });
        } else {
            createMutation.mutate(payload);
        }
    };

    const filtered = useMemo(
        () =>
            zones.filter(
                (z) =>
                    z.postal_city.toLowerCase().includes(search.toLowerCase()) ||
                    z.district.toLowerCase().includes(search.toLowerCase()) ||
                    z.province.toLowerCase().includes(search.toLowerCase())
            ),
        [zones, search]
    );

    const provinceOptions = uniq([...SL_PROVINCES, editing?.province]).map((p) => ({
        label: p,
        value: p,
    }));
    const districtOptions = uniq([
        ...districtsForProvince(provinceValue),
        editing?.district,
    ]).map((d) => ({ label: d, value: d }));

    const columns: ColumnsType<PostalCity> = [
        {
            title: 'Postal City',
            dataIndex: 'postal_city',
            key: 'postal_city',
            render: (v: string) => <Text strong>{v}</Text>,
            sorter: (a, b) => a.postal_city.localeCompare(b.postal_city),
        },
        {
            title: 'District',
            dataIndex: 'district',
            key: 'district',
            sorter: (a, b) => a.district.localeCompare(b.district),
        },
        {
            title: 'Province',
            dataIndex: 'province',
            key: 'province',
            render: (v: string) => <Tag color="geekblue">{v}</Tag>,
            filters: SL_PROVINCES.map((p) => ({ text: p, value: p })),
            onFilter: (val, record) => record.province === val,
        },
        {
            title: 'Status',
            dataIndex: 'is_active',
            key: 'is_active',
            width: 110,
            render: (active: boolean) => (
                <Tag color={active ? 'green' : 'default'}>{active ? 'Active' : 'Inactive'}</Tag>
            ),
        },
        {
            title: 'Actions',
            key: 'actions',
            width: 170,
            render: (_, record) => (
                <Space>
                    <Button type="link" icon={<EditOutlined />} onClick={() => openEdit(record)}>
                        Edit
                    </Button>
                    <Popconfirm
                        title="Remove postal city"
                        description="Branches covering it will lose this area from their mapping."
                        okText="Remove"
                        okButtonProps={{ danger: true }}
                        onConfirm={() => deleteMutation.mutate(record.id)}
                    >
                        <Button type="link" danger icon={<DeleteOutlined />}>
                            Delete
                        </Button>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    return (
        <div>
            <div
                style={{
                    marginBottom: 16,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                }}
            >
                <Space direction="vertical" size={0}>
                    <Text strong style={{ fontSize: 16 }}>
                        <Space>
                            <EnvironmentOutlined />
                            Delivery Zones
                        </Space>
                    </Text>
                    <Text type="secondary" style={{ fontSize: 13 }}>
                        Master list of Postal Cities. The Branch form picks coverage areas from here.
                    </Text>
                </Space>
                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                    Add Postal City
                </Button>
            </div>

            <Input
                placeholder="Search by postal city, district or province"
                allowClear
                prefix={<SearchOutlined />}
                style={{ width: 340, marginBottom: 16 }}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
            />

            <Table
                rowKey="id"
                columns={columns}
                dataSource={filtered}
                loading={isLoading}
                locale={{ emptyText: isError ? 'Failed to load postal cities.' : 'No postal cities yet.' }}
                pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (t) => `Total ${t} postal cities` }}
            />

            <Modal
                title={editing ? 'Edit Postal City' : 'New Postal City'}
                open={modalOpen}
                onOk={handleSubmit}
                onCancel={closeModal}
                okText={editing ? 'Save' : 'Add'}
                confirmLoading={createMutation.isPending || updateMutation.isPending}
                destroyOnHidden
            >
                <Form form={form} layout="vertical" initialValues={{ is_active: true }}>
                    <Form.Item
                        label="Postal City"
                        name="postal_city"
                        rules={[{ required: true, message: 'Post office name is required' }]}
                    >
                        <Input placeholder="e.g. Welipenna" />
                    </Form.Item>

                    <Form.Item
                        label="Province"
                        name="province"
                        rules={[{ required: true, message: 'Province is required' }]}
                    >
                        <Select
                            placeholder="Select province"
                            options={provinceOptions}
                            onChange={onProvinceChange}
                            showSearch
                            optionFilterProp="label"
                        />
                    </Form.Item>

                    <Form.Item
                        label="District"
                        name="district"
                        rules={[{ required: true, message: 'District is required' }]}
                    >
                        <Select
                            placeholder={provinceValue ? 'Select district' : 'Select a province first'}
                            options={districtOptions}
                            disabled={!provinceValue}
                            showSearch
                            optionFilterProp="label"
                        />
                    </Form.Item>

                    <Form.Item label="Active" name="is_active" valuePropName="checked">
                        <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default DeliveryZones;
