/**
 * One branch's prices for the weight options of a sold-by-weight product.
 *
 * The branch price is the branch's price per kg, so every weight follows it
 * as it is typed: a weight's price is the price per kg, pro rata, times that
 * weight's markup (the global one, or the one the manager set by hand). The
 * 1 kg row IS the branch price, so editing it edits the branch price. The
 * server applies the same rule, so a weight left alone needs no saving.
 *
 * Used twice: on "Add Product to Branch" (saved with the stocking) and in the
 * Branch Inventory quick-edit drawer (saved with the drawer). Renders nothing
 * for a product that is not sold by weight.
 */
import React from 'react';
import { Divider, InputNumber, Typography } from 'antd';
import { KILO, type BranchWeightRow } from './branchWeightRows';

const money = (n: number) => `LKR ${n.toLocaleString('en-LK', { minimumFractionDigits: 2 })}`;

interface RowsProps {
    rows: BranchWeightRow[];
    onPrice: (variantId: string, price: number | null) => void;
    /** The 1 kg row is the branch price itself. */
    onKilo: (price: number | null) => void;
    disabled?: boolean;
}

export const BranchWeightRows: React.FC<RowsProps> = ({ rows, onPrice, onKilo, disabled }) => {
    if (rows.length === 0) return null;
    return (
        <div data-testid="branch-weight-prices">
            <Divider style={{ margin: '8px 0 16px' }} />
            <Typography.Text strong>Weight prices in this branch</Typography.Text>
            <Typography.Paragraph type="secondary" style={{ fontSize: 12, margin: '2px 0 12px' }}>
                Each weight follows the branch price as you type it. Change any weight by hand
                if it needs its own price.
            </Typography.Paragraph>
            {rows.map((o) => (
                <div
                    key={o.variant_id}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}
                >
                    <div style={{ width: 60, fontWeight: 700, color: '#334155' }}>{o.label}</div>
                    <InputNumber
                        aria-label={`Branch price for ${o.label}`}
                        disabled={disabled}
                        min={0}
                        step={0.01}
                        precision={2}
                        prefix="LKR"
                        value={o.shown}
                        onChange={(v) => (o.weight_grams === KILO ? onKilo(v) : onPrice(o.variant_id, v))}
                        style={{ flex: 1 }}
                    />
                    <Typography.Text type="secondary" style={{ fontSize: 12, width: 92, textAlign: 'right' }}>
                        {money(o.global_price)}
                    </Typography.Text>
                </div>
            ))}
        </div>
    );
};
