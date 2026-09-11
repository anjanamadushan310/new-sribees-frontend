/**
 * Delivery Runs — a branch's daily dispatch rounds.
 *
 * Owned by whoever actually runs the branch (Branch Manager, or a Super Admin
 * on their behalf) rather than by Marketing, which only reads the result: the
 * Marketing Dashboard's "Next Delivery Run" cut-off countdown has no other
 * source, and before this existed it displayed a hardcoded 2:00 PM that
 * matched no branch's real timetable.
 *
 * The whole list is saved at once (PUT replaces the set) because the runs only
 * make sense relative to each other — a half-applied timetable would send the
 * dashboard counting down to a cut-off that no longer exists.
 */
import React, { useEffect, useState } from 'react';
import {
    Alert,
    App,
    Button,
    Card,
    Empty,
    InputNumber,
    Popconfirm,
    Space,
    Table,
    TimePicker,
    Typography,
    Input,
} from 'antd';
import { CarOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { branchesApi } from '../../api/branches.api';
import type { DeliveryRun } from '../../api/branches.api';

const { Text } = Typography;

const TIME_FORMAT = 'HH:mm';

/** A row in the editor. `key` is local-only, so React can track unsaved rows. */
interface RunRow extends DeliveryRun {
    key: string;
}

const toRows = (runs: DeliveryRun[]): RunRow[] =>
    runs.map((r, i) => ({ ...r, key: `${r.dispatch_time}-${i}` }));

interface Props {
    branchId: string;
    runs: DeliveryRun[];
    /** Read-only for anyone who cannot change this branch's operations. */
    disabled?: boolean;
}

const DeliveryRunsCard: React.FC<Props> = ({ branchId, runs, disabled }) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [rows, setRows] = useState<RunRow[]>(() => toRows(runs));

    // Re-seed from the server whenever it hands us a different saved set, so a
    // successful save (or another manager's change) lands here rather than
    // leaving stale local edits on screen.
    useEffect(() => {
        setRows(toRows(runs));
    }, [runs]);

    const saveMutation = useMutation({
        mutationFn: () =>
            branchesApi.setDeliveryRuns(
                branchId,
                rows.map(({ key: _key, ...run }) => run),
            ),
        onSuccess: () => {
            message.success('Delivery runs updated.');
            queryClient.invalidateQueries({ queryKey: ['admin', 'branches'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'marketing', 'dashboard'] });
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to save delivery runs.'),
    });

    const update = (key: string, patch: Partial<DeliveryRun>) =>
        setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

    const addRun = () =>
        setRows((prev) => [
            ...prev,
            {
                key: `new-${Date.now()}`,
                label: '',
                dispatch_time: '12:00',
                cutoff_minutes: 30,
            },
        ]);

    // The server rejects duplicate dispatch times outright; catching it here
    // means the manager sees which two rows clash instead of a 422.
    const duplicateTimes = rows
        .map((r) => r.dispatch_time)
        .filter((t, i, all) => all.indexOf(t) !== i);
    const missingLabel = rows.some((r) => !r.label.trim());
    const isDirty = JSON.stringify(rows.map(({ key: _k, ...r }) => r)) !== JSON.stringify(runs);
    const canSave = !disabled && isDirty && !duplicateTimes.length && !missingLabel;

    const columns: ColumnsType<RunRow> = [
        {
            title: 'Run',
            dataIndex: 'label',
            key: 'label',
            render: (label: string, record) => (
                <Input
                    value={label}
                    disabled={disabled}
                    placeholder="Morning"
                    maxLength={40}
                    status={!label.trim() ? 'error' : undefined}
                    onChange={(e) => update(record.key, { label: e.target.value })}
                />
            ),
        },
        {
            title: 'Dispatch time',
            dataIndex: 'dispatch_time',
            key: 'dispatch_time',
            width: 150,
            render: (time: string, record) => (
                <TimePicker
                    value={dayjs(time, TIME_FORMAT)}
                    disabled={disabled}
                    format={TIME_FORMAT}
                    minuteStep={5}
                    allowClear={false}
                    status={duplicateTimes.includes(time) ? 'error' : undefined}
                    onChange={(value) =>
                        value && update(record.key, { dispatch_time: value.format(TIME_FORMAT) })
                    }
                />
            ),
        },
        {
            title: 'Ordering closes',
            dataIndex: 'cutoff_minutes',
            key: 'cutoff_minutes',
            width: 200,
            render: (mins: number, record) => (
                <Space size={6}>
                    <InputNumber
                        value={mins}
                        min={0}
                        max={24 * 60}
                        step={5}
                        disabled={disabled}
                        style={{ width: 90 }}
                        onChange={(value) =>
                            update(record.key, { cutoff_minutes: value ?? 0 })
                        }
                    />
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        min before
                    </Text>
                </Space>
            ),
        },
        {
            title: '',
            key: 'actions',
            width: 60,
            render: (_, record) => (
                <Popconfirm
                    title="Remove this run?"
                    onConfirm={() => setRows((prev) => prev.filter((r) => r.key !== record.key))}
                    disabled={disabled}
                >
                    <Button type="text" danger icon={<DeleteOutlined />} disabled={disabled} />
                </Popconfirm>
            ),
        },
    ];

    return (
        <Card
            title={
                <Space>
                    <CarOutlined />
                    Delivery Runs
                </Space>
            }
            extra={
                <Space>
                    <Button icon={<PlusOutlined />} onClick={addRun} disabled={disabled}>
                        Add run
                    </Button>
                    <Button
                        type="primary"
                        loading={saveMutation.isPending}
                        disabled={!canSave}
                        onClick={() => saveMutation.mutate()}
                    >
                        Save
                    </Button>
                </Space>
            }
        >
            <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
                Your branch's daily dispatch rounds. "Ordering closes" is how many minutes
                before the van leaves that customers can still add to that run — it's the
                countdown the Marketing Dashboard shows, because a run whose cut-off has
                passed is already locked and nothing can be added to it.
            </Text>

            {duplicateTimes.length > 0 && (
                <Alert
                    type="error"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="Two runs share the same dispatch time"
                    description={`Fix the duplicate at ${duplicateTimes.join(', ')} before saving.`}
                />
            )}

            {rows.length === 0 ? (
                <Empty
                    description={
                        <>
                            No delivery runs configured. Until you add at least one, the
                            Marketing Dashboard has no cut-off to count down to.
                        </>
                    }
                />
            ) : (
                <Table
                    rowKey="key"
                    size="small"
                    columns={columns}
                    dataSource={rows}
                    pagination={false}
                />
            )}
        </Card>
    );
};

export default DeliveryRunsCard;
