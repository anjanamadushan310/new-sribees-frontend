/**
 * ImageGalleryUpload
 *
 * Controlled gallery editor for up to `maxImages` product images
 * (1 primary thumbnail + the rest as gallery images). Files are uploaded to
 * the backend storage endpoint immediately (returning a hosted URL); the
 * URL→product link is persisted by ProductForm on save.
 *
 * Value shape is a flat list of GalleryImage; exactly one item is primary.
 * `image_id` is present only for images already linked on the server (edit
 * mode) — ProductForm uses that to diff adds/removes on submit.
 */

import React, { useState } from 'react';
import { Upload, Modal, App, Button, Space, Typography, Spin, Tag } from 'antd';
import {
    PlusOutlined,
    DeleteOutlined,
    EyeOutlined,
    StarFilled,
    StarOutlined,
} from '@ant-design/icons';
import type { RcFile } from 'antd/es/upload';
import { productsApi } from '../../api/products.api';

const { Text } = Typography;

export interface GalleryImage {
    uid: string;
    image_url: string;
    is_primary: boolean;
    image_id?: string; // set if already linked server-side
}

interface ImageGalleryUploadProps {
    value?: GalleryImage[];
    onChange?: (images: GalleryImage[]) => void;
    maxImages?: number;
    maxFileSizeMB?: number;
    disabled?: boolean;
    /**
     * When set (edit mode), changing the primary among already-saved images
     * (those with an `image_id`) is persisted immediately via PATCH. In create
     * mode this is undefined and primary is applied when the product is saved.
     */
    productId?: string;
}

