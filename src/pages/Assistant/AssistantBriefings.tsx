/**
 * AI Briefings — tell the shopping assistant what is happening at a branch.
 *
 * A Branch Manager uploads a note (.txt/.md) or types one, with a time window.
 * One AI call turns it into a short, fact-only digest — the only thing the
 * assistant reads — which the manager reviews and can edit before saving.
 * While the window is open, the assistant takes it into account when it
 * answers that branch's customers, in the customer's own language:
 *
 *   "When relevant"          — floods stop deliveries through Welipanna: the
 *                              assistant explains it when someone asks where
 *                              their order is, and stays quiet otherwise.
 *   "Tell each customer once" — an Avurudu festival: the assistant answers the
 *                              carrot question, then invites them, once.
 *
 * Server: /api/v1/admin/assistant-briefings (briefings:* permission,
 * branch-scoped). Network-wide briefings are Super Admin only and read-only
 * here for everyone else.
 */
import React, { useMemo, useState } from 'react';
import {
    Alert,
    App,
    Button,
    Card,
    Collapse,
    DatePicker,
    Empty,
    Form,
    Input,
    Modal,
    Popconfirm,
    Radio,
    Segmented,
    Select,
    Space,
    Steps,
    Table,
    Tag,
    Tooltip,
    Typography,
    Upload,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
    DeleteOutlined,
    EditOutlined,
    InboxOutlined,
    PauseCircleOutlined,
    PlayCircleOutlined,
    PlusOutlined,
    RobotOutlined,
    StopOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Dayjs } from 'dayjs';

import {
    briefingsApi,
    type Briefing,
    type BriefingDraft,
    type BriefingLimits,
    type BriefingMode,
    type BriefingPayload,
    type BriefingUpdate,
} from '../../api/briefings.api';
import { branchesApi } from '../../api/branches.api';
import { usePermissions } from '../../hooks/usePermissions';
import { slt } from '../../utils/datetime';
import {
    colomboISO,
    formatWindow,
    MODE_META,
    mentionsLabel,
    noteFileProblem,
    pickerValue,
    STATUS_META,
    windowPresets,
} from '../../utils/briefings';

const { Title, Text, Paragraph } = Typography;
const KEY = ['admin', 'assistant-briefings'];
const ALL_BRANCHES = '__all__';

const DEFAULT_LIMITS: BriefingLimits = {
    digest_max: 700,
    upload_max_bytes: 64 * 1024,
    max_live_branch: 5,
    max_live_network: 2,
    max_window_days: 90,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function errorText(err: any, fallback: string): string {
    const detail = err?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail) && detail.length) {
        return detail.map((d) => String(d?.msg ?? d).replace(/^Value error, /, '')).join(' ');
    }
    return fallback;
}

interface ReviewValues {
    title: string;
    digest: string;
    mode: BriefingMode;
    window: [Dayjs, Dayjs];
    branch?: string;
}

const disabledPast = (d: Dayjs) => d.isBefore(pickerValue(slt().toISOString()).startOf('day'));

const ModeChoice: React.FC = () => (
    <Radio.Group style={{ width: '100%' }}>
        <Space direction="vertical" style={{ width: '100%' }}>
            {(Object.keys(MODE_META) as BriefingMode[]).map((mode) => (
                <Radio key={mode} value={mode}>
                    <Text strong>{MODE_META[mode].label}</Text>
                    <br />
                    <Text type="secondary">{MODE_META[mode].help}</Text>
                </Radio>
            ))}
        </Space>
    </Radio.Group>
);

// ---------------------------------------------------------------------------
// New briefing: note -> AI digest -> review -> save
// ---------------------------------------------------------------------------

