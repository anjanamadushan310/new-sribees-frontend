/**
 * One branch's prices for the weight options of a sold-by-weight product,
 * shown in the Branch Inventory quick-edit drawer. An empty field means the
 * branch sells that weight at the global price. Renders nothing for a
 * product that is not sold by weight.
 */
import React, { useState } from 'react';
import { Button, Divider, InputNumber, Typography, message } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { weightOptionsApi } from '../../api/weightOptions.api';
import { apiDetailMessage } from '../../api/referralCommission.api';

interface Props {
    productId: string;
    branchId: string;
}

const money = (n: number) => `LKR ${n.toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;

const BranchWeightPrices: React.FC<Props> = ({ productId, branchId }) => {
    const queryClient = useQueryClient();
    const key = ['admin', 'weight-options', productId, branchId];
    const { data } = useQuery({
        queryKey: key,
        queryFn: () => weightOptionsApi.get(productId, branchId),
    });
    // Only the fields the manager has touched; the rest show the saved price.
    const [edits, setEdits] = useState<Record<string, number | null>>({});
    const valueOf = (variantId: string, saved: number | null) =>
        variantId in edits ? edits[variantId] : saved;

    const save = useMutation({
        mutationFn: async () => {
            const changed = (data?.options ?? []).filter(
                (o) => valueOf(o.variant_id, o.branch_price) !== o.branch_price
            );
            for (const o of changed) {
                await weightOptionsApi.setBranchPrice(
                    productId, o.variant_id, valueOf(o.variant_id, o.branch_price), branchId
                );
            }
            return changed.length;
        },
        onSuccess: (count) => {
            message.success(count ? 'Weight prices saved.' : 'Nothing to save.');
            setEdits({});
            queryClient.invalidateQueries({ queryKey: key });
        },
        onError: (err: unknown) =>
            message.error(apiDetailMessage(err) ?? 'Failed to save weight prices.'),
    });

    if (!data?.sold_by_weight || data.options.length === 0) return null;

    return (
        <div data-testid="branch-weight-prices">
            <Divider style={{ margin: '8px 0 16px' }} />
            <Typography.Text strong>Weight prices in this branch</Typography.Text>
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '2px 0 12px' }}>
                Leave a weight empty to sell it at the global price.
            </Typography.Paragraph>
            {data.options.map((o) => (
                <div
                    key={o.variant_id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}
                >
                    <div style={{ width: 60, fontWeight: 700, color: '#334155' }}>{o.label}</div>
                    <InputNumber
                        aria-label={`Branch price for ${o.label}`}
                        min={0}
                        step={0.01}
                        precision={2}
                        prefix="LKR"
                        placeholder={`${o.global_price}`}
                        value={valueOf(o.variant_id, o.branch_price)}
                        onChange={(v) => setEdits((d) => ({ ...d, [o.variant_id]: v ?? null }))}
                        style={{ flex: 1 }}
                    />
                    <Typography.Text type="secondary" style={{ fontSize: 12, width: 92, textAlign: 'right' }}>
                        {money(o.global_price)}
                    </Typography.Text>
                </div>
            ))}
            <Button block loading={save.isPending} onClick={() => save.mutate()}>
                Save weight prices
            </Button>
        </div>
    );
};

export default BranchWeightPrices;
