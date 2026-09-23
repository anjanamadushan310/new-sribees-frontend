import React, { useState, useEffect } from 'react';
import {
    Modal,
    Select,
    Input,
    Checkbox,
    Button,
    Typography,
    Upload,
    App,
    Card,
} from 'antd';
import {
    PaperClipOutlined,
    PlusOutlined,
    MinusOutlined,
    InfoCircleFilled,
} from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '../../api/orders.api';
import type {
    EscalationCategory,
    EscalationPriority,
    EscalationAffectedItem,
    OrderDetail,
    OrderItem,
} from '../../api/orders.api';
import { apiErrorMessage } from '../../utils/analytics';

const { Text } = Typography;

export const ESCALATION_CATEGORIES: { value: EscalationCategory; label: string }[] = [
    { value: 'return_replacement', label: 'Return / Replacement Request' },
    { value: 'refund_request', label: 'Refund Request / Inquiry' },
    { value: 'cancel_request', label: 'Urgent Cancellation' },
    { value: 'address_correction', label: 'Address Correction / Contact Update' },
    { value: 'hold_shipment', label: 'Hold Shipment' },
    { value: 'delivery_exception', label: 'Delivery Exception' },
    { value: 'customer_complaint', label: 'Customer Complaint' },
    { value: 'other', label: 'Other' },
];

export const escCategoryLabel = (c: string) =>
    ESCALATION_CATEGORIES.find((x) => x.value === c)?.label ?? c;

interface RaiseEscalationModalProps {
    open: boolean;
    onClose: () => void;
    order: OrderDetail;
    onSuccess?: () => void;
}

interface ImageFileItem {
    uid: string;
    name: string;
    url: string;
}

