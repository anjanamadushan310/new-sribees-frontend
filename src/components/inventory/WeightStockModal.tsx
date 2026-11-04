/**
 * Count a weight product in a branch: grams for a loose product, the bags of
 * each weight for a pre-packed one. Shows how many of each weight can still
 * be sold, which is what the app shows customers.
 */
import React, { useEffect, useState } from 'react';
import { Alert, App, InputNumber, Modal, Space, Spin, Table, Tag, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { inventoryApi } from '../../api/inventory.api';
import type { InventoryItem, WeightStockOption } from '../../api/inventory.api';

const { Text } = Typography;

interface Props {
    item: InventoryItem;
    onClose: () => void;
}

const WeightStockModal: React.FC<Props> = ({ item, onClose }) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const stock = useQuery({
        queryKey: ['inventory-weights', item.inventory_id],
        queryFn: () => inventoryApi.weights(item.inventory_id),
    });
    const [kg, setKg] = useState<number | null>(null);
    const [packs, setPacks] = useState<Record<string, number>>({});

    useEffect(() => {
        if (!stock.data) return;
        setKg(stock.data.stock_grams / 1000);
        setPacks(Object.fromEntries(stock.data.options.map((o) => [o.variant_id, o.packs ?? 0])));
    }, [stock.data]);

    const save = useMutation({
        mutationFn: () =>
            stock.data?.stock_mode === 'loose'
                ? inventoryApi.setWeights(item.inventory_id, { stock_grams: Math.round((kg ?? 0) * 1000) })
                : inventoryApi.setWeights(item.inventory_id, {
                      packs: Object.entries(packs).map(([variant_id, stock_quantity]) => ({
                          variant_id,
                          stock_quantity,
                      })),
                  }),
        onSuccess: () => {
            message.success('Stock saved');
            queryClient.invalidateQueries({ queryKey: ['inventory-weights', item.inventory_id] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] });
            onClose();
        },
        onError: (e: unknown) => {
            const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            message.error(detail || 'Could not save the stock');
        },
    });

    const data = stock.data;
    const loose = data?.stock_mode === 'loose';
    const locked = data?.kept_by_finance ?? false;

    return (
        <Modal
            open
            title={`${item.product_name} — stock by weight`}
            okText="Save"
            onCancel={onClose}
            onOk={() => save.mutate()}
            okButtonProps={{ loading: save.isPending, disabled: !data || locked }}
            width={560}
        >
            {stock.isLoading || !data ? (
                <Spin />
            ) : (
                <Space direction="vertical" style={{ width: '100%' }} size="middle">
                    {locked && (
                        <Alert type="info" showIcon message="Sribees Finance keeps this stock; count it there." />
                    )}
                    {loose ? (
                        <Space align="center">
                            <Text strong>On hand</Text>
                            <InputNumber
                                min={0}
                                step={0.25}
                                precision={3}
                                value={kg}
                                onChange={(v) => setKg(v)}
                                addonAfter="kg"
                                disabled={locked}
                            />
                            <Text type="secondary">weighed into the bag per order</Text>
                        </Space>
                    ) : (
                        <Text type="secondary">Count the bags of each weight on the shelf.</Text>
                    )}
                    <Table<WeightStockOption>
                        rowKey="variant_id"
                        size="small"
                        pagination={false}
                        dataSource={data.options}
                        columns={[
                            { title: 'Weight', dataIndex: 'label', width: 100 },
                            ...(!loose
                                ? [
                                      {
                                          title: 'Bags on the shelf',
                                          key: 'packs',
                                          render: (_: unknown, o: WeightStockOption) => (
                                              <InputNumber
                                                  min={0}
                                                  precision={0}
                                                  value={packs[o.variant_id] ?? 0}
                                                  disabled={locked}
                                                  onChange={(v) =>
                                                      setPacks((p) => ({ ...p, [o.variant_id]: Number(v ?? 0) }))
                                                  }
                                              />
                                          ),
                                      },
                                  ]
                                : []),
                            {
                                title: 'Customers can buy',
                                dataIndex: 'available',
                                render: (v: number | null) =>
                                    v === null ? '—' : v > 0 ? <Tag color="green">{v}</Tag> : <Tag color="red">Sold out</Tag>,
                            },
                        ]}
                    />
                </Space>
            )}
        </Modal>
    );
};

export default WeightStockModal;
