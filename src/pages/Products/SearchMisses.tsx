/**
 * Missed searches.
 *
 * Every search in the customer app that came back empty, busiest first.
 * Each one is a shopper telling us a word the catalogue doesn't know:
 * "kottu mee", "rasa kavili", "pan piti". Attaching it to the right product
 * adds that word to the product's search keywords, so the next shopper who
 * types it finds the product.
 *
 * Spellings are already grouped ("Seeni", "seeni" and "සීනි" are one row) and
 * typing noise is filtered on the server, so every row here is a real
 * shopper who stopped typing and found nothing.
 *
 * Nothing on this screen calls the AI. The shopper supplied the word; a person
 * decides which product it means. That is the part a model gets wrong, and it
 * costs nothing.
 */
import React, { useMemo, useState } from 'react';
import {
    Alert,
    Button,
    Card,
    Empty,
    Modal,
    Segmented,
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography,
    message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { searchMissesApi, type SearchMiss, type SearchMissStatus } from '../../api/searchMisses.api';
import { productsApi } from '../../api/products.api';
import { usePermissions } from '../../hooks/usePermissions';

const { Text, Title, Paragraph } = Typography;

/** Sri Lanka time, like every other timestamp in this console. */
const whenLocal = (iso: string | null) =>
    iso
        ? new Date(iso).toLocaleString('en-LK', {
              timeZone: 'Asia/Colombo',
              dateStyle: 'medium',
              timeStyle: 'short',
          })
        : '—';

const STATUS_LABELS: Record<SearchMissStatus, string> = {
    open: 'To review',
    resolved: 'Attached',
    ignored: 'Ignored',
};

/** Product picker for the attach dialog: the catalogue's own guesses first, then search. */
const ProductPicker: React.FC<{
    miss: SearchMiss;
    value: string | undefined;
    onChange: (id: string) => void;
}> = ({ miss, value, onChange }) => {
    const [term, setTerm] = useState('');
    const found = useQuery({
        queryKey: ['search-miss-product-picker', term],
        queryFn: () => productsApi.list({ search: term, limit: 20 }),
        enabled: term.trim().length >= 2,
        staleTime: 30_000,
    });

    const options = useMemo(() => {
        const seen = new Set<string>();
        const out: { value: string; label: string }[] = [];
        const add = (id: string, name: string) => {
            if (!seen.has(id)) {
                seen.add(id);
                out.push({ value: id, label: name });
            }
        };
        miss.catalog_matches.forEach((m) => add(m.product_id, m.name));
        (found.data?.products ?? []).forEach((p) => add(p.product_id, p.name));
        return out;
    }, [miss, found.data]);

    return (
        <Select
            showSearch
            style={{ width: '100%' }}
            placeholder="Search products by name or SKU"
            value={value}
            onChange={onChange}
            onSearch={setTerm}
            filterOption={false}
            loading={found.isFetching}
            options={options}
            notFoundContent={
                term.trim().length < 2 ? 'Type at least 2 letters' : 'No products match'
            }
        />
    );
};

const SearchMisses: React.FC = () => {
    const queryClient = useQueryClient();
    const { canUpdate } = usePermissions();
    const canEdit = canUpdate('products');

    const [status, setStatus] = useState<SearchMissStatus>('open');
    const [attaching, setAttaching] = useState<SearchMiss | null>(null);
    const [productId, setProductId] = useState<string | undefined>();

    const misses = useQuery({
        queryKey: ['search-misses', status],
        queryFn: () => searchMissesApi.list(status),
    });

    const refresh = () => queryClient.invalidateQueries({ queryKey: ['search-misses'] });
    const errorText = (err: unknown, fallback: string) =>
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || fallback;

    const attach = useMutation({
        mutationFn: () => searchMissesApi.attach(attaching!.query_key, productId!),
        onSuccess: () => {
            message.success(`Shoppers searching "${attaching!.sample_query}" will now find it.`);
            setAttaching(null);
            setProductId(undefined);
            refresh();
        },
        onError: (err) => message.error(errorText(err, 'Could not attach the search.')),
    });

    const changeStatus = useMutation({
        mutationFn: (v: { miss: SearchMiss; status: 'open' | 'ignored' }) =>
            searchMissesApi.setStatus(v.miss.query_key, v.status),
        onSuccess: (_, v) => {
            message.success(v.status === 'ignored' ? 'Ignored.' : 'Moved back to review.');
            refresh();
        },
        onError: (err) => message.error(errorText(err, 'Could not update the search.')),
    });

    const openAttach = (miss: SearchMiss) => {
        setAttaching(miss);
        // One obvious candidate: preselect it, the admin still confirms.
        setProductId(miss.catalog_matches.length === 1 ? miss.catalog_matches[0].product_id : undefined);
    };

    const columns: ColumnsType<SearchMiss> = [
        {
            title: 'Shoppers searched for',
            dataIndex: 'sample_query',
            render: (v: string) => <Text strong>{v}</Text>,
        },
        {
            title: 'Shoppers',
            dataIndex: 'shoppers',
            width: 100,
            align: 'right',
            render: (v: number) => <Text strong={v > 1}>{v}</Text>,
        },
        {
            title: 'Last searched',
            dataIndex: 'last_seen',
            width: 180,
            render: (v: string | null) => <Text type="secondary">{whenLocal(v)}</Text>,
        },
    ];

    if (status === 'open') {
        columns.push({
            title: 'In the catalogue?',
            width: 280,
            render: (_, row) =>
                row.catalog_matches.length ? (
                    <Tooltip title="These match the search across the whole catalogue. The shopper saw nothing, so they were probably out of stock at the shopper's branch — check stock before adding keywords.">
                        <Space size={[0, 4]} wrap>
                            {row.catalog_matches.map((m) => (
                                <Tag color="gold" key={m.product_id}>
                                    {m.name}
                                </Tag>
                            ))}
                        </Space>
                    </Tooltip>
                ) : (
                    <Text type="secondary">No product matches</Text>
                ),
        });
    }

    if (status === 'resolved') {
        columns.push({
            title: 'Attached to',
            width: 300,
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Text>{row.resolved_product_name || '(product deleted)'}</Text>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                        {whenLocal(row.resolved_at)}
                    </Text>
                    {row.missed_since_resolved && (
                        <Tooltip title="Shoppers searched this again after it was attached and still found nothing. The product is probably out of stock where they are, or the word went on the wrong product.">
                            <Tag color="red" style={{ marginTop: 4 }}>
                                Still missing
                            </Tag>
                        </Tooltip>
                    )}
                </Space>
            ),
        });
    }

    if (canEdit) {
        columns.push({
            title: '',
            width: status === 'open' ? 220 : 120,
            align: 'right',
            render: (_, row) =>
                status === 'open' ? (
                    <Space>
                        <Button type="primary" size="small" onClick={() => openAttach(row)}>
                            Attach to product
                        </Button>
                        <Button
                            size="small"
                            onClick={() => changeStatus.mutate({ miss: row, status: 'ignored' })}
                        >
                            Ignore
                        </Button>
                    </Space>
                ) : (
                    <Button
                        size="small"
                        onClick={() => changeStatus.mutate({ miss: row, status: 'open' })}
                    >
                        {status === 'ignored' ? 'Restore' : 'Reopen'}
                    </Button>
                ),
        });
    }

    return (
        <div>
            <Title level={3} style={{ marginBottom: 4 }}>
                Missed searches
            </Title>
            <Paragraph type="secondary" style={{ marginBottom: 16 }}>
                Searches in the customer app that found nothing, most-searched first. Attach one
                to the product the shopper meant, and the next person who types it will find that
                product. Spellings and scripts are already grouped, so <Text code>seeni</Text> and{' '}
                <Text code>සීනි</Text> are one row.
            </Paragraph>

            <Card size="small">

                <Segmented<SearchMissStatus>
                    style={{ marginBottom: 16 }}
                    value={status}
                    onChange={setStatus}
                    options={(Object.keys(STATUS_LABELS) as SearchMissStatus[]).map((s) => ({
                        value: s,
                        label: STATUS_LABELS[s],
                    }))}
                />

                {misses.isError && (
                    <Alert
                        type="error"
                        showIcon
                        style={{ marginBottom: 16 }}
                        message="Could not load missed searches."
                    />
                )}

                <Table
                    rowKey="query_key"
                    size="middle"
                    loading={misses.isLoading}
                    dataSource={misses.data ?? []}
                    columns={columns}
                    pagination={{ pageSize: 25, hideOnSinglePage: true }}
                    scroll={{ x: 800 }}
                    locale={{
                        emptyText: (
                            <Empty
                                description={
                                    status === 'open'
                                        ? 'Nothing to review. Every search is finding something.'
                                        : 'Nothing here yet.'
                                }
                            />
                        ),
                    }}
                />
            </Card>

            <Modal
                open={!!attaching}
                title="Attach search to a product"
                okText="Attach"
                okButtonProps={{ disabled: !productId, loading: attach.isPending }}
                onOk={() => attach.mutate()}
                onCancel={() => {
                    setAttaching(null);
                    setProductId(undefined);
                }}
                destroyOnClose
            >
                {attaching && (
                    <Space direction="vertical" style={{ width: '100%' }} size="middle">
                        <Text>
                            <Text strong>"{attaching.sample_query}"</Text> will be added to the
                            product's search keywords. Customers will not see it.
                        </Text>
                        <ProductPicker miss={attaching} value={productId} onChange={setProductId} />
                    </Space>
                )}
            </Modal>
        </div>
    );
};

export default SearchMisses;
