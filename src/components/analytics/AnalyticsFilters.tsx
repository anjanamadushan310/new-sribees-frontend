/**
 * The filter row shared by the Dashboard and the Analytics report: a period
 * selector, and — for Super Admins only — a branch selector.
 *
 * The branch control is hidden rather than disabled for scoped roles because
 * the server ignores `branch_id` for them anyway; showing a control that
 * silently does nothing is worse than not showing it.
 */
import React from 'react';
import { Segmented, Select, Space, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { branchesApi } from '../../api/branches.api';
import { PERIOD_OPTIONS } from '../../utils/analytics';

const { Text } = Typography;

interface Props {
    days: number;
    onDaysChange: (days: number) => void;
    /** Super Admin only. Leave false and the branch picker is not rendered. */
    showBranchFilter?: boolean;
    branchId?: string;
    onBranchChange?: (branchId?: string) => void;
}

export const AnalyticsFilters: React.FC<Props> = ({
    days,
    onDaysChange,
    showBranchFilter = false,
    branchId,
    onBranchChange,
}) => {
    const { data: branches = [], isLoading } = useQuery({
        queryKey: ['admin', 'branches'],
        queryFn: branchesApi.list,
        enabled: showBranchFilter,
    });

    const branchCount = branches.length;

    return (
        <Space wrap size={12} data-testid="analytics-filters" align="center">
            {showBranchFilter && (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        background: '#ffffff',
                        border: '1px solid #e5e7eb',
                        borderRadius: 24,
                        padding: '2px 10px 2px 14px',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                    }}
                >
                    <Text type="secondary" style={{ fontSize: 13, marginRight: 6, fontWeight: 500 }}>
                        Branch:
                    </Text>
                    <Select
                        placeholder={branchCount > 0 ? `All branches (${branchCount} Configured)` : 'All branches'}
                        data-testid="branch-filter"
                        variant="borderless"
                        style={{ minWidth: 230 }}
                        allowClear
                        loading={isLoading}
                        value={branchId}
                        onChange={(v) => onBranchChange?.(v)}
                        options={branches.map((b) => ({
                            label: `${b.name} (${b.code})`,
                            value: b.branch_id,
                        }))}
                    />
                </div>
            )}
            <div
                style={{
                    background: '#F0EEF2',
                    borderRadius: 24,
                    padding: 3,
                }}
            >
                <Segmented
                    data-testid="period-filter"
                    options={PERIOD_OPTIONS}
                    value={days}
                    onChange={(v) => onDaysChange(Number(v))}
                    style={{
                        borderRadius: 20,
                        backgroundColor: '#F0EEF2',
                        fontWeight: 600,
                        fontSize: 13,
                    }}
                />
            </div>
        </Space>
    );
};

export default AnalyticsFilters;
