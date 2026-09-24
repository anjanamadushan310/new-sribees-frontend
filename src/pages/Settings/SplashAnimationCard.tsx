/**
 * Splash animation (Lottie JSON) for the SRIBEESonline customer app.
 *
 * What the Super Admin publishes here reaches every installed copy without a
 * Play Store release: the app downloads the file in the background on its
 * next launch or resume, and plays it from the launch after that. That delay
 * is on purpose — a splash cannot wait for the network, so the app only ever
 * plays an animation it already has on the phone.
 *
 * The file is checked here first for fast feedback, then again on the server,
 * which is the check that counts.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    ColorPicker,
    Descriptions,
    Empty,
    Popconfirm,
    Space,
    Spin,
    Switch,
    Tag,
    Typography,
    Upload,
    message,
} from 'antd';
import { DeleteOutlined, InboxOutlined, RocketOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import lottie from 'lottie-web/build/player/lottie_light';
import type { AnimationItem } from 'lottie-web';
import { splashAnimationApi, type SplashAnimation } from '../../api/settings.api';

const { Text } = Typography;

// Mirrors the server's limits (app/services/splash_animation.py).
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_DURATION_MS = 10_000;
const DEFAULT_BACKGROUND = '#D2114E';
const QUERY_KEY = ['splash-animation'];

interface LottieDoc {
    fr?: unknown;
    ip?: unknown;
    op?: unknown;
    w?: unknown;
    h?: unknown;
    layers?: unknown;
    assets?: { p?: unknown; e?: unknown }[];
}

interface CheckedFile {
    file: File;
    data: object;
    durationMs: number;
    width: number;
    height: number;
}

/** The same rules the server applies, so most mistakes never leave the browser. */
async function checkLottie(file: File): Promise<CheckedFile> {
    if (file.size > MAX_BYTES) {
        throw new Error(
            `File is ${(file.size / 1024 / 1024).toFixed(1)} MB; the limit is 2 MB.`
        );
    }
    if (file.name.toLowerCase().endsWith('.lottie')) {
        throw new Error('This is a .lottie (zip) file. Export the animation as Lottie JSON (.json).');
    }

    let doc: LottieDoc;
    try {
        doc = JSON.parse(await file.text());
    } catch {
        throw new Error('The file is not valid JSON.');
    }

    const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
        throw new Error('This is not a Lottie animation.');
    }
    const { fr, ip, op, w, h } = doc;
    if (!num(fr) || !num(ip) || !num(op) || !num(w) || !num(h)) {
        throw new Error('This is not a Lottie animation.');
    }
    if (fr <= 0 || op <= ip || w <= 0 || h <= 0) {
        throw new Error('This Lottie has no playable frames.');
    }
    if (!Array.isArray(doc.layers) || doc.layers.length === 0) {
        throw new Error('This Lottie has no layers, so nothing would be shown.');
    }

    const durationMs = Math.round(((op - ip) / fr) * 1000);
    if (durationMs > MAX_DURATION_MS) {
        throw new Error(`The animation runs ${(durationMs / 1000).toFixed(1)}s; a splash may run at most 10s.`);
    }

    for (const asset of Array.isArray(doc.assets) ? doc.assets : []) {
        const p = typeof asset?.p === 'string' ? asset.p : '';
        if (p && asset.e !== 1 && !p.startsWith('data:')) {
            throw new Error(
                `The animation refers to an external image ('${p}'). Export it with images embedded.`
            );
        }
    }

    return { file, data: doc, durationMs, width: w, height: h };
}

function serverMessage(err: unknown, fallback: string): string {
    const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    const nested = (detail as { error?: { message?: unknown } } | undefined)?.error?.message;
    return typeof nested === 'string' ? nested : fallback;
}

// ---------------------------------------------------------------------------
// Phone-shaped preview: the animation fills the screen the way the app draws
// it (scaled to fit, centred, over the backdrop colour).
// ---------------------------------------------------------------------------

