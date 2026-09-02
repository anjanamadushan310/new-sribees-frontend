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
    Select,
    Switch,
    Button,
    Card,
    Row,
    Col,
    Spin,
    App,
    Typography,
    Space,
    Tabs,
    Tooltip,
    Alert,
} from 'antd';
import { ArrowLeftOutlined, ThunderboltOutlined, StarOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productsApi } from '../../api/products.api';
import type { ProductPayload } from '../../api/products.api';
import { categoriesApi } from '../../api/categories.api';
import ImageGalleryUpload from '../../components/products/ImageGalleryUpload';
import type { GalleryImage } from '../../components/products/ImageGalleryUpload';
import { usePermissions } from '../../hooks/usePermissions';

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
    name_si?: string;
    name_ta?: string;
    slug: string;
    sku?: string;
    category_id?: string;
    subcategory_id?: string;
    description?: string;
    description_si?: string;
    description_ta?: string;
    short_description?: string;
    short_description_si?: string;
    short_description_ta?: string;
    search_keywords?: string;
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
    // Support staff (products:read, no products:update) reach the edit route
    // only to inspect a product — render the whole form read-only (B5).
    const { canUpdate, canCreate } = usePermissions();
    const readOnly = isEdit ? !canUpdate('products') : !canCreate('products');

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
                name_si: product.name_si ?? undefined,
                name_ta: product.name_ta ?? undefined,
                slug: product.slug,
                sku: product.sku ?? undefined,
                category_id: product.category_id ?? undefined,
                subcategory_id: product.subcategory_id ?? undefined,
                description: product.description ?? undefined,
                description_si: product.description_si ?? undefined,
                description_ta: product.description_ta ?? undefined,
                short_description: product.short_description ?? undefined,
                short_description_si: product.short_description_si ?? undefined,
                short_description_ta: product.short_description_ta ?? undefined,
                search_keywords: product.search_keywords ?? undefined,
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
                // Blank translations are sent as null, not "", so the backend
                // treats them as absent and the customer app falls back to the
                // English copy instead of rendering an empty name.
                name_si: values.name_si?.trim() || null,
                name_ta: values.name_ta?.trim() || null,
                slug: (values.slug || slugify(values.name)).trim(),
                sku: values.sku?.trim() || null,
                category_id: values.category_id || null,
                subcategory_id: values.subcategory_id || null,
                description: values.description?.trim() || null,
                description_si: values.description_si?.trim() || null,
                description_ta: values.description_ta?.trim() || null,
                short_description: values.short_description?.trim() || null,
                short_description_si: values.short_description_si?.trim() || null,
                short_description_ta: values.short_description_ta?.trim() || null,
                search_keywords: values.search_keywords?.trim() || null,
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

    const suggestKeywordsMutation = useMutation({
        mutationFn: async () => {
            const values = form.getFieldsValue();
            if (!values.name?.trim()) {
                throw new Error('Enter a product name first.');
            }
            const categoryName = rootCategories.find(
                (c) => c.category_id === values.category_id
            )?.name;
            return productsApi.suggestKeywords({
                name: values.name,
                description: values.description,
                short_description: values.short_description,
                category: categoryName,
            });
        },
        onSuccess: (suggested) => {
            const existing = form.getFieldValue('search_keywords')?.trim();
            form.setFieldValue(
                'search_keywords',
                existing ? `${existing}, ${suggested}` : suggested
            );
            message.success('Suggested keywords added — review before saving.');
        },
        onError: (err: any) =>
            message.error(
                err.response?.data?.detail ||
                err.message ||
                'Could not get AI keyword suggestions.'
            ),
    });

    const suggestSkuMutation = useMutation({
        mutationFn: async () => {
            const values = form.getFieldsValue();
            return productsApi.suggestSku({
                name: values.name,
                category_id: values.category_id,
            });
        },
        onSuccess: (sku) => {
            form.setFieldValue('sku', sku);
            message.success('Guaranteed unique SKU generated!');
        },
        onError: (err: any) =>
            message.error(
                err.response?.data?.detail ||
                err.message ||
                'Could not generate a unique SKU.'
            ),
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

            <Title level={3}>
                {readOnly ? 'Product Details' : isEdit ? 'Edit Product' : 'New Product'}
            </Title>

            {readOnly ? (
                <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="View only"
                    description="You can inspect this product's catalog details but not change them."
                />
            ) : (
                <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="No price, stock or cashback here"
                    description="This is the shared catalog entry only. Price, stock quantity and cashback % are set per branch by that branch's manager, from Inventory → Add Product to Branch."
                />
            )}

            <Form
                form={form}
                layout="vertical"
                disabled={readOnly}
                onFinish={(values) => saveMutation.mutate(values)}
                initialValues={{ is_active: true, is_featured: false }}
            >
                <Row gutter={16}>
                    <Col xs={24} lg={16}>
                        <Card title="Details" style={{ marginBottom: 16 }}>
                            {/* One tab per language. English is the fallback
                                every other language degrades to, so it is the
                                only one that is required; Sinhala and Tamil can
                                be filled in later without blocking the save.
                                Panes stay mounted (destroyInactiveTabPane is
                                off by default) so a validation error on a tab
                                the admin isn't looking at still blocks submit
                                instead of failing silently. */}
                            <Tabs
                                defaultActiveKey="en"
                                tabBarExtraContent={
                                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                        Sinhala/Tamil optional — blank falls back to English
                                    </Typography.Text>
                                }
                                items={[
                                    {
                                        key: 'en',
                                        label: 'English',
                                        children: (
                                            <>
                                                <Form.Item
                                                    label="Name"
                                                    name="name"
                                                    rules={[{ required: true, message: 'Name is required' }]}
                                                >
                                                    <Input
                                                        placeholder="e.g. Organic Whole Milk 1L"
                                                        onChange={(e) => {
                                                            if (!slugTouched) {
                                                                form.setFieldValue(
                                                                    'slug',
                                                                    slugify(e.target.value)
                                                                );
                                                            }
                                                        }}
                                                    />
                                                </Form.Item>
                                                <Form.Item
                                                    label="Short Description"
                                                    name="short_description"
                                                    rules={[{ max: 500, message: 'Max 500 characters' }]}
                                                >
                                                    <TextArea
                                                        rows={2}
                                                        placeholder="One-line summary shown in listings"
                                                    />
                                                </Form.Item>
                                                <Form.Item label="Description" name="description">
                                                    <TextArea rows={5} placeholder="Full product description" />
                                                </Form.Item>
                                            </>
                                        ),
                                    },
                                    {
                                        key: 'si',
                                        label: 'සිංහල',
                                        children: (
                                            <>
                                                <Form.Item
                                                    label="Name (Sinhala)"
                                                    name="name_si"
                                                    rules={[{ max: 255, message: 'Max 255 characters' }]}
                                                >
                                                    <Input placeholder="උදා. නැවුම් කිරි (ලීටර් 1)" />
                                                </Form.Item>
                                                <Form.Item
                                                    label="Short Description (Sinhala)"
                                                    name="short_description_si"
                                                    rules={[{ max: 500, message: 'Max 500 characters' }]}
                                                >
                                                    <TextArea
                                                        rows={2}
                                                        placeholder="ලැයිස්තුවේ පෙන්වන එක් පේළියක සාරාංශය"
                                                    />
                                                </Form.Item>
                                                <Form.Item
                                                    label="Description (Sinhala)"
                                                    name="description_si"
                                                >
                                                    <TextArea rows={5} placeholder="සම්පූර්ණ නිෂ්පාදන විස්තරය" />
                                                </Form.Item>
                                            </>
                                        ),
                                    },
                                    {
                                        key: 'ta',
                                        label: 'தமிழ்',
                                        children: (
                                            <>
                                                <Form.Item
                                                    label="Name (Tamil)"
                                                    name="name_ta"
                                                    rules={[{ max: 255, message: 'Max 255 characters' }]}
                                                >
                                                    <Input placeholder="எ.கா. புதிய பால் (1 லி)" />
                                                </Form.Item>
                                                <Form.Item
                                                    label="Short Description (Tamil)"
                                                    name="short_description_ta"
                                                    rules={[{ max: 500, message: 'Max 500 characters' }]}
                                                >
                                                    <TextArea
                                                        rows={2}
                                                        placeholder="பட்டியலில் காட்டப்படும் ஒரு வரி சுருக்கம்"
                                                    />
                                                </Form.Item>
                                                <Form.Item
                                                    label="Description (Tamil)"
                                                    name="description_ta"
                                                >
                                                    <TextArea rows={5} placeholder="முழு தயாரிப்பு விவரம்" />
                                                </Form.Item>
                                            </>
                                        ),
                                    },
                                ]}
                            />

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
                                label={
                                    <Space>
                                        Search Keywords
                                        <Button
                                            size="small"
                                            icon={<ThunderboltOutlined />}
                                            loading={suggestKeywordsMutation.isPending}
                                            onClick={() => suggestKeywordsMutation.mutate()}
                                        >
                                            Suggest with AI
                                        </Button>
                                    </Space>
                                }
                                name="search_keywords"
                                extra="Sinhala/Tamil/Singlish/Tamilish alternate names, common misspellings — helps customers find this product however they search. Never shown to customers."
                            >
                                <TextArea
                                    rows={2}
                                    placeholder="e.g. kesel, කෙසෙල්, வாழைப்பழம், ambul kesel"
                                />
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
                            <Form.Item
                                label="Category"
                                name="category_id"
                                rules={[{ required: true, message: 'Category is required' }]}
                            >
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

                            <Form.Item
                                label="SKU"
                                name="sku"
                                rules={[{ required: true, whitespace: true, message: 'SKU is required' }]}
                            >
                                <Input
                                    placeholder="e.g. MILK-ORG-1L"
                                    suffix={
                                        <Tooltip title="Generate Unique SKU automatically based on Name and Category">
                                            <Button
                                                type="text"
                                                size="small"
                                                icon={<StarOutlined style={{ color: '#faad14', fontSize: 16 }} />}
                                                loading={suggestSkuMutation.isPending}
                                                onClick={() => suggestSkuMutation.mutate()}
                                                style={{ padding: 0, width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                            />
                                        </Tooltip>
                                    }
                                />
                            </Form.Item>

                            <Form.Item label="Active" name="is_active" valuePropName="checked">
                                <Switch checkedChildren="Active" unCheckedChildren="Inactive" />
                            </Form.Item>

                            <Form.Item label="Featured" name="is_featured" valuePropName="checked">
                                <Switch />
                            </Form.Item>
                        </Card>
                    </Col>
                </Row>

                <div style={{ marginTop: 8 }} hidden={readOnly}>
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
