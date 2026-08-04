/**
 * Product Form (Admin Module 7.2) — used for both create and edit routes.
 *
 * On save it persists the product, then reconciles the image gallery against
 * the backend: newly-added images are uploaded+linked, removed images are
 * unlinked. Images are uploaded to storage by ImageGalleryUpload as files are
 * chosen; here we only link/unlink URLs to the product.
 */
import React, { useEffect, useState } from 'react';
import {
    Form,
    Input,
    InputNumber,
    Select,
    Switch,
    Button,
    Card,
    Row,
    Col,
    Divider,
    Spin,
    App,
    Typography,
} from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productsApi } from '../../api/products.api';
import type { ProductPayload } from '../../api/products.api';
import { categoriesApi } from '../../api/categories.api';
import ImageGalleryUpload from '../../components/products/ImageGalleryUpload';
import type { GalleryImage } from '../../components/products/ImageGalleryUpload';

const { TextArea } = Input;
const { Title } = Typography;

const slugify = (text: string): string =>
    text
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

interface ProductFormValues {
    name: string;
    slug: string;
    sku?: string;
    category_id?: string;
    subcategory_id?: string;
    description?: string;
    short_description?: string;
    price: number;
    compare_at_price?: number;
    stock_quantity?: number;
    is_active: boolean;
    is_featured: boolean;
}

