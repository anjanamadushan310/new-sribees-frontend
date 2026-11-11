import { useEffect, useRef, useState } from 'react';
import { Alert, App, Button, Card, Input, Space, Tag, Typography } from 'antd';
import { SendOutlined, WhatsAppOutlined } from '@ant-design/icons';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { whatsAppSupportApi } from '../../api/support.api';
import { useAuthStore } from '../../store/authStore';

const STATUS_LABELS: Record<string, string> = {
    pending: 'Queued', sending: 'Sending', accepted: 'Accepted by WhatsApp',
    sent: 'Sent', delivered: 'Delivered', read: 'Read', failed: 'Failed',
    uncertain: 'Delivery unconfirmed — do not resend', expired: 'Reply window expired',
    cancelled: 'Cancelled',
};

function errorMessage(error: unknown): string {
    if (isAxiosError(error) && typeof error.response?.data?.detail === 'string') {
        return error.response.data.detail;
    }
    return 'The request could not be confirmed. Retry with the same message to avoid duplicates.';
}

export function WhatsAppTicketChat({ ticketId }: { ticketId: string }) {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const user = useAuthStore((state) => state.user);
    const canUpdate = useAuthStore((state) => state.hasPermission('support', 'update'));
    const [draft, setDraft] = useState('');
    const [attachmentLoading, setAttachmentLoading] = useState<string | null>(null);
    const downloadAttachment = async (messageId: string) => {
        setAttachmentLoading(messageId);
        try {
            const blob = await whatsAppSupportApi.attachment(ticketId, messageId);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const extension = blob.type === 'application/pdf' ? 'pdf' : blob.type === 'image/png' ? 'png' : 'jpg';
            link.download = `support-attachment.${extension}`;
            link.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch {
            message.error('Attachment unavailable. Ask the customer to resend it.');
        } finally {
            setAttachmentLoading(null);
        }
    };
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, []);
    // Retain the request ID on ambiguous network errors so retries cannot duplicate a send.
    const pendingRequest = useRef<{ body: string; id: string } | null>(null);
    const queryKey = ['whatsapp-ticket', ticketId];
    const history = useInfiniteQuery({
        queryKey,
        initialPageParam: undefined as string | undefined,
        queryFn: ({ pageParam }) => whatsAppSupportApi.history(ticketId, pageParam),
        getNextPageParam: (page) => page.next_before ?? undefined,
        refetchInterval: 5000,
    });
    const current = history.data?.pages[0];
    const refresh = async () => {
        await queryClient.invalidateQueries({ queryKey });
        await queryClient.invalidateQueries({ queryKey: ['admin', 'supportTickets'] });
    };
    const control = useMutation({
        mutationFn: (action: 'claim' | 'release') => whatsAppSupportApi[action](ticketId),
        onSuccess: refresh,
        onError: (error) => { message.error(errorMessage(error)); },
    });
    const send = useMutation({
        mutationFn: async () => {
            const body = draft.trim();
            if (!pendingRequest.current || pendingRequest.current.body !== body) {
                pendingRequest.current = { body, id: crypto.randomUUID() };
            }
            return whatsAppSupportApi.send(ticketId, body, pendingRequest.current.id);
        },
        onSuccess: async () => {
            pendingRequest.current = null;
            setDraft('');
            await refresh();
        },
        onError: (error) => { message.error(errorMessage(error)); },
    });
    if (history.isPending) return <Card size="small" loading style={{ marginBottom: 24 }} />;
    if (history.isError) return <Alert title="WhatsApp history could not be loaded" type="warning"
        action={<Button onClick={() => history.refetch()}>Retry</Button>} style={{ marginBottom: 24 }} />;
    if (!current?.available) return null;

    const mine = current.staff_active && current.assigned_admin_id === user?.admin_id;
    const expiresAt = current.reply_until ? new Date(current.reply_until).getTime() : 0;
    const windowOpen = expiresAt > now;
    const canSend = canUpdate && mine && current.active && current.enabled && windowOpen;
    const rows = [...(history.data?.pages ?? [])].reverse().flatMap((page) => page.messages);
    return <Card size="small" title={<Space><WhatsAppOutlined />WhatsApp conversation</Space>}
        style={{ marginBottom: 24 }}>
        <Space orientation="vertical" style={{ width: '100%' }} size={14}>
            <Typography.Text type="secondary">
                Earlier messages remain in Customer Message above. New messages appear here automatically.
            </Typography.Text>
            <Space wrap>
                <Tag color={current.staff_active ? 'processing' : 'default'}>
                    {current.staff_active ? (mine ? 'Assigned to you · Bot paused' : 'Assigned to another staff member') : 'Awaiting staff'}
                </Tag>
                {canUpdate && current.active && !current.staff_active && <Button
                    loading={control.isPending} onClick={() => control.mutate('claim')}>Take over chat</Button>}
                {canUpdate && mine && current.active && <Button loading={control.isPending}
                    disabled={send.isPending} onClick={() => control.mutate('release')}>Release chat</Button>}
            </Space>
            {!current.active && <Alert type="info" title="This conversation has ended. Ask the customer to send SUPPORT again." />}
            {current.active && !windowOpen && <Alert type="warning"
                title="The 24-hour reply window has ended"
                description="Wait for a new customer message. Messages outside this window require an approved WhatsApp template." />}
            {!current.enabled && <Alert type="warning" title="WhatsApp sending is disabled" />}
            <div role="log" aria-label="WhatsApp message history" style={{ maxHeight: 420, overflowY: 'auto', padding: 4 }}>
                {history.hasNextPage && <Button block size="small" loading={history.isFetchingNextPage}
                    onClick={() => history.fetchNextPage()} style={{ marginBottom: 12 }}>Load earlier messages</Button>}
                {rows.length === 0 && <Typography.Text type="secondary">No new chat messages yet.</Typography.Text>}
                {rows.map((row) => <div key={row.id}>
                    {row.incoming_type && <div style={{ margin: '0 32px 12px 0', padding: 12, borderRadius: 12, background: '#f5f5f5' }}>
                        <Typography.Text strong>Customer</Typography.Text>
                        <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                            {row.incoming || `[${row.incoming_type} message]`}
                            {row.has_attachment && <Button size="small" loading={attachmentLoading === row.id}
                                onClick={() => downloadAttachment(row.id)}>Download attachment</Button>}
                        </div>
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                            {new Date(row.received_at ?? row.created_at).toLocaleString()}
                        </Typography.Text>
                    </div>}
                    {row.outgoing && <div style={{ margin: '0 0 12px 32px', padding: 12, borderRadius: 12, background: '#fce8f0' }}>
                        <Typography.Text strong>{row.is_staff ? 'Staff reply' : 'Automatic reply'}</Typography.Text>
                        <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.outgoing}</div>
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                            {new Date(row.created_at).toLocaleString()} · {STATUS_LABELS[row.status] ?? row.status}
                            {row.error_code ? ` · Error ${row.error_code}` : ''}
                        </Typography.Text>
                    </div>}
                </div>)}
            </div>
            <Input.TextArea aria-label="WhatsApp reply" value={draft} maxLength={4096} showCount
                disabled={!canSend || send.isPending} autoSize={{ minRows: 3, maxRows: 8 }}
                onChange={(event) => setDraft(event.target.value)} placeholder="Reply to the customer on WhatsApp" />
            <Button type="primary" icon={<SendOutlined />} disabled={!canSend || !draft.trim()}
                loading={send.isPending} onClick={() => send.mutate()}>Send WhatsApp reply</Button>
            {current.reply_until && windowOpen && <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Reply window closes {new Date(current.reply_until).toLocaleString()} (5-minute safety margin).
            </Typography.Text>}
        </Space>
    </Card>;
}
