/**
 * The weight options of a sold-by-weight product, as the Super Admin edits
 * them on the product form: one row per weight (250 g, 1 kg ...) with its
 * global price. Controlled — the form owns the rows and saves them through
 * weightOptionsApi.replace after the product itself is saved.
 */
import React, { useState } from 'react';
import { Button, InputNumber, Select, Space, Tooltip, Typography } from 'antd';
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import {
    COMMON_WEIGHTS,
    proRata,
    weightLabel,
    type WeightOptionInput,
} from '../../api/weightOptions.api';

interface Props {
    value: WeightOptionInput[];
    onChange: (rows: WeightOptionInput[]) => void;
    /** The product's base price, read as its price per kg. */
    pricePerKg: number;
    disabled?: boolean;
}

const WeightOptionsEditor: React.FC<Props> = ({ value, onChange, pricePerKg, disabled }) => {
    const [adding, setAdding] = useState<number | null>(null);
    const rows = [...value].sort((a, b) => a.weight_grams - b.weight_grams);
    const unused = COMMON_WEIGHTS.filter((g) => !rows.some((r) => r.weight_grams === g));

    const setPrice = (grams: number, price: number | null) =>
        onChange(rows.map((r) => (r.weight_grams === grams ? { ...r, price: price ?? 0 } : r)));

    const remove = (grams: number) => onChange(rows.filter((r) => r.weight_grams !== grams));

    const add = (grams: number) => {
        if (!grams || rows.some((r) => r.weight_grams === grams)) return;
        onChange([...rows, { weight_grams: grams, price: proRata(pricePerKg, grams) }]);
        setAdding(null);
    };

    return (
        <div data-testid="weight-options-editor">
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 10,
                }}
            >
                <Typography.Text strong>Weight options</Typography.Text>
                <Tooltip title="Set every price from the base price, read as the price per 1 kg">
                    <Button
                        size="small"
                        icon={<ReloadOutlined />}
                        disabled={disabled || !pricePerKg}
                        onClick={() =>
                            onChange(rows.map((r) => ({ ...r, price: proRata(pricePerKg, r.weight_grams) })))
                        }
                    >
                        Price from 1 kg
                    </Button>
                </Tooltip>
            </div>

            {rows.map((r) => (
                <div
                    key={r.weight_grams}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}
                >
                    <div
                        style={{
                            width: 72,
                            fontWeight: 700,
                            color: '#334155',
                            background: '#f1f5f9',
                            borderRadius: 8,
                            padding: '6px 0',
                            textAlign: 'center',
                        }}
                    >
                        {weightLabel(r.weight_grams)}
                    </div>
                    <InputNumber
                        aria-label={`Price for ${weightLabel(r.weight_grams)}`}
                        disabled={disabled}
                        min={0}
                        step={0.01}
                        precision={2}
                        prefix="LKR"
                        value={r.price}
                        onChange={(v) => setPrice(r.weight_grams, v)}
                        style={{ flex: 1 }}
                    />
                    <Button
                        aria-label={`Remove ${weightLabel(r.weight_grams)}`}
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        disabled={disabled || rows.length <= 1}
                        onClick={() => remove(r.weight_grams)}
                    />
                </div>
            ))}

            <Space.Compact style={{ width: '100%', marginTop: 4 }}>
                <Select
                    disabled={disabled}
                    placeholder="Add a weight"
                    value={adding ?? undefined}
                    onChange={setAdding}
                    options={unused.map((g) => ({ value: g, label: weightLabel(g) }))}
                    style={{ flex: 1 }}
                />
                <Button
                    icon={<PlusOutlined />}
                    disabled={disabled || adding === null}
                    onClick={() => adding !== null && add(adding)}
                >
                    Add
                </Button>
            </Space.Compact>
        </div>
    );
};

export default WeightOptionsEditor;
