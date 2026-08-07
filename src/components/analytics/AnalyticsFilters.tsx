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

    return (
        <Space wrap size={16}>
            {showBranchFilter && (
                <Space size={8}>
                    <Text type="secondary">Branch:</Text>
                    <Select
                        placeholder="All branches"
                        style={{ width: 220 }}
                        allowClear
                        loading={isLoading}
                        value={branchId}
                        onChange={(v) => onBranchChange?.(v)}
                        options={branches.map((b) => ({
                            label: `${b.name} (${b.code})`,
                            value: b.branch_id,
                        }))}
                    />
                </Space>
            )}
            <Segmented
                options={PERIOD_OPTIONS}
                value={days}
                onChange={(v) => onDaysChange(Number(v))}
            />
        </Space>
    );
};

export default AnalyticsFilters;
