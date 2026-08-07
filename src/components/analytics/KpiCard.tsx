/**
 * KPI card + period-over-period delta, shared by the Dashboard and Analytics.
 *
 * The delta is the point of the component. A number with no baseline is a
 * trivia question — "Rs 4.4M" only becomes a decision once you know it is 12%
 * up on the previous 30 days.
 */
import React from 'react';
import { Card, Skeleton, Statistic, Tooltip, Typography } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, MinusOutlined } from '@ant-design/icons';
import { CHROME } from '../../utils/chartTheme';
import type { Delta } from '../../api/analytics.api';

const { Text } = Typography;

interface DeltaTagProps {
    /** null = no baseline (the previous period was zero), not "0% change". */
    value: Delta;
    /** Set for metrics where a rise is bad — cancellations, low stock. */
    inverted?: boolean;
    /** Rendered after the arrow, e.g. "vs previous 30 days". */
    caption?: string;
}

export const DeltaTag: React.FC<DeltaTagProps> = ({ value, inverted = false, caption }) => {
    if (value === null || value === undefined) {
        return (
            <Text type="secondary" style={{ fontSize: 12 }}>
                <MinusOutlined /> No prior period to compare
            </Text>
        );
    }

    const flat = Math.abs(value) < 0.05;
    const improving = inverted ? value < 0 : value > 0;
    const colour = flat ? CHROME.muted : improving ? CHROME.up : CHROME.down;
    // Arrow follows the DIRECTION of the number, colour follows whether that
    // direction is good — so a rising cancellation rate reads "up, and bad".
    const Icon = flat ? MinusOutlined : value > 0 ? ArrowUpOutlined : ArrowDownOutlined;

    return (
        <Text style={{ fontSize: 12, color: colour }}>
            <Icon /> {Math.abs(value).toFixed(1)}%{' '}
            {caption && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                    {caption}
                </Text>
            )}
        </Text>
    );
};

interface KpiCardProps {
    title: string;
    value: string;
    icon?: React.ReactNode;
    accent?: string;
    loading?: boolean;
    delta?: Delta;
    deltaInverted?: boolean;
    deltaCaption?: string;
    /** Extra context under the delta, e.g. "18 new customers". */
    footnote?: string;
    /** Explains what the metric counts — shown on hover over the title. */
    hint?: string;
}

export const KpiCard: React.FC<KpiCardProps> = ({
    title,
    value,
    icon,
    accent,
    loading = false,
    delta,
    deltaInverted,
    deltaCaption,
    footnote,
    hint,
}) => (
    <Card size="small" style={{ height: '100%' }}>
        {loading ? (
            <Skeleton active paragraph={{ rows: 1, width: '60%' }} title={{ width: '80%' }} />
        ) : (
            <>
                <Statistic
                    title={hint ? <Tooltip title={hint}>{title}</Tooltip> : title}
                    value={value}
                    prefix={icon ? <span style={{ color: accent }}>{icon}</span> : undefined}
                    valueStyle={{ fontSize: 22 }}
                />
                {delta !== undefined && (
                    <div style={{ marginTop: 6 }}>
                        <DeltaTag value={delta} inverted={deltaInverted} caption={deltaCaption} />
                    </div>
                )}
                {footnote && (
                    <div style={{ marginTop: 2 }}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {footnote}
                        </Text>
                    </div>
                )}
            </>
        )}
    </Card>
);

export default KpiCard;
