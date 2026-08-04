/**
 * Single-image upload for a Top-Level Category.
 *
 * The file is pushed to object storage as soon as it is chosen and the hosted
 * URL is handed back via onChange — so an image can be picked before the
 * category itself exists, and saving the form only has to persist a string.
 *
 * Deliberately single-image (unlike ImageGalleryUpload for products): a category
 * renders as exactly one tile on the mobile home screen.
 */
import React, { useState } from 'react';
import { Upload, Button, Space, Typography, App } from 'antd';
import { UploadOutlined, DeleteOutlined, LoadingOutlined } from '@ant-design/icons';
import { categoriesApi } from '../../api/categories.api';

const { Text } = Typography;

const ACCEPTED = 'image/jpeg,image/png,image/webp,image/gif';
const MAX_MB = 5;

interface Props {
    value?: string | null;
    onChange: (url: string | null) => void;
    disabled?: boolean;
}

const CategoryImageUpload: React.FC<Props> = ({ value, onChange, disabled }) => {
    const { message } = App.useApp();
    const [uploading, setUploading] = useState(false);

    // Reject the obvious failures client-side; the backend enforces the same
    // limits, but a 5 MB round-trip just to be told "too large" is a poor trade.
    const beforeUpload = (file: File): boolean => {
        if (!ACCEPTED.split(',').includes(file.type)) {
            message.error('Use a JPEG, PNG, WebP or GIF image.');
            return false;
        }
        if (file.size > MAX_MB * 1024 * 1024) {
            message.error(`Image must be under ${MAX_MB} MB.`);
            return false;
        }
        return true;
    };

    const handleUpload = async (file: File) => {
        setUploading(true);
        try {
            const url = await categoriesApi.uploadImage(file);
            onChange(url);
            message.success('Image uploaded.');
        } catch (err: any) {
            message.error(err.response?.data?.detail || 'Failed to upload image.');
        } finally {
            setUploading(false);
        }
    };

    if (value) {
        return (
            <Space direction="vertical" size={8}>
                <img
                    src={value}
                    alt="Category"
                    style={{
                        width: 120,
                        height: 120,
                        objectFit: 'cover',
                        borderRadius: 8,
                        border: '1px solid #f0f0f0',
                    }}
                />
                <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    disabled={disabled}
                    onClick={() => onChange(null)}
                >
                    Remove
                </Button>
            </Space>
        );
    }

    return (
        <Space direction="vertical" size={4}>
            <Upload
                accept={ACCEPTED}
                showUploadList={false}
                beforeUpload={(file) => {
                    if (!beforeUpload(file)) return Upload.LIST_IGNORE;
                    handleUpload(file);
                    // We upload ourselves; stop antd from firing its own request.
                    return false;
                }}
                disabled={disabled || uploading}
            >
                <Button
                    icon={uploading ? <LoadingOutlined /> : <UploadOutlined />}
                    disabled={disabled || uploading}
                >
                    {uploading ? 'Uploading…' : 'Upload Image'}
                </Button>
            </Upload>
            <Text type="secondary" style={{ fontSize: 12 }}>
                Shown as this category's tile on the mobile home screen. Square images work best.
            </Text>
        </Space>
    );
};

export default CategoryImageUpload;