const ImageGalleryUpload: React.FC<ImageGalleryUploadProps> = ({
    value = [],
    onChange,
    maxImages = 5,
    maxFileSizeMB = 1,
    disabled = false,
    productId,
}) => {
    const { message } = App.useApp();
    const [uploading, setUploading] = useState(false);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);

    const emit = (next: GalleryImage[]) => {
        // Guarantee exactly one primary whenever the list is non-empty.
        let hasFoundPrimary = false;
        const normalized = next.map((img) => {
            if (img.is_primary) {
                if (!hasFoundPrimary) {
                    hasFoundPrimary = true;
                    return img;
                }
                return { ...img, is_primary: false };
            }
            return img;
        });

        if (normalized.length > 0 && !hasFoundPrimary) {
            normalized[0] = { ...normalized[0], is_primary: true };
        }
        onChange?.(normalized);
    };

    const beforeUpload = (file: RcFile): boolean => {
        if (!file.type.startsWith('image/')) {
            message.error('Only image files are allowed.');
            return false;
        }
        if (file.size > maxFileSizeMB * 1024 * 1024) {
            const actualMb = (file.size / 1024 / 1024).toFixed(1);
            message.error(
                `Image size (${actualMb}MB) exceeds the maximum limit of ${maxFileSizeMB}MB. Please upload an image under ${maxFileSizeMB}MB.`
            );
            return false;
        }
        if (value.length >= maxImages) {
            message.error(`Maximum ${maxImages} images allowed.`);
            return false;
        }
        return true;
    };

    const handleUpload = async (file: RcFile) => {
        setUploading(true);
        try {
            const url = await productsApi.uploadImage(file);
            if (value.some((img) => img.image_url === url)) {
                message.warning('This image is already added.');
                return;
            }
            const newImage: GalleryImage = {
                uid: `new-${Date.now()}-${Math.random().toString(36).slice(2)}`,
                image_url: url,
                is_primary: value.length === 0, // first image becomes thumbnail
            };
            emit([...value, newImage]);
            message.success('Image uploaded.');
        } catch (err: any) {
            message.error(
                err.response?.data?.detail || 'Failed to upload image. Please try again.'
            );
        } finally {
            setUploading(false);
        }
    };

    const handleRemove = (uid: string) => {
        const removed = value.find((img) => img.uid === uid);
        let next = value.filter((img) => img.uid !== uid);
        // If we removed the primary, promote the first remaining image.
        if (removed?.is_primary && next.length > 0) {
            next = next.map((img, i) => ({ ...img, is_primary: i === 0 }));
        }
        emit(next);
    };

    const handleSetPrimary = async (uid: string) => {
        const target = value.find((img) => img.uid === uid);
        if (!target || target.is_primary) return;

        // Optimistically reflect the change locally.
        emit(value.map((img) => ({ ...img, is_primary: img.uid === uid })));

        // Persist immediately for images already linked on the server.
        // New (not-yet-linked) images get their primary flag on product save.
        if (target.image_id && productId) {
            try {
                await productsApi.setPrimaryImage(productId, target.image_id);
                message.success('Thumbnail updated.');
            } catch (err: any) {
                message.error(
                    err.response?.data?.detail || 'Failed to update thumbnail.'
                );
            }
        }
    };

    const canAddMore = value.length < maxImages;

    return (
        <div>
            <div style={{ marginBottom: 12 }}>
                <Space>
                    <Text strong>Product Images</Text>
                    <Text type="secondary">
                        ({value.length}/{maxImages}) — Max {maxFileSizeMB}MB per image. The ★ image is the thumbnail
                    </Text>
                </Space>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                {value.map((img) => (
                    <div
                        key={img.uid}
                        style={{
                            position: 'relative',
                            width: 120,
                            height: 120,
                            borderRadius: 8,
                            overflow: 'hidden',
                            border: img.is_primary ? '2px solid #1890ff' : '1px solid #d9d9d9',
                        }}
                    >
                        <img
                            src={img.image_url}
                            alt="product"
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        {img.is_primary && (
                            <Tag
                                color="blue"
                                style={{ position: 'absolute', top: 4, left: 4, margin: 0 }}
                            >
                                Thumbnail
                            </Tag>
                        )}
                        {!disabled && (
                            <div
                                style={{
                                    position: 'absolute',
                                    bottom: 0,
                                    left: 0,
                                    right: 0,
                                    background: 'rgba(0,0,0,0.55)',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    gap: 2,
                                    padding: '2px 0',
                                }}
                            >
                                <Button
                                    type="text"
                                    size="small"
                                    title={img.is_primary ? 'Primary thumbnail' : 'Set as thumbnail'}
                                    icon={
                                        img.is_primary ? (
                                            <StarFilled style={{ color: '#faad14' }} />
                                        ) : (
                                            <StarOutlined style={{ color: '#fff' }} />
                                        )
                                    }
                                    disabled={img.is_primary}
                                    onClick={() => handleSetPrimary(img.uid)}
                                />
                                <Button
                                    type="text"
                                    size="small"
                                    title="Preview"
                                    icon={<EyeOutlined style={{ color: '#fff' }} />}
                                    onClick={() => setPreviewUrl(img.image_url)}
                                />
                                <Button
                                    type="text"
                                    size="small"
                                    danger
                                    title="Remove"
                                    icon={<DeleteOutlined style={{ color: '#ff4d4f' }} />}
                                    onClick={() => handleRemove(img.uid)}
                                />
                            </div>
                        )}
                    </div>
                ))}

                {canAddMore && !disabled && (
                    <Upload
                        showUploadList={false}
                        accept="image/*"
                        beforeUpload={(file) => {
                            if (beforeUpload(file)) {
                                void handleUpload(file);
                            }
                            return false; // never let antd auto-upload
                        }}
                    >
                        <div
                            style={{
                                width: 120,
                                height: 120,
                                border: '1px dashed #d9d9d9',
                                borderRadius: 8,
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                color: '#666',
                            }}
                        >
                            {uploading ? (
                                <Spin />
                            ) : (
                                <>
                                    <PlusOutlined />
                                    <div style={{ marginTop: 8, fontSize: 12 }}>Upload</div>
                                </>
                            )}
                        </div>
                    </Upload>
                )}
            </div>

            <div style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                    Up to {maxImages} images, max {maxFileSizeMB}MB each. Recommended 800×800px.
                </Text>
            </div>

            <Modal
                open={!!previewUrl}
                footer={null}
                onCancel={() => setPreviewUrl(null)}
                title="Image preview"
            >
                {previewUrl && <img alt="preview" style={{ width: '100%' }} src={previewUrl} />}
            </Modal>
        </div>
    );
};

export default ImageGalleryUpload;