const PhonePreview: React.FC<{ data: object | null; background: string; loading?: boolean }> = ({
    data,
    background,
    loading,
}) => {
    const box = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!box.current || !data) return;
        let anim: AnimationItem | undefined;
        try {
            anim = lottie.loadAnimation({
                container: box.current,
                renderer: 'svg',
                loop: true,
                autoplay: true,
                // lottie-web mutates what it is given; the caller's copy stays clean.
                animationData: structuredClone(data),
            });
        } catch {
            // A file lottie-web cannot draw still shows the backdrop; the
            // server and the app each have their own check.
        }
        return () => anim?.destroy();
        // `loading` too: the container only exists once the spinner is gone.
    }, [data, loading]);

    return (
        <div
            style={{
                width: 180,
                height: 380,
                borderRadius: 28,
                border: '6px solid #1a1a22',
                background,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
            }}
        >
            {loading ? <Spin /> : <div ref={box} style={{ width: '100%', height: '100%' }} />}
        </div>
    );
};

// ---------------------------------------------------------------------------

const SplashAnimationCard: React.FC = () => {
    const queryClient = useQueryClient();
    const [picked, setPicked] = useState<CheckedFile | null>(null);
    // Null until the admin picks a colour; until then the live one is shown.
    const [colorDraft, setColorDraft] = useState<string | null>(null);

    const { data: current, isLoading } = useQuery({
        queryKey: QUERY_KEY,
        queryFn: splashAnimationApi.get,
    });

    // The live file, fetched for the preview.
    const { data: currentJson, isFetching: loadingJson } = useQuery({
        queryKey: ['splash-animation-file', current?.sha256],
        queryFn: async () => (await fetch(current!.animation_url)).json(),
        enabled: !!current?.animation_url,
        staleTime: Infinity,
    });

    const color = colorDraft ?? current?.background_color ?? DEFAULT_BACKGROUND;

    const settle = (data: SplashAnimation | null) => queryClient.setQueryData(QUERY_KEY, data);

    const uploadMutation = useMutation({
        mutationFn: () => splashAnimationApi.upload(picked!.file, color),
        onSuccess: (data) => {
            settle(data);
            setPicked(null);
            setColorDraft(null);
            message.success('Published. Phones download it on their next open and show it from the one after.');
        },
        onError: (err) => message.error(serverMessage(err, 'Could not publish the animation.')),
    });

    const updateMutation = useMutation({
        mutationFn: splashAnimationApi.update,
        onSuccess: (data) => {
            settle(data);
            setColorDraft(null);
            message.success('Saved.');
        },
        onError: (err) => message.error(serverMessage(err, 'Could not save the change.')),
    });

    const removeMutation = useMutation({
        mutationFn: splashAnimationApi.remove,
        onSuccess: () => {
            settle(null);
            setColorDraft(null);
            message.success('Removed. The app goes back to its built-in splash.');
        },
        onError: (err) => message.error(serverMessage(err, 'Could not remove the animation.')),
    });

    const beforeUpload = async (file: File) => {
        try {
            setPicked(await checkLottie(file));
        } catch (e) {
            message.error(e instanceof Error ? e.message : 'Could not read the file.');
        }
        return Upload.LIST_IGNORE; // published explicitly with the button
    };

    const previewData = picked?.data ?? currentJson ?? null;
    const colorChanged = !!current && !picked && colorDraft !== null && colorDraft !== current.background_color;

    const status = useMemo(() => {
        if (!current) return <Tag>Built-in splash</Tag>;
        return current.is_active ? <Tag color="success">Live in the app</Tag> : <Tag>Switched off</Tag>;
    }, [current]);

    return (
        <Card
            title={<Space><RocketOutlined />Splash animation</Space>}
            extra={status}
            style={{ marginBottom: 24 }}
        >
            <Alert
                type="info"
                showIcon
                style={{ marginBottom: 20 }}
                message="How customers get it"
                description={
                    <>
                        Upload a <b>Lottie animation exported as JSON</b> (max 2 MB, up to 10 seconds,
                        images embedded). Installed apps download it in the background the next time
                        they open, and show it from the open after that. No app update is needed.
                    </>
                }
            />

            {isLoading ? (
                <Spin />
            ) : (
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                    <Space direction="vertical" align="center">
                        {previewData ? (
                            <PhonePreview
                                data={previewData}
                                background={color}
                                loading={!picked && loadingJson}
                            />
                        ) : (
                            <div style={{ width: 180, height: 380, display: 'flex', alignItems: 'center' }}>
                                <Empty description="No animation yet" />
                            </div>
                        )}
                        <Text type="secondary">{picked ? 'Preview (not published)' : 'What customers see'}</Text>
                    </Space>

                    <div style={{ flex: 1, minWidth: 260 }}>
                        {current && !picked && (
                            <Descriptions column={1} size="small" style={{ marginBottom: 16 }}>
                                <Descriptions.Item label="File">{current.filename || '—'}</Descriptions.Item>
                                <Descriptions.Item label="Length">
                                    {(current.duration_ms / 1000).toFixed(1)}s
                                </Descriptions.Item>
                                <Descriptions.Item label="Size">
                                    {(current.bytes / 1024).toFixed(0)} KB · {current.width}×{current.height}
                                </Descriptions.Item>
                                <Descriptions.Item label="Published">
                                    {new Date(current.uploaded_at).toLocaleString('en-GB', {
                                        timeZone: 'Asia/Colombo',
                                    })}
                                </Descriptions.Item>
                                <Descriptions.Item label="Show in app">
                                    <Switch
                                        checked={current.is_active}
                                        loading={updateMutation.isPending}
                                        onChange={(on) => updateMutation.mutate({ is_active: on })}
                                    />
                                </Descriptions.Item>
                            </Descriptions>
                        )}

                        {picked && (
                            <Alert
                                type="success"
                                showIcon
                                style={{ marginBottom: 16 }}
                                message={picked.file.name}
                                description={`${(picked.durationMs / 1000).toFixed(1)}s · ${(
                                    picked.file.size / 1024
                                ).toFixed(0)} KB · ${picked.width}×${picked.height}`}
                                closable
                                onClose={() => setPicked(null)}
                            />
                        )}

                        <Space direction="vertical" size={16} style={{ width: '100%' }}>
                            <Upload.Dragger accept=".json,application/json" beforeUpload={beforeUpload} showUploadList={false}>
                                <p className="ant-upload-drag-icon"><InboxOutlined /></p>
                                <p className="ant-upload-text">
                                    {current ? 'Drop a new Lottie JSON to replace it' : 'Drop a Lottie JSON here'}
                                </p>
                                <p className="ant-upload-hint">or click to choose a file</p>
                            </Upload.Dragger>

                            <Space align="center">
                                <Text>Backdrop colour</Text>
                                <ColorPicker
                                    value={color}
                                    disabledAlpha
                                    showText
                                    onChangeComplete={(c) => setColorDraft(c.toHexString().toUpperCase())}
                                />
                                {colorChanged && (
                                    <Button
                                        size="small"
                                        loading={updateMutation.isPending}
                                        onClick={() => updateMutation.mutate({ background_color: color })}
                                    >
                                        Save colour
                                    </Button>
                                )}
                            </Space>

                            <Space wrap>
                                <Button
                                    type="primary"
                                    icon={<RocketOutlined />}
                                    disabled={!picked}
                                    loading={uploadMutation.isPending}
                                    onClick={() => uploadMutation.mutate()}
                                >
                                    Publish to app
                                </Button>
                                {current && (
                                    <Popconfirm
                                        title="Remove the splash animation?"
                                        description="The app goes back to its built-in splash."
                                        okText="Remove"
                                        okButtonProps={{ danger: true }}
                                        onConfirm={() => removeMutation.mutate()}
                                    >
                                        <Button danger icon={<DeleteOutlined />} loading={removeMutation.isPending}>
                                            Remove
                                        </Button>
                                    </Popconfirm>
                                )}
                            </Space>
                        </Space>
                    </div>
                </div>
            )}
        </Card>
    );
};

export default SplashAnimationCard;
