import { InfoCircleOutlined } from '@ant-design/icons';
import { Popover, Typography } from 'antd';
import React from 'react';
import type { PriceFloor } from '../../api/inventory.api';

const money = (v: number | string | null | undefined) =>
    v === null || v === undefined || v === ''
        ? '—'
        : `LKR ${Number(v).toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * A quiet icon by a price that is below Sribees Finance's minimum (owner: restrictions
 * are a tap-to-reveal icon, never a warning line). Saving is still allowed, for a
 * promotion; the icon only explains.
 */
export const PriceFloorIcon: React.FC<{ floor?: PriceFloor; price: number | null | undefined }> = ({
    floor,
    price,
}) => {
    if (!floor || floor.min_price === null || price === null || price === undefined) return null;
    if (Number(price) >= Number(floor.min_price)) return null;
    const pct = Number(floor.margin_pct ?? 0) + Number(floor.cashback_pct ?? 0) + Number(floor.referral_pct ?? 0);
    return (
        <Popover
            trigger="click"
            content={
                <div style={{ maxWidth: 300 }}>
                    <div>
                        {money(price)} is below the minimum of <strong>{money(floor.min_price)}</strong> that
                        keeps the margin.
                    </div>
                    <div style={{ marginTop: 6 }}>
                        Cost {money(floor.ready_cost)}
                        {Number(floor.materials_cost ?? 0) > 0 && <> (bags and labels {money(floor.materials_cost)})</>}
                        <br />
                        Margin {floor.margin_pct}% · cashback {floor.cashback_pct}% · referral {floor.referral_pct}%
                        {' '}= {pct.toFixed(2)}%
                    </div>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        From Sribees Finance{floor.cost_ref ? `: ${floor.cost_ref}` : ''}. It can still be saved,
                        for example for a promotion.
                    </Typography.Text>
                </div>
            }
        >
            <InfoCircleOutlined
                aria-label="Below the minimum price"
                style={{ color: '#d48806', cursor: 'pointer' }}
                onClick={(e) => e.stopPropagation()}
            />
        </Popover>
    );
};

export default PriceFloorIcon;