const Composer: React.FC<{
    open: boolean;
    onClose: () => void;
    isSuperAdmin: boolean;
    branches: { branch_id: string; name: string }[];
    defaultBranch?: string;
    limits: BriefingLimits;
}> = ({ open, onClose, isSuperAdmin, branches, defaultBranch, limits }) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [form] = Form.useForm<ReviewValues>();
    const [source, setSource] = useState<'file' | 'text'>('file');
    const [file, setFile] = useState<File | null>(null);
    const [text, setText] = useState('');
    const [draft, setDraft] = useState<BriefingDraft | null>(null);

    const reset = () => {
        setFile(null);
        setText('');
        setDraft(null);
        setSource('file');
        form.resetFields();
    };
    const close = () => {
        reset();
        onClose();
    };

    const prepare = useMutation({
        mutationFn: () => briefingsApi.prepare(source === 'file' && file ? { file } : { text }),
        onSuccess: (d) => {
            setDraft(d);
            form.setFieldsValue({
                title: d.title,
                digest: d.digest,
                mode: d.mode,
                window: windowPresets()[d.mode === 'announce' ? 3 : 1].value,
                branch: isSuperAdmin ? (defaultBranch ?? ALL_BRANCHES) : undefined,
            });
        },
        onError: (err) => message.error(errorText(err, 'Could not read the note. Please try again.')),
    });

    const save = useMutation({
        mutationFn: (payload: BriefingPayload) => briefingsApi.create(payload),
        onSuccess: (b) => {
            message.success(
                b.status === 'live'
                    ? 'Saved. The assistant is using it now.'
                    : `Saved. It goes live ${slt(b.starts_at).format('ddd D MMM, h:mm A')}.`,
            );
            queryClient.invalidateQueries({ queryKey: KEY });
            close();
        },
        onError: (err) => message.error(errorText(err, 'Could not save the briefing.')),
    });

    const submit = (v: ReviewValues) => {
        if (!draft) return;
        const unchanged = v.digest.trim() === draft.digest.trim();
        const payload: BriefingPayload = {
            title: v.title.trim(),
            source_text: draft.source_text,
            source_filename: draft.source_filename,
            digest: v.digest.trim(),
            // Record whether the words the assistant reads are the AI's or the manager's.
            digest_source: unchanged ? draft.digest_source : 'manager',
            mode: v.mode,
            starts_at: colomboISO(v.window[0]),
            ends_at: colomboISO(v.window[1]),
        };
        if (isSuperAdmin) payload.branch_id = v.branch === ALL_BRANCHES ? null : v.branch;
        save.mutate(payload);
    };

    const canPrepare = source === 'file' ? Boolean(file) : text.trim().length > 0;

    return (
        <Modal
            open={open}
            onCancel={close}
            title={
                <Space>
                    <RobotOutlined />
                    New AI briefing
                </Space>
            }
            width={760}
            destroyOnHidden
            footer={
                draft ? (
                    <Space>
                        <Button onClick={() => setDraft(null)}>Back</Button>
                        <Button type="primary" loading={save.isPending} onClick={() => form.submit()}>
                            Save briefing
                        </Button>
                    </Space>
                ) : (
                    <Button
                        type="primary"
                        icon={<RobotOutlined />}
                        disabled={!canPrepare}
                        loading={prepare.isPending}
                        onClick={() => prepare.mutate()}
                    >
                        Prepare with AI
                    </Button>
                )
            }
        >
            <Steps
                size="small"
                current={draft ? 1 : 0}
                style={{ marginBottom: 20 }}
                items={[{ title: 'Your note' }, { title: 'Review what the assistant will know' }]}
            />

            {!draft && (
                <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                        Write it the way you would tell your staff — in any language. The AI keeps
                        only the facts your customers need and ignores anything else.
                    </Paragraph>
                    <Segmented
                        value={source}
                        onChange={(v) => setSource(v as 'file' | 'text')}
                        options={[
                            { label: 'Upload a file', value: 'file' },
                            { label: 'Type it', value: 'text' },
                        ]}
                    />
                    {source === 'file' ? (
                        <Upload.Dragger
                            accept=".txt,.md,.markdown"
                            maxCount={1}
                            fileList={
                                file
                                    ? [{ uid: 'note', name: file.name, status: 'done' as const }]
                                    : []
                            }
                            beforeUpload={(f) => {
                                const problem = noteFileProblem(f);
                                if (problem) {
                                    message.error(problem);
                                    return Upload.LIST_IGNORE;
                                }
                                setFile(f);
                                return false;
                            }}
                            onRemove={() => setFile(null)}
                        >
                            <p className="ant-upload-drag-icon">
                                <InboxOutlined />
                            </p>
                            <p className="ant-upload-text">Drop a .txt or .md file here, or click to choose</p>
                            <p className="ant-upload-hint">
                                Up to {Math.round(limits.upload_max_bytes / 1024)} KB.
                            </p>
                        </Upload.Dragger>
                    ) : (
                        <Input.TextArea
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            rows={8}
                            maxLength={20000}
                            placeholder={
                                'e.g. Floods in Welipanna — parcels to and through Welipanna will not be ' +
                                'delivered today. Deliveries resume tomorrow morning.'
                            }
                        />
                    )}
                </Space>
            )}

            {draft && (
                <>
                    {draft.digest_source === 'fallback' && (
                        <Alert
                            type="info"
                            showIcon
                            style={{ marginBottom: 12 }}
                            message="The AI summary is unavailable right now"
                            description="This is the start of your note. Shorten it to what customers need before saving."
                        />
                    )}
                    {draft.warnings.length > 0 && (
                        <Alert
                            type="warning"
                            showIcon
                            style={{ marginBottom: 12 }}
                            message="Left out of what the assistant will know"
                            description={
                                <ul style={{ margin: 0, paddingInlineStart: 18 }}>
                                    {draft.warnings.map((w) => (
                                        <li key={w}>{w}</li>
                                    ))}
                                </ul>
                            }
                        />
                    )}
                    <Form form={form} layout="vertical" onFinish={submit} requiredMark={false}>
                        <Form.Item
                            name="title"
                            label="Title (only you see this)"
                            rules={[{ required: true, whitespace: true, message: 'Give it a title' }]}
                        >
                            <Input maxLength={120} />
                        </Form.Item>
                        <Form.Item
                            name="digest"
                            label="What the assistant will know"
                            extra="Written from your note. Edit anything — the assistant reads only this, and replies in each customer's own language."
                            rules={[{ required: true, whitespace: true, message: 'This cannot be empty' }]}
                        >
                            <Input.TextArea rows={5} showCount maxLength={limits.digest_max} />
                        </Form.Item>
                        <Form.Item name="mode" label="When should the assistant bring it up?">
                            <ModeChoice />
                        </Form.Item>
                        <Form.Item
                            name="window"
                            label="Live from → until (Sri Lanka time)"
                            rules={[{ required: true, message: 'Pick a start and end' }]}
                        >
                            <DatePicker.RangePicker
                                showTime={{ format: 'h:mm A', minuteStep: 5 }}
                                format="ddd D MMM YYYY, h:mm A"
                                presets={windowPresets()}
                                disabledDate={disabledPast}
                                style={{ width: '100%' }}
                            />
                        </Form.Item>
                        {isSuperAdmin && (
                            <Form.Item name="branch" label="Which branch's customers">
                                <Select
                                    showSearch
                                    optionFilterProp="label"
                                    options={[
                                        { label: 'All branches', value: ALL_BRANCHES },
                                        ...branches.map((b) => ({ label: b.name, value: b.branch_id })),
                                    ]}
                                />
                            </Form.Item>
                        )}
                    </Form>
                    <Collapse
                        size="small"
                        items={[
                            {
                                key: 'source',
                                label: draft.source_filename
                                    ? `Your original note (${draft.source_filename})`
                                    : 'Your original note',
                                children: (
                                    <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                                        {draft.source_text}
                                    </Paragraph>
                                ),
                            },
                        ]}
                    />
                </>
            )}
        </Modal>
    );
};