export const RaiseEscalationModal: React.FC<RaiseEscalationModalProps> = ({
    open,
    onClose,
    order,
    onSuccess,
}) => {
    const { message } = App.useApp();
    const queryClient = useQueryClient();

    // Form fields
    const [category, setCategory] = useState<EscalationCategory | undefined>(undefined);
    const [priority, setPriority] = useState<EscalationPriority>('medium');
    const [description, setDescription] = useState<string>('');

    // Affected items state: item_id -> { selected: boolean, quantity: number }
    const [selectedItems, setSelectedItems] = useState<
        Record<string, { selected: boolean; quantity: number }>
    >({});

    // Images evidence
    const [imageList, setImageList] = useState<ImageFileItem[]>([]);

    // Reset form when modal opens
    useEffect(() => {
        if (open) {
            setCategory(undefined);
            setPriority('medium');
            setDescription('');
            setImageList([]);

            const initItems: Record<string, { selected: boolean; quantity: number }> = {};
            if (order?.items) {
                order.items.forEach((item) => {
                    initItems[item.order_item_id] = {
                        selected: false,
                        quantity: 1,
                    };
                });
            }
            setSelectedItems(initItems);
        }
    }, [open, order]);

    const handleCheckboxChange = (itemId: string, checked: boolean, defaultMaxQty: number) => {
        setSelectedItems((prev) => ({
            ...prev,
            [itemId]: {
                selected: checked,
                quantity: checked ? Math.min(prev[itemId]?.quantity || 1, defaultMaxQty) : 1,
            },
        }));
    };

    const handleQuantityChange = (itemId: string, delta: number, maxQty: number) => {
        setSelectedItems((prev) => {
            const current = prev[itemId] || { selected: false, quantity: 1 };
            const nextQty = Math.max(1, Math.min(maxQty, current.quantity + delta));
            return {
                ...prev,
                [itemId]: {
                    ...current,
                    quantity: nextQty,
                },
            };
        });
    };

    const handleBeforeUpload = (file: File) => {
        const isValidType = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'].includes(file.type);
        if (!isValidType) {
            message.error(`${file.name} is not a valid image format (PNG, JPG, WebP only).`);
            return Upload.LIST_IGNORE;
        }

        const isLt5M = file.size / 1024 / 1024 < 5;
        if (!isLt5M) {
            message.error(`Image must be smaller than 5MB.`);
            return Upload.LIST_IGNORE;
        }

        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const previewUrl = reader.result as string;
            setImageList((prev) => [
                ...prev,
                {
                    uid: file.name + '-' + Date.now(),
                    name: file.name,
                    url: previewUrl,
                },
            ]);
        };
        return false;
    };

    const handleRemoveImage = (uid: string) => {
        setImageList((prev) => prev.filter((img) => img.uid !== uid));
    };

    const raiseMutation = useMutation({
        mutationFn: async () => {
            if (!category || description.trim().length < 5) {
                throw new Error('Category and Description (at least 5 characters) are required.');
            }

            const affectedItemsList: EscalationAffectedItem[] = [];
            if (category === 'return_replacement' && order?.items) {
                order.items.forEach((item) => {
                    const sel = selectedItems[item.order_item_id];
                    if (sel && sel.selected && sel.quantity > 0) {
                        affectedItemsList.push({
                            order_item_id: item.order_item_id,
                            product_name: item.product_name,
                            quantity: sel.quantity,
                        });
                    }
                });
            }

            const payload = {
                category,
                priority,
                message: description.trim(),
                affected_items: affectedItemsList.length > 0 ? affectedItemsList : undefined,
                images: imageList.map((img) => img.url),
            };

            return ordersApi.raiseEscalation(order.order_id, payload);
        },
        onSuccess: () => {
            message.success('Internal escalation ticket raised successfully.');
            queryClient.invalidateQueries({ queryKey: ['admin', 'order', order?.order_id] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
            if (onSuccess) onSuccess();
            onClose();
        },
        onError: (err: any) => {
            message.error(apiErrorMessage(err) || 'Failed to raise escalation.');
        },
    });

    const isCategoryValid = Boolean(category);
    const isDescriptionValid = description.trim().length >= 5;
    const isSubmitDisabled = !isCategoryValid || !isDescriptionValid || raiseMutation.isPending;

    const showAffectedItems = category === 'return_replacement';

    return (
        <Modal
            title={
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>🚩</span>
                    <span style={{ fontWeight: 700, fontSize: 16, color: '#141414' }}>
                        Raise Internal Escalation
                    </span>
                </div>
            }
            open={open}
            onCancel={onClose}
            width={540}
            destroyOnClose
            style={{ borderRadius: 12, overflow: 'hidden' }}
            styles={{ body: { padding: '16px 24px 20px' } }}
            footer={[
                <Button
                    key="cancel"
                    onClick={onClose}
                    style={{
                        borderRadius: 8,
                        fontWeight: 600,
                        height: 38,
                        padding: '0 20px',
                        borderColor: '#d9d9d9',
                    }}
                >
                    Cancel
                </Button>,
                <Button
                    key="submit"
                    type="primary"
                    disabled={isSubmitDisabled}
                    loading={raiseMutation.isPending}
                    onClick={() => raiseMutation.mutate()}
                    style={{
                        borderRadius: 8,
                        fontWeight: 600,
                        height: 38,
                        padding: '0 20px',
                        backgroundColor: isSubmitDisabled ? '#b4c7e7' : '#2f54eb',
                        borderColor: isSubmitDisabled ? '#b4c7e7' : '#2f54eb',
                        boxShadow: 'none',
                    }}
                >
                    Raise Escalation
                </Button>,
            ]}
        >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Category Selection */}
                <div>
                    <div style={{ marginBottom: 6 }}>
                        <Text style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>
                            Category <span style={{ color: '#ff4d4f' }}>*</span>
                        </Text>
                    </div>
                    <Select
                        placeholder="Select a category..."
                        style={{ width: '100%' }}
                        value={category}
                        onChange={(val) => setCategory(val)}
                        options={ESCALATION_CATEGORIES}
                        size="large"
                    />
                </div>

                {/* Priority Selection */}
                <div>
                    <div style={{ marginBottom: 6 }}>
                        <Text style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>
                            Priority
                        </Text>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                        {/* Urgent */}
                        <div
                            onClick={() => setPriority('urgent')}
                            style={{
                                flex: 1,
                                padding: '8px 12px',
                                borderRadius: 10,
                                border: priority === 'urgent' ? '1.5px solid #ff4d4f' : '1px solid #d9d9d9',
                                background: priority === 'urgent' ? '#fff2f0' : '#ffffff',
                                cursor: 'pointer',
                                textAlign: 'center',
                                transition: 'all 0.15s ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                            }}
                        >
                            <span style={{ fontSize: 12 }}>🔴</span>
                            <Text
                                style={{
                                    fontSize: 13,
                                    fontWeight: priority === 'urgent' ? 600 : 500,
                                    color: priority === 'urgent' ? '#cf1322' : '#434343',
                                }}
                            >
                                Urgent
                            </Text>
                        </div>

                        {/* Medium (Default) */}
                        <div
                            onClick={() => setPriority('medium')}
                            style={{
                                flex: 1,
                                padding: '8px 12px',
                                borderRadius: 10,
                                border: priority === 'medium' ? '1.5px solid #d46b08' : '1px solid #d9d9d9',
                                background: priority === 'medium' ? '#fff7e6' : '#ffffff',
                                cursor: 'pointer',
                                textAlign: 'center',
                                transition: 'all 0.15s ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                            }}
                        >
                            <span style={{ fontSize: 12 }}>🟠</span>
                            <Text
                                style={{
                                    fontSize: 13,
                                    fontWeight: priority === 'medium' ? 600 : 500,
                                    color: priority === 'medium' ? '#d46b08' : '#434343',
                                }}
                            >
                                Medium
                            </Text>
                        </div>

                        {/* Low */}
                        <div
                            onClick={() => setPriority('low')}
                            style={{
                                flex: 1,
                                padding: '8px 12px',
                                borderRadius: 10,
                                border: priority === 'low' ? '1.5px solid #1890ff' : '1px solid #d9d9d9',
                                background: priority === 'low' ? '#e6f7ff' : '#ffffff',
                                cursor: 'pointer',
                                textAlign: 'center',
                                transition: 'all 0.15s ease',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 6,
                            }}
                        >
                            <span style={{ fontSize: 12 }}>🔵</span>
                            <Text
                                style={{
                                    fontSize: 13,
                                    fontWeight: priority === 'low' ? 600 : 500,
                                    color: priority === 'low' ? '#096dd9' : '#434343',
                                }}
                            >
                                Low
                            </Text>
                        </div>
                    </div>
                </div>

                {/* Conditional Affected Items Selector (Only for Return / Replacement Request) */}
                {showAffectedItems && (
                    <Card
                        size="small"
                        title={
                            <Text strong style={{ fontSize: 13, color: '#1890ff' }}>
                                📦 Affected Items Selection
                            </Text>
                        }
                        style={{
                            background: '#fafafa',
                            borderRadius: 8,
                            borderColor: '#e8e8e8',
                        }}
                    >
                        {order?.items && order.items.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                {order.items.map((item: OrderItem) => {
                                    const itemState = selectedItems[item.order_item_id] || {
                                        selected: false,
                                        quantity: 1,
                                    };
                                    return (
                                        <div
                                            key={item.order_item_id}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '8px 12px',
                                                background: itemState.selected ? '#e6f7ff' : '#ffffff',
                                                border: itemState.selected
                                                    ? '1px solid #91d5ff'
                                                    : '1px solid #f0f0f0',
                                                borderRadius: 6,
                                                transition: 'all 0.15s ease',
                                            }}
                                        >
                                            <Checkbox
                                                checked={itemState.selected}
                                                onChange={(e) =>
                                                    handleCheckboxChange(
                                                        item.order_item_id,
                                                        e.target.checked,
                                                        item.quantity,
                                                    )
                                                }
                                            >
                                                <div>
                                                    <Text strong style={{ fontSize: 13 }}>
                                                        {item.product_name}
                                                    </Text>
                                                    <div>
                                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                                            SKU: {item.product_sku || 'N/A'} | Ordered Qty: {item.quantity}
                                                        </Text>
                                                    </div>
                                                </div>
                                            </Checkbox>

                                            <div
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                    opacity: itemState.selected ? 1 : 0.4,
                                                    pointerEvents: itemState.selected ? 'auto' : 'none',
                                                }}
                                            >
                                                <Button
                                                    size="small"
                                                    icon={<MinusOutlined />}
                                                    disabled={!itemState.selected || itemState.quantity <= 1}
                                                    onClick={() =>
                                                        handleQuantityChange(
                                                            item.order_item_id,
                                                            -1,
                                                            item.quantity,
                                                        )
                                                    }
                                                />
                                                <span
                                                    style={{
                                                        minWidth: 24,
                                                        textAlign: 'center',
                                                        fontWeight: 600,
                                                        fontSize: 13,
                                                    }}
                                                >
                                                    {itemState.quantity}
                                                </span>
                                                <Button
                                                    size="small"
                                                    icon={<PlusOutlined />}
                                                    disabled={
                                                        !itemState.selected ||
                                                        itemState.quantity >= item.quantity
                                                    }
                                                    onClick={() =>
                                                        handleQuantityChange(
                                                            item.order_item_id,
                                                            1,
                                                            item.quantity,
                                                        )
                                                    }
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <Text type="secondary" style={{ fontSize: 12 }}>
                                No items found in this order.
                            </Text>
                        )}
                    </Card>
                )}

                {/* What needs attention? Field */}
                <div>
                    <div style={{ marginBottom: 6 }}>
                        <Text style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>
                            What needs attention? <span style={{ color: '#ff4d4f' }}>*</span>
                        </Text>
                    </div>
                    <Input.TextArea
                        rows={3}
                        maxLength={2000}
                        placeholder="e.g. Customer requested urgent order hold / reported defective item..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        style={{ borderRadius: 8 }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                        <div>
                            {description.length > 0 && description.trim().length < 5 && (
                                <Text type="danger" style={{ fontSize: 11 }}>
                                    Must be at least 5 characters long
                                </Text>
                            )}
                        </div>
                        <Text type="secondary" style={{ fontSize: 11 }}>
                            {description.length} / 2000
                        </Text>
                    </div>
                </div>

                {/* Evidence / photos */}
                <div>
                    <div style={{ marginBottom: 6 }}>
                        <Text style={{ fontSize: 13, fontWeight: 600, color: '#262626' }}>
                            Evidence / photos
                        </Text>
                    </div>

                    <Upload.Dragger
                        accept="image/png, image/jpeg, image/jpg, image/webp"
                        beforeUpload={handleBeforeUpload}
                        showUploadList={false}
                        multiple
                        style={{
                            padding: '16px',
                            background: '#fafafa',
                            borderRadius: 10,
                            border: '1px dashed #d9d9d9',
                        }}
                    >
                        <p className="ant-upload-drag-icon" style={{ marginBottom: 4 }}>
                            <PaperClipOutlined style={{ fontSize: 22, color: '#595959' }} />
                        </p>
                        <p
                            className="ant-upload-text"
                            style={{ fontSize: 13, fontWeight: 600, color: '#262626', margin: 0 }}
                        >
                            Click to browse or drag photos here
                        </p>
                        <p style={{ fontSize: 11, color: '#8c8c8c', margin: '4px 0 0' }}>
                            PNG, JPG or WebP, up to 5MB each
                        </p>
                    </Upload.Dragger>

                    {/* Previews */}
                    {imageList.length > 0 && (
                        <div
                            style={{
                                display: 'flex',
                                flexWrap: 'wrap',
                                gap: 10,
                                marginTop: 10,
                            }}
                        >
                            {imageList.map((img) => (
                                <div
                                    key={img.uid}
                                    style={{
                                        position: 'relative',
                                        width: 64,
                                        height: 64,
                                        borderRadius: 8,
                                        overflow: 'hidden',
                                        border: '1px solid #d9d9d9',
                                    }}
                                >
                                    <img
                                        src={img.url}
                                        alt={img.name}
                                        style={{
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'cover',
                                        }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => handleRemoveImage(img.uid)}
                                        style={{
                                            position: 'absolute',
                                            top: 2,
                                            right: 2,
                                            background: 'rgba(0, 0, 0, 0.6)',
                                            color: '#fff',
                                            border: 'none',
                                            borderRadius: '50%',
                                            width: 18,
                                            height: 18,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: 'pointer',
                                            fontSize: 10,
                                        }}
                                        title="Remove photo"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Info Notice Box */}
                <div
                    style={{
                        padding: '10px 14px',
                        background: '#e6f7ff',
                        borderRadius: 8,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 12,
                        color: '#096dd9',
                    }}
                >
                    <InfoCircleFilled style={{ color: '#1890ff', fontSize: 14 }} />
                    <div>
                        This escalation will be visible to both the <b>Branch Manager</b> and{' '}
                        <b>Super Admin</b> for immediate action and tracking.
                    </div>
                </div>
            </div>
        </Modal>
    );
};

export default RaiseEscalationModal;
