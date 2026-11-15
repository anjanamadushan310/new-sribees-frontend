import { useState } from 'react';
import { App, Button, Modal, Select, Space, Tag, Typography } from 'antd';
import { ArrowDownOutlined, ArrowUpOutlined, HolderOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { categoriesApi, type Category } from '../../api/categories.api';

interface Props {
    categories: Category[];
    onClose: () => void;
}

export default function CategoryOrderModal({ categories, onClose }: Props) {
    const { message } = App.useApp();
    const cache = useQueryClient();
    const [parentId, setParentId] = useState<string | null>(null);
    // Preserve the fetched baseline while editing, even if the query refetches.
    const [siblings, setSiblings] = useState(() => categories.filter(category => !category.parent_category_id));
    const [draft, setDraft] = useState<string[] | null>(null);
    const [draggedId, setDraggedId] = useState<string | null>(null);
    const orderedIds = draft ?? siblings.map(category => category.category_id);
    const changed = orderedIds.some((id, index) => id !== siblings[index]?.category_id);
    const save = useMutation({
        mutationFn: () => categoriesApi.reorder({
            parent_category_id: parentId,
            category_ids: orderedIds,
            expected_category_ids: siblings.map(category => category.category_id),
        }),
        onSuccess: () => {
            cache.invalidateQueries({ queryKey: ['admin', 'categories'] });
            message.success('Category order saved. The app will use this order when categories refresh.');
            onClose();
        },
        onError: (error: { response?: { status?: number; data?: { detail?: string } } }) => {
            message.error(error.response?.data?.detail ?? 'Could not save the order. Please try again.');
            if (error.response?.status === 409) {
                cache.invalidateQueries({ queryKey: ['admin', 'categories'] });
                onClose();
            }
        },
    });

    const move = (fromId: string, toId: string) => {
        if (save.isPending || fromId === toId) return;
        const next = [...orderedIds];
        const from = next.indexOf(fromId);
        const to = next.indexOf(toId);
        if (from < 0 || to < 0) return;
        next.splice(to, 0, next.splice(from, 1)[0]);
        setDraft(next);
    };

    const changeGroup = (value: string) => {
        const change = () => {
            const nextParent = value === 'main' ? null : value;
            setParentId(nextParent);
            setSiblings(categories.filter(category => (category.parent_category_id ?? null) === nextParent));
            setDraft(null);
            setDraggedId(null);
        };
        if (changed) {
            Modal.confirm({
                title: 'Discard this unsaved order?',
                okText: 'Discard and switch',
                onOk: change,
            });
        } else change();
    };

    return <Modal open title="Arrange categories" okText="Save order" onOk={() => save.mutate()}
        onCancel={onClose} confirmLoading={save.isPending} okButtonProps={{ disabled: !changed }}
        cancelButtonProps={{ disabled: save.isPending }} closable={!save.isPending}
        maskClosable={!changed && !save.isPending} keyboard={!save.isPending}>
        <Typography.Paragraph type="secondary">
            Drag a row or use its arrows to change the app’s display order across all branches.
        </Typography.Paragraph>
        <Select aria-label="Category group" value={parentId ?? 'main'} onChange={changeGroup}
            disabled={save.isPending} style={{ width: '100%', marginBottom: 16 }}
            options={[
                { value: 'main', label: 'Main categories' },
                ...categories.filter(category => !category.parent_category_id)
                    .map(category => ({ value: category.category_id, label: `${category.name} — subcategories` })),
            ]} />
        <ol aria-label="Category display order" style={{ listStyle: 'none', padding: 0, margin: 0, maxHeight: '50vh', overflowY: 'auto' }}>
            {orderedIds.map((id, index) => {
                const category = siblings.find(item => item.category_id === id);
                if (!category) return null;
                return <li key={id} draggable={!save.isPending}
                    onDragStart={event => { setDraggedId(id); event.dataTransfer.setData('text/plain', id); event.dataTransfer.effectAllowed = 'move'; }}
                    onDragEnd={() => setDraggedId(null)}
                    onDragOver={event => { if (draggedId) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }}
                    onDrop={event => { event.preventDefault(); if (draggedId) move(draggedId, id); setDraggedId(null); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 8px', borderBottom: '1px solid #f0f0f0', opacity: draggedId === id ? 0.5 : 1, cursor: save.isPending ? 'default' : 'grab' }}>
                    <HolderOutlined aria-hidden />
                    <Typography.Text type="secondary">{index + 1}</Typography.Text>
                    <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{category.name}</span>
                    {!category.is_active && <Tag>Inactive</Tag>}
                    <Space size={4}>
                        <Button aria-label={`Move ${category.name} up`} icon={<ArrowUpOutlined />}
                            disabled={save.isPending || index === 0} onClick={() => move(id, orderedIds[index - 1])} />
                        <Button aria-label={`Move ${category.name} down`} icon={<ArrowDownOutlined />}
                            disabled={save.isPending || index === orderedIds.length - 1} onClick={() => move(id, orderedIds[index + 1])} />
                    </Space>
                </li>;
            })}
        </ol>
        {siblings.length === 0 && <Typography.Paragraph>No subcategories in this category.</Typography.Paragraph>}
    </Modal>;
}
