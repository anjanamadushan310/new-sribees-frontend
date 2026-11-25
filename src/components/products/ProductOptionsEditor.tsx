/**
 * Shades / colours of a product: the Super Admin names them, gives each its own
 * photo (a transparent PNG becomes the standard white square on the server) and,
 * only when it differs, its own price. Saved on its own button, because the
 * options live in their own table and keep their ids (carts, stock, past orders).
 */
import React, { useMemo, useState } from 'react';
import {
    Alert,
    App,
    AutoComplete,
    Button,
    Image,
    InputNumber,
    Input,
    Space,
    Switch,
    Table,
    Tooltip,
    Typography,
    Upload,
} from 'antd';
import {
    ArrowDownOutlined,
    ArrowUpOutlined,
    CloseCircleOutlined,
    PlusOutlined,
    UploadOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { productOptionsApi, OPTION_LABELS } from '../../api/productOptions.api';
import type { ProductOptions } from '../../api/productOptions.api';
import { productsApi } from '../../api/products.api';
import { newKey, problem, toPayload } from './productOptionRows';
import type { OptionRow } from './productOptionRows';

const { Text } = Typography;

interface Props {
    productId: string;
    /** The product's own price, shown where an option follows it. */
    productPrice?: number;
    disabled?: boolean;
}

const ProductOptionsEditor: React.FC<Props> = (props) => {
    const query = useQuery({
        queryKey: ['product-options', props.productId],
        queryFn: () => productOptionsApi.get(props.productId),
    });
    if (query.isLoading || !query.data) return <Text type="secondary">Loading options…</Text>;
    // Keyed by what the server holds: a save remounts the form on the saved list.
    return <OptionsForm key={JSON.stringify(query.data)} {...props} saved={query.data} />;
};

const OptionsForm: React.FC<Props & { saved: ProductOptions }> = ({ productId, productPrice, disabled, saved }) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [label, setLabel] = useState(saved.option_label ?? '');
    const [rows, setRows] = useState<OptionRow[]>(() =>
        saved.options.filter((o) => o.is_active || saved.option_label).map((o) => ({ ...o, key: o.variant_id })),
    );
    const [uploading, setUploading] = useState<string | null>(null);

    const issue = useMemo(() => problem(label, rows), [label, rows]);
    const wasPlain = !saved.option_label;

    const save = useMutation({
        mutationFn: () => productOptionsApi.replace(productId, label.trim() || null, toPayload(rows)),
        onSuccess: (data) => {
            message.success(data.option_label ? `${data.option_label}s saved` : 'Options removed');
            queryClient.setQueryData(['product-options', productId], data);
            queryClient.invalidateQueries({ queryKey: ['admin', 'inventory'] });
        },
        onError: (e: unknown) => {
            const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
            message.error(typeof detail === 'string' ? detail : 'Could not save the options');
        },
    });

    const edit = (key: string, patch: Partial<OptionRow>) =>
        setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    const move = (index: number, by: number) =>
        setRows((rs) => {
            const next = [...rs];
            const [row] = next.splice(index, 1);
            next.splice(index + by, 0, row);
            return next;
        });
    const remove = (key: string) =>
        // A saved option is retired (kept for past orders); a new one just goes.
        setRows((rs) =>
            rs.flatMap((r) => (r.key !== key ? [r] : r.variant_id ? [{ ...r, is_active: false }] : [])),
        );

    const upload = async (key: string, file: File) => {
        setUploading(key);
        try {
            edit(key, { image_url: await productsApi.uploadImage(file) });
        } catch {
            message.error('Could not upload the photo');
        } finally {
            setUploading(null);
        }
        return false;
    };

    return (
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <Space wrap align="center">
                <Text strong>Customers choose a</Text>
                <AutoComplete
                    style={{ width: 160 }}
                    value={label}
                    onChange={(v) => setLabel(v)}
                    options={OPTION_LABELS.map((v) => ({ value: v }))}
                    placeholder="Shade / Colour"
                    allowClear
                    disabled={disabled}
                />
                <Text type="secondary">Leave empty for a plain product.</Text>
            </Space>
            {label.trim() && wasPlain && (
                <Alert
                    type="info"
                    showIcon
                    message="Saving turns this into a product with options: every branch's stock of it goes to 0 and is counted per option under Inventory."
                />
            )}
            {!label.trim() && !wasPlain && (
                <Alert
                    type="warning"
                    showIcon
                    message="Saving with no label retires every option and counts the product in units again (stock goes to 0)."
                />
            )}
            <Table<OptionRow>
                rowKey="key"
                size="small"
                pagination={false}
                dataSource={rows}
                rowClassName={(r) => (r.is_active ? '' : 'pf-row-retired')}
                columns={[
                    {
                        title: 'Photo',
                        key: 'photo',
                        width: 120,
                        render: (_, r) => (
                            <Space>
                                {r.image_url ? (
                                    <Image src={r.image_url} width={44} height={44} style={{ objectFit: 'contain' }} />
                                ) : (
                                    <Tooltip title="No photo: the product's photo is shown">
                                        <Text type="secondary">—</Text>
                                    </Tooltip>
                                )}
                                <Upload
                                    accept="image/png,image/webp,image/jpeg"
                                    showUploadList={false}
                                    beforeUpload={(file) => upload(r.key, file)}
                                    disabled={disabled}
                                >
                                    <Button size="small" icon={<UploadOutlined />} loading={uploading === r.key} />
                                </Upload>
                                {r.image_url && (
                                    <Button
                                        size="small"
                                        type="text"
                                        aria-label="Remove photo"
                                        icon={<CloseCircleOutlined />}
                                        onClick={() => edit(r.key, { image_url: null })}
                                        disabled={disabled}
                                    />
                                )}
                            </Space>
                        ),
                    },
                    {
                        title: 'Name',
                        key: 'name',
                        render: (_, r) => (
                            <Input
                                value={r.name}
                                maxLength={50}
                                placeholder="Shade 07"
                                onChange={(e) => edit(r.key, { name: e.target.value })}
                                disabled={disabled}
                            />
                        ),
                    },
                    {
                        title: 'Own price (LKR)',
                        key: 'price',
                        width: 150,
                        render: (_, r) => (
                            <InputNumber
                                min={0.01}
                                precision={2}
                                style={{ width: '100%' }}
                                value={r.price ?? null}
                                placeholder={productPrice ? `${productPrice}` : 'Product price'}
                                onChange={(v) => edit(r.key, { price: v ?? null })}
                                disabled={disabled}
                            />
                        ),
                    },
                    {
                        title: 'On sale',
                        key: 'active',
                        width: 80,
                        render: (_, r) => (
                            <Switch
                                size="small"
                                checked={r.is_active}
                                onChange={(v) => edit(r.key, { is_active: v })}
                                disabled={disabled}
                            />
                        ),
                    },
                    {
                        title: '',
                        key: 'order',
                        width: 110,
                        render: (_, r, i) => (
                            <Space size={0}>
                                <Button size="small" type="text" aria-label="Up" icon={<ArrowUpOutlined />}
                                    disabled={disabled || i === 0} onClick={() => move(i, -1)} />
                                <Button size="small" type="text" aria-label="Down" icon={<ArrowDownOutlined />}
                                    disabled={disabled || i === rows.length - 1} onClick={() => move(i, 1)} />
                                <Button size="small" type="text" danger aria-label="Remove"
                                    icon={<CloseCircleOutlined />} disabled={disabled}
                                    onClick={() => remove(r.key)} />
                            </Space>
                        ),
                    },
                ]}
            />
            <Space>
                <Button
                    icon={<PlusOutlined />}
                    disabled={disabled}
                    onClick={() => setRows((rs) => [...rs, { key: newKey(), name: '', is_active: true }])}
                >
                    Add {label.trim() ? label.trim().toLowerCase() : 'option'}
                </Button>
                <Button
                    type="primary"
                    disabled={disabled || !!issue}
                    loading={save.isPending}
                    onClick={() => save.mutate()}
                >
                    Save options
                </Button>
                {issue && <Text type="danger">{issue}</Text>}
            </Space>
            <Text type="secondary">
                Empty price = the product's price (with its Quick Sale discount). A retired option stays on past
                orders but cannot be bought.
            </Text>
        </Space>
    );
};

export default ProductOptionsEditor;
