/**
 * Push Campaigns (Marketing Manager / Super Admin)
 *
 * Compose an offer, promotion or announcement once — in English, and in
 * Sinhala and Tamil for the customers whose app is in those languages — and
 * send it to customers' phones now or at a set time. The phone on the right
 * shows exactly what arrives; the audience panel shows how many customers
 * and devices it will reach, and which languages still read English.
 *
 * Sending happens on the server in the background, so the history table
 * below polls while anything is scheduled or sending, and shows delivery
 * and opens as they come in.
 *
 * Customers control three switches in the app (Offers / Promotions /
 * General, all on by default); the category chosen here decides which one
 * applies, and anyone who switched it off is left out.
 */
import React, { useEffect, useState } from 'react';
import {
    Alert,
    App,
    Button,
    Card,
    Col,
    DatePicker,
    Empty,
    Form,
    Image,
    Input,
    Popconfirm,
    Radio,
    Row,
    Segmented,
    Select,
    Space,
    Spin,
    Table,
    Tabs,
    Tag,
    Tooltip,
    Typography,
    Upload,
} from 'antd';
import {
    BellOutlined,
    CheckCircleFilled,
    CopyOutlined,
    DeleteOutlined,
    GiftOutlined,
    NotificationOutlined,
    PictureOutlined,
    SendOutlined,
    StopOutlined,
    TeamOutlined,
    MobileOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import type { UploadProps } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import dayjs, { type Dayjs } from 'dayjs';
import {
    campaignsApi,
    type Campaign,
    type CampaignCategory,
    type CampaignPayload,
    type CampaignStatus,
    type Lang,
    type LocalizedText,
} from '../../api/campaigns.api';
import { branchesApi } from '../../api/branches.api';
import { productsApi } from '../../api/products.api';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuthStore } from '../../store/authStore';
import { DISPLAY_TZ, slt } from '../../utils/datetime';
import {
    BRAND_TITLE,
    LANGS,
    LANG_LABEL,
    MESSAGE_MAX,
    TITLE_MAX,
    deliveryRate,
    formatRate,
    languageShares,
    missingTranslations,
    textFor,
} from '../../utils/campaigns';

const { Title, Text, Paragraph } = Typography;

const CAMPAIGNS_KEY = 'admin-push-campaigns';

const CATEGORY_META: Record<CampaignCategory, { label: string; icon: React.ReactNode; hint: string; color: string }> = {
    offers: {
        label: 'Offer',
        icon: <GiftOutlined />,
        hint: 'Coupons, discounts and deals',
        color: 'magenta',
    },
    promotions: {
        label: 'Promotion',
        icon: <NotificationOutlined />,
        hint: 'Sales, new arrivals, seasonal events',
        color: 'purple',
    },
    general: {
        label: 'General',
        icon: <BellOutlined />,
        hint: 'News and announcements',
        color: 'blue',
    },
};

const STATUS_META: Record<CampaignStatus, { label: string; color: string }> = {
    scheduled: { label: 'Scheduled', color: 'blue' },
    sending: { label: 'Sending', color: 'processing' },
    sent: { label: 'Sent', color: 'green' },
    failed: { label: 'Failed', color: 'red' },
    cancelled: { label: 'Cancelled', color: 'default' },
};

const LANG_COLOR: Record<Lang, string> = { en: '#8c8c97', si: '#d81b60', ta: '#7b61ff' };

interface FormValues {
    category: CampaignCategory;
    /** Super Admin: 'all' or a branch id. */
    audience?: string;
    title: LocalizedText;
    message: LocalizedText;
    link: 'feed' | 'offers' | 'product';
    product_id?: string;
    when: 'now' | 'later';
    scheduled_at?: Dayjs;
}

const DEFAULTS: Partial<FormValues> = {
    category: 'offers',
    audience: 'all',
    link: 'feed',
    when: 'now',
    title: { en: '', si: '', ta: '' },
    message: { en: '', si: '', ta: '' },
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

function useDebounced<T>(value: T, ms: number): T {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const id = setTimeout(() => setDebounced(value), ms);
        return () => clearTimeout(id);
    }, [value, ms]);
    return debounced;
}

const numberFmt = new Intl.NumberFormat('en-LK');

// ── Phone preview ──────────────────────────────────────────────────────────