// ---------------------------------------------------------------------------
// Edit an existing briefing
// ---------------------------------------------------------------------------

const Editor: React.FC<{ briefing: Briefing | null; onClose: () => void; limits: BriefingLimits }> = ({
    briefing,
    onClose,
    limits,
}) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [form] = Form.useForm<ReviewValues>();

    const save = useMutation({
        mutationFn: (payload: BriefingUpdate) => briefingsApi.update(briefing!.briefing_id, payload),
        onSuccess: () => {
            message.success('Briefing updated.');
            queryClient.invalidateQueries({ queryKey: KEY });
            onClose();
        },
        onError: (err) => message.error(errorText(err, 'Could not update the briefing.')),
    });

    const submit = (v: ReviewValues) => {
        if (!briefing) return;
        const payload: BriefingUpdate = {
            title: v.title.trim(),
            mode: v.mode,
            starts_at: colomboISO(v.window[0]),
            ends_at: colomboISO(v.window[1]),
        };
        if (v.digest.trim() !== briefing.digest.trim()) payload.digest = v.digest.trim();
        save.mutate(payload);
    };

    return (
        <Modal
            open={briefing !== null}
            onCancel={onClose}
            title="Edit briefing"
            width={720}
            destroyOnHidden
            okText="Save changes"
            confirmLoading={save.isPending}
            onOk={() => form.submit()}
        >
            {briefing && (
                <Form
                    form={form}
                    layout="vertical"
                    requiredMark={false}
                    onFinish={submit}
                    initialValues={{
                        title: briefing.title,
                        digest: briefing.digest,
                        mode: briefing.mode,
                        window: [pickerValue(briefing.starts_at), pickerValue(briefing.ends_at)],
                    }}
                >
                    <Form.Item name="title" label="Title" rules={[{ required: true, whitespace: true }]}>
                        <Input maxLength={120} />
                    </Form.Item>
                    <Form.Item
                        name="digest"
                        label="What the assistant will know"
                        rules={[{ required: true, whitespace: true }]}
                    >
                        <Input.TextArea rows={5} showCount maxLength={limits.digest_max} />
                    </Form.Item>
                    <Form.Item name="mode" label="When should the assistant bring it up?">
                        <ModeChoice />
                    </Form.Item>
                    <Form.Item
                        name="window"
                        label="Live from → until (Sri Lanka time)"
                        rules={[{ required: true }]}
                    >
                        <DatePicker.RangePicker
                            showTime={{ format: 'h:mm A', minuteStep: 5 }}
                            format="ddd D MMM YYYY, h:mm A"
                            presets={windowPresets()}
                            style={{ width: '100%' }}
                        />
                    </Form.Item>
                </Form>
            )}
        </Modal>
    );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const AssistantBriefings: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const { isSuperAdmin, can } = usePermissions();
    const [branchFilter, setBranchFilter] = useState<string | undefined>();
    const [composing, setComposing] = useState(false);
    const [editing, setEditing] = useState<Briefing | null>(null);

    const canCreate = can('briefings', 'create');
    const canUpdate = can('briefings', 'update');
    const canDelete = can('briefings', 'delete');

    const { data: branches = [] } = useQuery({
        queryKey: ['admin', 'branches'],
        queryFn: branchesApi.list,
        enabled: isSuperAdmin,
    });

    const { data, isLoading, isError } = useQuery({
        queryKey: [...KEY, branchFilter],
        queryFn: () => briefingsApi.list(branchFilter),
        // A scheduled briefing turns live on its own; keep the status honest.
        refetchInterval: 60_000,
    });
    const items = useMemo(() => data?.items ?? [], [data]);
    const limits = data?.limits ?? DEFAULT_LIMITS;
    const liveCount = items.filter((b) => b.status === 'live' && !b.is_network_wide).length;

    const update = useMutation({
        mutationFn: ({ id, payload }: { id: string; payload: BriefingUpdate }) =>
            briefingsApi.update(id, payload),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
        onError: (err) => message.error(errorText(err, 'Could not update the briefing.')),
    });
    const remove = useMutation({
        mutationFn: (id: string) => briefingsApi.remove(id),
        onSuccess: () => {
            message.success('Briefing removed.');
            queryClient.invalidateQueries({ queryKey: KEY });
        },
        onError: (err) => message.error(errorText(err, 'Could not remove the briefing.')),
    });

    const columns: ColumnsType<Briefing> = [
        {
            title: 'Briefing',
            dataIndex: 'title',
            render: (_, b) => (
                <Space direction="vertical" size={2}>
                    <Text strong>{b.title}</Text>
                    <Space size={4} wrap>
                        {b.is_network_wide ? (
                            <Tag color="gold">All branches</Tag>
                        ) : (
                            isSuperAdmin && b.branch_name && <Tag>{b.branch_name}</Tag>
                        )}
                        {b.digest_source === 'manager' && (
                            <Tooltip title="The assistant reads your edited wording">
                                <Tag>Edited</Tag>
                            </Tooltip>
                        )}
                    </Space>
                </Space>
            ),
        },
        {
            title: 'Brought up',
            dataIndex: 'mode',
            width: 190,
            render: (mode: BriefingMode) => (
                <Tooltip title={MODE_META[mode].help}>
                    <Tag color={MODE_META[mode].color}>{MODE_META[mode].label}</Tag>
                </Tooltip>
            ),
        },
        {
            title: 'When (Sri Lanka time)',
            width: 280,
            render: (_, b) => <Text>{formatWindow(b.starts_at, b.ends_at)}</Text>,
        },
        {
            title: 'Status',
            dataIndex: 'status',
            width: 170,
            render: (_, b) => (
                <Space direction="vertical" size={2}>
                    <Tag color={STATUS_META[b.status].color}>{STATUS_META[b.status].label}</Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {mentionsLabel(b.mentions)}
                    </Text>
                </Space>
            ),
        },
        {
            title: '',
            width: 170,
            align: 'right',
            render: (_, b) =>
                b.can_edit ? (
                    <Space size={0}>
                        {canUpdate && (
                            <Tooltip title="Edit">
                                <Button type="text" icon={<EditOutlined />} onClick={() => setEditing(b)} />
                            </Tooltip>
                        )}
                        {canUpdate && b.status !== 'ended' && (
                            <Tooltip title={b.is_active ? 'Pause' : 'Resume'}>
                                <Button
                                    type="text"
                                    icon={b.is_active ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                                    onClick={() =>
                                        update.mutate({ id: b.briefing_id, payload: { is_active: !b.is_active } })
                                    }
                                />
                            </Tooltip>
                        )}
                        {canUpdate && b.status === 'live' && (
                            <Popconfirm
                                title="End this briefing now?"
                                description="The assistant stops using it immediately."
                                okText="End now"
                                onConfirm={() =>
                                    update.mutate({
                                        id: b.briefing_id,
                                        payload: { ends_at: slt().toISOString() },
                                    })
                                }
                            >
                                <Tooltip title="End now">
                                    <Button type="text" icon={<StopOutlined />} />
                                </Tooltip>
                            </Popconfirm>
                        )}
                        {canDelete && (
                            <Popconfirm
                                title="Delete this briefing?"
                                okText="Delete"
                                okButtonProps={{ danger: true }}
                                onConfirm={() => remove.mutate(b.briefing_id)}
                            >
                                <Tooltip title="Delete">
                                    <Button type="text" danger icon={<DeleteOutlined />} />
                                </Tooltip>
                            </Popconfirm>
                        )}
                    </Space>
                ) : (
                    <Tooltip title="Network-wide briefings are managed by the Super Admin">
                        <Text type="secondary">View only</Text>
                    </Tooltip>
                ),
        },
    ];

    return (
        <div>
            <Space
                style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}
                wrap
                align="start"
            >
                <div>
                    <Title level={3} style={{ marginBottom: 4 }}>
                        AI Briefings
                    </Title>
                    <Text type="secondary">
                        Tell the shopping assistant what is happening at your branch. While a briefing
                        is live, the assistant takes it into account when it answers your customers — in
                        their own language.
                    </Text>
                </div>
                <Space wrap>
                    {isSuperAdmin && (
                        <Select
                            allowClear
                            showSearch
                            optionFilterProp="label"
                            placeholder="All branches"
                            style={{ minWidth: 200 }}
                            value={branchFilter}
                            onChange={setBranchFilter}
                            options={branches.map((b) => ({ label: b.name, value: b.branch_id }))}
                        />
                    )}
                    {canCreate && (
                        <Button type="primary" icon={<PlusOutlined />} onClick={() => setComposing(true)}>
                            New briefing
                        </Button>
                    )}
                </Space>
            </Space>

            {!isSuperAdmin && liveCount >= limits.max_live_branch && (
                <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message={`${limits.max_live_branch} briefings are live — the most a branch can run at once. End or pause one to add another.`}
                />
            )}

            <Card styles={{ body: { padding: 0 } }}>
                {isError ? (
                    <Alert type="error" showIcon message="Could not load briefings." style={{ margin: 16 }} />
                ) : (
                    <Table
                        rowKey="briefing_id"
                        loading={isLoading}
                        columns={columns}
                        dataSource={items}
                        pagination={{ pageSize: 20, hideOnSinglePage: true }}
                        scroll={{ x: 900 }}
                        locale={{
                            emptyText: (
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description={
                                        <Space direction="vertical" size={2}>
                                            <Text>No briefings yet.</Text>
                                            <Text type="secondary">
                                                A delivery disruption, a festival at the branch, changed
                                                opening hours — tell the assistant, and it tells your
                                                customers.
                                            </Text>
                                        </Space>
                                    }
                                />
                            ),
                        }}
                        expandable={{
                            expandedRowRender: (b) => (
                                <Space direction="vertical" style={{ width: '100%' }}>
                                    <div>
                                        <Text type="secondary">What the assistant knows</Text>
                                        <Paragraph style={{ marginBottom: 0 }}>{b.digest}</Paragraph>
                                    </div>
                                    <Collapse
                                        size="small"
                                        ghost
                                        items={[
                                            {
                                                key: 'source',
                                                label: b.source_filename
                                                    ? `Original note (${b.source_filename})`
                                                    : 'Original note',
                                                children: (
                                                    <Paragraph style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                                                        {b.source_text}
                                                    </Paragraph>
                                                ),
                                            },
                                        ]}
                                    />
                                </Space>
                            ),
                        }}
                    />
                )}
            </Card>

            <Composer
                open={composing}
                onClose={() => setComposing(false)}
                isSuperAdmin={isSuperAdmin}
                branches={branches}
                defaultBranch={branchFilter}
                limits={limits}
            />
            <Editor briefing={editing} onClose={() => setEditing(null)} limits={limits} />
        </div>
    );
};

export default AssistantBriefings;