const ProductForm: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEdit = !!id && id !== 'new';
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [form] = Form.useForm<ProductFormValues>();

    const [gallery, setGallery] = useState<GalleryImage[]>([]);
    // Snapshot of server-side images at load time, to diff removals on save.
    const [originalImages, setOriginalImages] = useState<GalleryImage[]>([]);
    const [slugTouched, setSlugTouched] = useState(false);

    const { data: categories = [] } = useQuery({
        queryKey: ['admin', 'categories'],
        queryFn: categoriesApi.list,
    });

    // The backend returns one flat list; the hierarchy is carried by
    // parent_category_id. Top-level rows are the Category dropdown, and the
    // children of the selected one are the Sub-category dropdown.
    const rootCategories = categories.filter((c) => !c.parent_category_id);
    const selectedCategoryId = Form.useWatch('category_id', form);
    const subcategories = categories.filter(
        (c) => c.parent_category_id && c.parent_category_id === selectedCategoryId
    );

    const { data: product, isLoading: loadingProduct } = useQuery({
        queryKey: ['admin', 'product', id],
        queryFn: () => productsApi.getById(id!),
        enabled: isEdit,
    });

    useEffect(() => {
        if (product) {
            setSlugTouched(true);
            form.setFieldsValue({
                name: product.name,
                slug: product.slug,
                sku: product.sku ?? undefined,
                category_id: product.category_id ?? undefined,
                subcategory_id: product.subcategory_id ?? undefined,
                description: product.description ?? undefined,
                short_description: product.short_description ?? undefined,
                price: product.price,
                compare_at_price: product.compare_at_price ?? undefined,
                stock_quantity: product.stock_quantity,
                is_active: product.is_active,
                is_featured: product.is_featured,
            });
            const loaded: GalleryImage[] = product.images
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((img) => ({
                    uid: img.image_id,
                    image_id: img.image_id,
                    image_url: img.image_url,
                    is_primary: img.is_primary,
                }));
            setGallery(loaded);
            setOriginalImages(loaded);
        }
    }, [product, form]);

    // Link newly-added gallery images and unlink removed ones.
    const syncImages = async (productId: string) => {
        const currentIds = new Set(gallery.filter((g) => g.image_id).map((g) => g.image_id));
        // Unlink removed
        for (const orig of originalImages) {
            if (orig.image_id && !currentIds.has(orig.image_id)) {
                await productsApi.removeImage(productId, orig.image_id);
            }
        }
        // Link new (those without an image_id yet), preserving order & primary
        for (let i = 0; i < gallery.length; i++) {
            const img = gallery[i];
            if (!img.image_id) {
                await productsApi.linkImage(productId, {
                    image_url: img.image_url,
                    is_primary: img.is_primary,
                    sort_order: i,
                });
            }
        }

        // Reconcile the primary thumbnail for already-saved images. New primary
        // images were linked with is_primary above; this covers a saved image
        // becoming primary (e.g. auto-promoted after the old thumbnail was
        // removed) that differs from what the server had.
        const desiredPrimary = gallery.find((g) => g.is_primary);
        const originalPrimaryId = originalImages.find((o) => o.is_primary)?.image_id;
        if (desiredPrimary?.image_id && desiredPrimary.image_id !== originalPrimaryId) {
            await productsApi.setPrimaryImage(productId, desiredPrimary.image_id);
        }
    };

    const saveMutation = useMutation({
        mutationFn: async (values: ProductFormValues) => {
            const payload: ProductPayload = {
                name: values.name.trim(),
                slug: (values.slug || slugify(values.name)).trim(),
                sku: values.sku?.trim() || null,
                category_id: values.category_id || null,
                subcategory_id: values.subcategory_id || null,
                description: values.description?.trim() || null,
                short_description: values.short_description?.trim() || null,
                price: values.price,
                compare_at_price: values.compare_at_price ?? null,
                stock_quantity: values.stock_quantity ?? 0,
                is_active: values.is_active,
                is_featured: values.is_featured,
            };

            const saved = isEdit
                ? await productsApi.update(id!, payload)
                : await productsApi.create(payload);

            await syncImages(saved.product_id);
            return saved;
        },
        onSuccess: () => {
            message.success(isEdit ? 'Product updated.' : 'Product created.');
            queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
            if (isEdit) {
                queryClient.invalidateQueries({ queryKey: ['admin', 'product', id] });
            }
            navigate('/products');
        },
        onError: (err: any) =>
            message.error(err.response?.data?.detail || 'Failed to save product.'),
    });

    if (isEdit && loadingProduct) {
        return (
            <div style={{ textAlign: 'center', padding: 80 }}>
                <Spin size="large" />
            </div>
        );
    }

    return (
        <div>
            <Button
                icon={<ArrowLeftOutlined />}
                onClick={() => navigate('/products')}
                style={{ marginBottom: 16 }}
            >
                Back to Products
            </Button>

            <Title level={3}>{isEdit ? 'Edit Product' : 'New Product'}</Title>

            <Form
                form={form}
                layout="vertical"
                onFinish={(values) => saveMutation.mutate(values)}
                initialValues={{ is_active: true, is_featured: false, stock_quantity: 0 }}
            >
                <Row gutter={16}>
                    <Col xs={24} lg={16}>
                        <Card title="Details" style={{ marginBottom: 16 }}>
                            <Form.Item
                                label="Name"
                                name="name"
                                rules={[{ required: true, message: 'Name is required' }]}
                            >
                                <Input
                                    placeholder="e.g. Organic Whole Milk 1L"
                                    onChange={(e) => {
                                        if (!slugTouched) {
                                            form.setFieldValue('slug', slugify(e.target.value));
                                        }
                                    }}
                                />
                            </Form.Item>

                            <Form.Item
                                label="Slug"
                                name="slug"
                                rules={[
                                    { required: true, message: 'Slug is required' },
                                    {
                                        pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
                                        message: 'Lowercase letters, numbers and hyphens only',
                                    },
                                ]}
                            >
                                <Input
                                    placeholder="organic-whole-milk-1l"
                                    onChange={() => setSlugTouched(true)}
                                />
                            </Form.Item>

                            <Form.Item
                                label="Short Description"
                                name="short_description"
                                rules={[{ max: 500, message: 'Max 500 characters' }]}
                            >
                                <TextArea rows={2} placeholder="One-line summary shown in listings" />
                            </Form.Item>

                            <Form.Item label="Description" name="description">
                                <TextArea rows={5} placeholder="Full product description" />
                            </Form.Item>
                        </Card>

                        <Card title="Images">
                            <Form.Item noStyle>
                                <ImageGalleryUpload
                                    value={gallery}
                                    onChange={setGallery}
                                    maxImages={5}
                                    productId={isEdit ? id : undefined}
                                />
                            </Form.Item>
                        </Card>
                    </Col>

                    <Col xs={24} lg={8}>
                        <Card title="Organization" style={{ marginBottom: 16 }}>
                            <Form.Item label="Category" name="category_id">
                                <Select
                                    placeholder="Select a category"
                                    allowClear
                                    showSearch
                                    optionFilterProp="label"
                                    // Changing the parent invalidates any sub-category
                                    // chosen under the old one — the backend rejects a
                                    // mismatched pair, so clear it rather than submit it.
                                    onChange={() => form.setFieldValue('subcategory_id', undefined)}
                                    options={rootCategories.map((c) => ({
                                        label: c.name,
                                        value: c.category_id,
                                    }))}
                                />
                            </Form.Item>

                            <Form.Item
                                label="Sub-category"
                                name="subcategory_id"
                                extra={
                                    !selectedCategoryId
                                        ? 'Select a category first.'
                                        : subcategories.length === 0
                                          ? 'This category has no sub-categories yet.'
                                          : undefined
                                }
                            >
                                <Select
                                    placeholder={
                                        selectedCategoryId
                                            ? 'Select a sub-category'
                                            : 'Select a category first'
                                    }
                                    allowClear
                                    showSearch
                                    optionFilterProp="label"
                                    disabled={!selectedCategoryId || subcategories.length === 0}
                                    options={subcategories.map((c) => ({
                                        label: c.name,
                                        value: c.category_id,
                                    }))}
                                />
                            </Form.Item>

                            <Form.Item label="SKU" name="sku">
                                <Input placeholder="e.g. MILK-ORG-1L" />
                            </Form.Item>

                            <Form.Item label="Active" name="is_active" valuePropName="checked">
                                <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
                            </Form.Item>

                            <Form.Item label="Featured" name="is_featured" valuePropName="checked">
                                <Switch />
                            </Form.Item>
                        </Card>

                        <Card title="Pricing & Stock">
                            <Form.Item
                                label="Base Price (LKR)"
                                name="price"
                                rules={[{ required: true, message: 'Price is required' }]}
                            >
                                <InputNumber
                                    min={0}
                                    step={0.01}
                                    style={{ width: '100%' }}
                                    prefix="Rs"
                                    placeholder="0.00"
                                />
                            </Form.Item>

                            <Form.Item
                                label="Compare-at Price (LKR)"
                                name="compare_at_price"
                                extra="Original price shown struck-through when discounted"
                            >
                                <InputNumber
                                    min={0}
                                    step={0.01}
                                    style={{ width: '100%' }}
                                    prefix="Rs"
                                    placeholder="0.00"
                                />
                            </Form.Item>

                            <Divider style={{ margin: '8px 0 16px' }} />

                            <Form.Item label="Stock Quantity" name="stock_quantity">
                                <InputNumber min={0} style={{ width: '100%' }} placeholder="0" />
                            </Form.Item>
                        </Card>
                    </Col>
                </Row>

                <div style={{ marginTop: 8 }}>
                    <Button
                        type="primary"
                        htmlType="submit"
                        size="large"
                        loading={saveMutation.isPending}
                    >
                        {isEdit ? 'Update Product' : 'Create Product'}
                    </Button>
                    <Button
                        size="large"
                        style={{ marginLeft: 8 }}
                        onClick={() => navigate('/products')}
                    >
                        Cancel
                    </Button>
                </div>
            </Form>
        </div>
    );
};

export default ProductForm;