const PhonePreview: React.FC<{
    title: LocalizedText;
    message: LocalizedText;
    lang: Lang;
    imageUrl: string | null;
}> = ({ title, message, lang, imageUrl }) => {
    const headline = textFor(title, lang);
    const body = textFor(message, lang);
    const empty = !headline && !body;
    return (
        <div
            aria-label="Notification preview"
            style={{
                borderRadius: 32,
                padding: 10,
                background: '#111',
                boxShadow: '0 18px 40px rgba(20, 8, 12, 0.25)',
                maxWidth: 340,
                margin: '0 auto',
            }}
        >
            <div
                style={{
                    borderRadius: 24,
                    minHeight: 420,
                    padding: '14px 12px',
                    background: 'linear-gradient(160deg, #2b1419 0%, #5a3a2c 55%, #8a2350 100%)',
                }}
            >
                <div style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, textAlign: 'center', marginBottom: 18 }}>
                    {slt().format('h:mm')}
                </div>
                <div
                    style={{
                        background: 'rgba(255,255,255,0.96)',
                        borderRadius: 20,
                        padding: 12,
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                    }}
                >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <div
                            style={{
                                width: 20,
                                height: 20,
                                borderRadius: 6,
                                background: '#d81b60',
                                color: '#fff',
                                fontSize: 12,
                                fontWeight: 800,
                                display: 'grid',
                                placeItems: 'center',
                            }}
                        >
                            S
                        </div>
                        <Text style={{ fontSize: 12, color: '#5f5f6b' }}>{BRAND_TITLE} · now</Text>
                    </div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a22', lineHeight: 1.35 }}>
                        {BRAND_TITLE}
                    </div>
                    {empty ? (
                        <div style={{ color: '#a7a3ad', fontSize: 13 }}>Your message appears here</div>
                    ) : (
                        <div style={{ fontSize: 13, color: '#3a3a44', lineHeight: 1.45, whiteSpace: 'pre-line' }}>
                            {headline && <span style={{ fontWeight: 600 }}>{headline}</span>}
                            {headline && body ? '\n' : ''}
                            {body}
                        </div>
                    )}
                    {imageUrl && (
                        <div
                            style={{
                                marginTop: 10,
                                borderRadius: 12,
                                overflow: 'hidden',
                                aspectRatio: '2 / 1',
                                background: '#f0eef2',
                            }}
                        >
                            <img
                                src={imageUrl}
                                alt=""
                                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ── Page ───────────────────────────────────────────────────────────────────

const PushCampaigns: React.FC = () => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const { isSuperAdmin, can } = usePermissions();
    const { user } = useAuthStore();
    const canSend = can('marketing', 'create');
    const canCancel = can('marketing', 'update');

    const [form] = Form.useForm<FormValues>();
    const [lang, setLang] = useState<Lang>('en');
    const [image, setImage] = useState<{ url: string; path: string } | null>(null);
    const [uploading, setUploading] = useState(false);
    const [productSearch, setProductSearch] = useState('');
    const debouncedSearch = useDebounced(productSearch, 300);

    const values = (Form.useWatch([], form) ?? DEFAULTS) as Partial<FormValues>;
    const category = values.category ?? 'offers';
    const title: LocalizedText = values.title ?? { en: '' };
    const body: LocalizedText = values.message ?? { en: '' };
    const audienceBranch = isSuperAdmin && values.audience && values.audience !== 'all' ? values.audience : null;

    // ── Data ──
    const { data: branches = [] } = useQuery({
        queryKey: ['admin', 'branches'],
        queryFn: branchesApi.list,
        enabled: isSuperAdmin,
    });

    const audienceQuery = useQuery({
        queryKey: ['campaign-audience', category, audienceBranch],
        queryFn: () => campaignsApi.audience(category, audienceBranch),
        staleTime: 30_000,
    });
    const audience = audienceQuery.data;

    const productsQuery = useQuery({
        queryKey: ['campaign-products', debouncedSearch],
        queryFn: () => productsApi.list({ search: debouncedSearch || undefined, limit: 20, is_active: true }),
        enabled: values.link === 'product',
    });

    const listQuery = useQuery({
        queryKey: [CAMPAIGNS_KEY],
        queryFn: () => campaignsApi.list(1, 50),
        // Delivery runs in the background: follow it while anything is live.
        refetchInterval: (q) =>
            q.state.data?.campaigns.some((c) => c.status === 'scheduled' || c.status === 'sending') ? 5000 : false,
    });
    const campaigns = listQuery.data?.campaigns ?? [];

    // ── Mutations ──
    const createMutation = useMutation({
        mutationFn: (payload: CampaignPayload) => campaignsApi.create(payload),
        onSuccess: (c) => {
            const later = c.scheduled_at && dayjs(c.scheduled_at).isAfter(dayjs().add(1, 'minute'));
            message.success(
                later
                    ? `Scheduled for ${slt(c.scheduled_at).format('ddd D MMM, h:mm A')}`
                    : 'Sending now — delivery shows below as it happens.',
            );
            form.resetFields();
            setImage(null);
            setLang('en');
            queryClient.invalidateQueries({ queryKey: [CAMPAIGNS_KEY] });
        },
        onError: (err) => message.error(errorText(err, 'Could not send the campaign.')),
    });

    const cancelMutation = useMutation({
        mutationFn: (id: string) => campaignsApi.cancel(id),
        onSuccess: () => {
            message.success('Cancelled. Nobody will receive it.');
            queryClient.invalidateQueries({ queryKey: [CAMPAIGNS_KEY] });
        },
        onError: (err) => message.error(errorText(err, 'Could not cancel it.')),
    });

    // ── Derived ──
    // Cheap, and title/body are fresh objects each render anyway.
    const missing = missingTranslations(audience, title, body);
    const shares = languageShares(audience?.devices_by_language);
    const reach = audience?.customers ?? 0;
    const scheduledAt = values.when === 'later' ? values.scheduled_at : undefined;

    const submitLabel =
        values.when === 'later' && scheduledAt
            ? `Schedule for ${scheduledAt.format('ddd D MMM, h:mm A')}`
            : `Send to ${numberFmt.format(reach)} customer${reach === 1 ? '' : 's'}`;

    const uploadProps: UploadProps = {
        accept: 'image/jpeg,image/png,image/webp',
        showUploadList: false,
        beforeUpload: async (file) => {
            if (file.size > 1024 * 1024) {
                message.error('Notification images must be under 1 MB.');
                return Upload.LIST_IGNORE;
            }
            setUploading(true);
            try {
                const uploaded = await campaignsApi.uploadImage(file as File);
                setImage({ url: uploaded.image_url, path: uploaded.path });
            } catch (err) {
                message.error(errorText(err, 'Image upload failed.'));
            } finally {
                setUploading(false);
            }
            return false;
        },
    };

    const submit = async () => {
        const v = await form.validateFields();
        const clean = (t: LocalizedText): LocalizedText => ({
            en: (t.en ?? '').trim(),
            si: (t.si ?? '').trim() || null,
            ta: (t.ta ?? '').trim() || null,
        });
        const payload: CampaignPayload = {
            category: v.category,
            title: clean(v.title),
            message: clean(v.message),
            image_url: image?.path ?? null,
            link_type: v.link === 'feed' ? null : v.link,
            link_value: v.link === 'product' ? v.product_id : null,
            branch_id: isSuperAdmin ? (v.audience && v.audience !== 'all' ? v.audience : null) : undefined,
            // The picked wall-clock time is Sri Lanka time, whatever this
            // computer's timezone is.
            scheduled_at:
                v.when === 'later' && v.scheduled_at
                    ? dayjs.tz(v.scheduled_at.format('YYYY-MM-DD HH:mm'), DISPLAY_TZ).toISOString()
                    : null,
        };
        createMutation.mutate(payload);
    };

    const duplicate = (c: Campaign) => {
        form.setFieldsValue({
            category: c.category,
            title: { en: c.title.en ?? '', si: c.title.si ?? '', ta: c.title.ta ?? '' },
            message: { en: c.message.en ?? '', si: c.message.si ?? '', ta: c.message.ta ?? '' },
            link: c.link_type ?? 'feed',
            product_id: c.link_type === 'product' ? (c.link_value ?? undefined) : undefined,
            audience: isSuperAdmin ? (c.branch_id ?? 'all') : undefined,
            when: 'now',
        });
        setImage(c.image_url ? { url: c.image_url, path: c.image_url } : null);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        message.info('Copied into the composer. Review it, then send.');
    };

    // ── Language tabs ──
    const tabItems = LANGS.map((code) => {
        const filled = Boolean((title[code] ?? '').trim() && (body[code] ?? '').trim());
        return {
            key: code,
            label: (
                <span>
                    {LANG_LABEL[code]}
                    {code === 'en' ? (
                        <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>required</Text>
                    ) : filled ? (
                        <CheckCircleFilled style={{ color: '#52c41a', marginLeft: 6 }} />
                    ) : null}
                </span>
            ),
            forceRender: true,
            children: (
                <>
                    <Form.Item
                        name={['title', code]}
                        label="Headline"
                        rules={[
                            ...(code === 'en' ? [{ required: true, whitespace: true, message: 'Add an English headline' }] : []),
                            { max: TITLE_MAX, message: `At most ${TITLE_MAX} characters` },
                        ]}
                    >
                        <Input
                            maxLength={TITLE_MAX}
                            showCount
                            placeholder={code === 'en' ? 'e.g. Fresh mangoes, 20% off this weekend' : `Leave blank to send English to ${LANG_LABEL[code]} readers`}
                        />
                    </Form.Item>
                    <Form.Item
                        name={['message', code]}
                        label="Message"
                        rules={[
                            ...(code === 'en' ? [{ required: true, whitespace: true, message: 'Add an English message' }] : []),
                            { max: MESSAGE_MAX, message: `At most ${MESSAGE_MAX} characters` },
                        ]}
                    >
                        <Input.TextArea
                            maxLength={MESSAGE_MAX}
                            showCount
                            autoSize={{ minRows: 3, maxRows: 6 }}
                            placeholder={code === 'en' ? 'Say what it is and why to open the app now.' : undefined}
                        />
                    </Form.Item>
                </>
            ),
        };
    });

    // ── History ──
    const columns: ColumnsType<Campaign> = [
        {
            title: 'When',
            key: 'when',
            width: 150,
            render: (_, c) => {
                const at = c.finished_at ?? c.started_at ?? c.scheduled_at;
                return (
                    <Space direction="vertical" size={0}>
                        <Text>{at ? slt(at).format('D MMM, h:mm A') : '—'}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {c.created_by_name ?? ''}
                        </Text>
                    </Space>
                );
            },
        },
        {
            title: 'Campaign',
            key: 'campaign',
            render: (_, c) => (
                <Space align="start">
                    {c.image_url ? (
                        <Image src={c.image_url} width={64} height={32} style={{ objectFit: 'cover', borderRadius: 6 }} />
                    ) : (
                        <div
                            style={{
                                width: 64,
                                height: 32,
                                borderRadius: 6,
                                background: '#f5f5f5',
                                display: 'grid',
                                placeItems: 'center',
                                color: '#bbb',
                            }}
                        >
                            <PictureOutlined />
                        </div>
                    )}
                    <Space direction="vertical" size={2}>
                        <Text strong>{c.title.en}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }} ellipsis={{ tooltip: c.message.en }}>
                            {c.message.en}
                        </Text>
                        <Space size={4} wrap>
                            <Tag color={CATEGORY_META[c.category].color}>{CATEGORY_META[c.category].label}</Tag>
                            {(['si', 'ta'] as Lang[])
                                .filter((l) => c.title[l] || c.message[l])
                                .map((l) => (
                                    <Tag key={l}>{LANG_LABEL[l]}</Tag>
                                ))}
                        </Space>
                    </Space>
                </Space>
            ),
        },
        {
            title: 'Audience',
            key: 'audience',
            width: 150,
            render: (_, c) => (c.branch_id ? c.branch_name ?? 'Branch' : <Tag icon={<TeamOutlined />}>All customers</Tag>),
        },
        {
            title: 'Status',
            key: 'status',
            width: 120,
            render: (_, c) => (
                <Tooltip title={c.error ?? undefined}>
                    <Tag color={STATUS_META[c.status].color}>{STATUS_META[c.status].label}</Tag>
                </Tooltip>
            ),
        },
        {
            title: (
                <Tooltip title="Customers who got it in the app / phones it was pushed to">Reach</Tooltip>
            ),
            key: 'reach',
            width: 120,
            align: 'right',
            render: (_, c) =>
                c.status === 'scheduled' || c.status === 'cancelled' ? (
                    '—'
                ) : (
                    <Space direction="vertical" size={0} style={{ textAlign: 'right' }}>
                        <Text>{numberFmt.format(c.recipients)}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            <MobileOutlined /> {numberFmt.format(c.devices)}
                        </Text>
                    </Space>
                ),
        },
        {
            title: <Tooltip title="Phones Firebase accepted it for">Delivered</Tooltip>,
            key: 'delivered',
            width: 110,
            align: 'right',
            render: (_, c) => (c.devices ? formatRate(deliveryRate(c)) : '—'),
        },
        {
            title: <Tooltip title="Customers who opened it, from the push or the app's feed">Opened</Tooltip>,
            key: 'opened',
            width: 110,
            align: 'right',
            render: (_, c) =>
                c.recipients ? (
                    <Space direction="vertical" size={0} style={{ textAlign: 'right' }}>
                        <Text strong>{formatRate(c.open_rate)}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                            {numberFmt.format(c.opened)}
                        </Text>
                    </Space>
                ) : (
                    '—'
                ),
        },
        {
            title: '',
            key: 'actions',
            width: 96,
            render: (_, c) => (
                <Space>
                    {canSend && (
                        <Tooltip title="Duplicate">
                            <Button type="text" icon={<CopyOutlined />} onClick={() => duplicate(c)} />
                        </Tooltip>
                    )}
                    {canCancel && c.status === 'scheduled' && (
                        <Popconfirm
                            title="Cancel this campaign?"
                            description="Nobody will receive it."
                            okText="Cancel campaign"
                            cancelText="Keep"
                            onConfirm={() => cancelMutation.mutate(c.campaign_id)}
                        >
                            <Tooltip title="Cancel">
                                <Button type="text" danger icon={<StopOutlined />} />
                            </Tooltip>
                        </Popconfirm>
                    )}
                </Space>
            ),
        },
    ];

    const audienceLabel = isSuperAdmin
        ? audienceBranch
            ? branches.find((b) => b.branch_id === audienceBranch)?.name ?? 'this branch'
            : 'every customer'
        : user?.branch_name
          ? `customers of ${user.branch_name}`
          : "your branch's customers";

    return (
        <div>
            <div style={{ marginBottom: 20 }}>
                <Title level={3} style={{ marginBottom: 4 }}>
                    Push Campaigns
                </Title>
                <Text type="secondary">
                    Send offers and news to customers&apos; phones — in the language their app is in.
                </Text>
            </div>

            {canSend && (
                <Row gutter={[24, 24]} style={{ marginBottom: 24 }}>
                    <Col xs={24} lg={14}>
                        <Card title="New campaign">
                            <Form<FormValues> form={form} layout="vertical" initialValues={DEFAULTS} requiredMark={false}>
                                <Form.Item name="category" label="Type">
                                    <Radio.Group style={{ width: '100%' }}>
                                        <Row gutter={8}>
                                            {(Object.keys(CATEGORY_META) as CampaignCategory[]).map((key) => (
                                                <Col span={8} key={key}>
                                                    <Radio.Button
                                                        value={key}
                                                        style={{ width: '100%', height: 'auto', padding: '8px 12px', lineHeight: 1.3 }}
                                                    >
                                                        <div style={{ fontWeight: 600 }}>
                                                            {CATEGORY_META[key].icon} {CATEGORY_META[key].label}
                                                        </div>
                                                        <div style={{ fontSize: 12, opacity: 0.7, whiteSpace: 'normal' }}>
                                                            {CATEGORY_META[key].hint}
                                                        </div>
                                                    </Radio.Button>
                                                </Col>
                                            ))}
                                        </Row>
                                    </Radio.Group>
                                </Form.Item>

                                {isSuperAdmin && (
                                    <Form.Item name="audience" label="Send to">
                                        <Select
                                            showSearch
                                            optionFilterProp="label"
                                            options={[
                                                { label: 'All customers', value: 'all' },
                                                ...branches.map((b) => ({
                                                    label: `Customers of ${b.name}`,
                                                    value: b.branch_id,
                                                })),
                                            ]}
                                        />
                                    </Form.Item>
                                )}

                                <Tabs
                                    activeKey={lang}
                                    onChange={(k) => setLang(k as Lang)}
                                    items={tabItems}
                                    style={{ marginBottom: 8 }}
                                />

                                <Form.Item
                                    label="Picture"
                                    extra="Shown when the notification is expanded. Wide 2:1 images (e.g. 1024 × 512) look best. Under 1 MB."
                                >
                                    {image ? (
                                        <Space align="start">
                                            <img
                                                src={image.url}
                                                alt=""
                                                style={{ width: 160, aspectRatio: '2 / 1', objectFit: 'cover', borderRadius: 8 }}
                                            />
                                            <Button icon={<DeleteOutlined />} onClick={() => setImage(null)}>
                                                Remove
                                            </Button>
                                        </Space>
                                    ) : (
                                        <Upload {...uploadProps}>
                                            <Button icon={<UploadOutlined />} loading={uploading}>
                                                Add a picture
                                            </Button>
                                        </Upload>
                                    )}
                                </Form.Item>

                                <Form.Item name="link" label="A tap opens">
                                    <Radio.Group
                                        optionType="button"
                                        options={[
                                            { label: 'Notifications', value: 'feed' },
                                            { label: 'Offers & coupons', value: 'offers' },
                                            { label: 'A product', value: 'product' },
                                        ]}
                                    />
                                </Form.Item>
                                {values.link === 'product' && (
                                    <Form.Item
                                        name="product_id"
                                        rules={[{ required: true, message: 'Choose the product to open' }]}
                                    >
                                        <Select
                                            showSearch
                                            filterOption={false}
                                            onSearch={setProductSearch}
                                            loading={productsQuery.isFetching}
                                            placeholder="Search products by name"
                                            notFoundContent={productsQuery.isFetching ? <Spin size="small" /> : 'No products'}
                                            options={(productsQuery.data?.products ?? []).map((p) => ({
                                                label: p.name,
                                                value: p.product_id,
                                            }))}
                                        />
                                    </Form.Item>
                                )}

                                <Form.Item name="when" label="When">
                                    <Radio.Group
                                        optionType="button"
                                        options={[
                                            { label: 'Send now', value: 'now' },
                                            { label: 'Schedule', value: 'later' },
                                        ]}
                                    />
                                </Form.Item>
                                {values.when === 'later' && (
                                    <Form.Item
                                        name="scheduled_at"
                                        extra="Sri Lanka time. Up to 30 days ahead."
                                        rules={[
                                            { required: true, message: 'Pick a date and time' },
                                            {
                                                validator: (_, v?: Dayjs) =>
                                                    !v ||
                                                    dayjs
                                                        .tz(v.format('YYYY-MM-DD HH:mm'), DISPLAY_TZ)
                                                        .isAfter(slt().add(1, 'minute'))
                                                        ? Promise.resolve()
                                                        : Promise.reject(new Error('Pick a time in the future')),
                                            },
                                        ]}
                                    >
                                        <DatePicker
                                            showTime={{ format: 'h:mm A', minuteStep: 5 }}
                                            format="ddd D MMM YYYY, h:mm A"
                                            style={{ width: '100%' }}
                                            disabledDate={(d) =>
                                                d.isBefore(slt().startOf('day')) || d.isAfter(slt().add(30, 'day'))
                                            }
                                        />
                                    </Form.Item>
                                )}

                                <Popconfirm
                                    title={values.when === 'later' ? 'Schedule this campaign?' : 'Send it now?'}
                                    description={
                                        values.when === 'later'
                                            ? 'You can cancel it until it starts.'
                                            : `It goes to ${audienceLabel} straight away and cannot be recalled.`
                                    }
                                    okText={values.when === 'later' ? 'Schedule' : 'Send'}
                                    onConfirm={submit}
                                >
                                    <Button
                                        type="primary"
                                        size="large"
                                        icon={<SendOutlined />}
                                        loading={createMutation.isPending}
                                        disabled={values.when !== 'later' && audienceQuery.isSuccess && reach === 0}
                                    >
                                        {submitLabel}
                                    </Button>
                                </Popconfirm>
                            </Form>
                        </Card>
                    </Col>

                    <Col xs={24} lg={10}>
                        <div style={{ position: 'sticky', top: 16 }}>
                            <Card
                                title="Preview"
                                extra={
                                    <Segmented<Lang>
                                        size="small"
                                        value={lang}
                                        onChange={setLang}
                                        options={LANGS.map((l) => ({ label: LANG_LABEL[l], value: l }))}
                                    />
                                }
                                style={{ marginBottom: 16 }}
                            >
                                <PhonePreview title={title} message={body} lang={lang} imageUrl={image?.url ?? null} />
                                <Paragraph type="secondary" style={{ fontSize: 12, textAlign: 'center', marginTop: 12, marginBottom: 0 }}>
                                    Expanded view. Every push is titled “{BRAND_TITLE}”.
                                </Paragraph>
                            </Card>

                            <Card title="Audience" size="small">
                                {audienceQuery.isLoading ? (
                                    <Spin />
                                ) : audienceQuery.isError ? (
                                    <Text type="secondary">Couldn&apos;t count the audience.</Text>
                                ) : audience ? (
                                    <Space direction="vertical" style={{ width: '100%' }} size={10}>
                                        <div>
                                            <Text style={{ fontSize: 22, fontWeight: 700 }}>
                                                {numberFmt.format(audience.customers)}
                                            </Text>{' '}
                                            <Text type="secondary">
                                                customers · {numberFmt.format(audience.devices)} phones
                                            </Text>
                                        </div>
                                        {shares.length > 0 && (
                                            <div>
                                                <div
                                                    style={{
                                                        display: 'flex',
                                                        height: 8,
                                                        borderRadius: 4,
                                                        overflow: 'hidden',
                                                        marginBottom: 6,
                                                    }}
                                                >
                                                    {shares.map((s) => (
                                                        <div
                                                            key={s.lang}
                                                            style={{ width: `${s.share * 100}%`, background: LANG_COLOR[s.lang] }}
                                                        />
                                                    ))}
                                                </div>
                                                <Space size={12} wrap>
                                                    {shares.map((s) => (
                                                        <Text key={s.lang} style={{ fontSize: 12 }}>
                                                            <span
                                                                style={{
                                                                    display: 'inline-block',
                                                                    width: 8,
                                                                    height: 8,
                                                                    borderRadius: 2,
                                                                    background: LANG_COLOR[s.lang],
                                                                    marginRight: 4,
                                                                }}
                                                            />
                                                            {LANG_LABEL[s.lang]} {formatRate(s.share)}
                                                        </Text>
                                                    ))}
                                                </Space>
                                            </div>
                                        )}
                                        {audience.opted_out > 0 && (
                                            <Text type="secondary" style={{ fontSize: 12 }}>
                                                {numberFmt.format(audience.opted_out)} customer
                                                {audience.opted_out === 1 ? ' has' : 's have'} switched{' '}
                                                {CATEGORY_META[category].label.toLowerCase()}s off and won&apos;t get it.
                                            </Text>
                                        )}
                                        {missing.map((m) => (
                                            <Alert
                                                key={m.lang}
                                                type="info"
                                                showIcon
                                                message={`${numberFmt.format(m.devices)} phone${m.devices === 1 ? ' reads' : 's read'} ${LANG_LABEL[m.lang]} — they'll get the English text unless you add ${LANG_LABEL[m.lang]}.`}
                                                action={
                                                    <Button size="small" type="link" onClick={() => setLang(m.lang)}>
                                                        Add
                                                    </Button>
                                                }
                                            />
                                        ))}
                                        {audience.customers === 0 && (
                                            <Alert
                                                type="warning"
                                                showIcon
                                                message="Nobody to send to yet: no customers in this audience have this type switched on."
                                            />
                                        )}
                                    </Space>
                                ) : null}
                            </Card>
                        </div>
                    </Col>
                </Row>
            )}

            <Card title="Campaigns">
                <Table<Campaign>
                    rowKey="campaign_id"
                    columns={columns}
                    dataSource={campaigns}
                    loading={listQuery.isLoading}
                    pagination={false}
                    scroll={{ x: 960 }}
                    locale={{
                        emptyText: (
                            <Empty
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                                description="No campaigns yet. Your first one will show its delivery and opens here."
                            />
                        ),
                    }}
                />
            </Card>
        </div>
    );
};

export default PushCampaigns;
