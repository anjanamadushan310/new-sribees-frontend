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
    Row,
    Col,
    Spin,
    App,
    Typography,
    Space,
    Tabs,
    Tooltip,
    InputNumber,
    Tag,
} from 'antd';
import {
    ArrowLeftOutlined,
    ThunderboltOutlined,
    StarFilled,
    StarOutlined,
    ShoppingOutlined,
    EyeOutlined,
    RollbackOutlined,
    SaveOutlined,
    GlobalOutlined,
    PictureOutlined,
    DollarOutlined,
    AppstoreOutlined,
    InboxOutlined,
    CompassOutlined,
    MobileOutlined,
    SettingOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { productsApi } from '../../api/products.api';
import { referralCommissionApi, apiDetailMessage } from '../../api/referralCommission.api';
import { PRICE_REVIEW_LEVELS } from '../../api/products.api';
import type { PriceReviewLevel, ProductPayload } from '../../api/products.api';
import { categoriesApi } from '../../api/categories.api';
import ImageGalleryUpload from '../../components/products/ImageGalleryUpload';
import type { GalleryImage } from '../../components/products/ImageGalleryUpload';
import { useAuthStore } from '../../store/authStore';
import { AdminRole } from '../../types/admin.types';

const { TextArea } = Input;

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
    price?: number | null;
    cashback_percentage?: number | null;
    referral_commission_percentage?: number | null;
    category_id?: string;
    subcategory_id?: string;
    description?: string;
    description_si?: string;
    description_ta?: string;
    short_description?: string;
    short_description_si?: string;
    short_description_ta?: string;
    search_keywords?: string;
    weight?: number | null;
    weight_unit?: string;
    is_active: boolean;
    is_featured: boolean;
    is_perishable: boolean;
    is_returnable: boolean;
    price_review_level?: PriceReviewLevel;
    images?: GalleryImage[];
}

const productFormStyles = `
.product-form-container {
    padding-bottom: 90px;
    max-width: 1400px;
    margin: 0 auto;
}
.pf-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 22px;
}
.pf-back-btn {
    border-radius: 10px;
    font-weight: 600;
    color: #475569;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    box-shadow: 0 1px 3px rgba(0,0,0,0.03);
    transition: all 0.2s ease;
    height: 38px;
    padding: 0 14px;
}
.pf-back-btn:hover {
    color: #D81B60 !important;
    border-color: #D81B60 !important;
    transform: translateX(-2px);
}
.pf-card {
    background: #ffffff;
    border-radius: 18px;
    border: 1px solid #ECEAF0;
    box-shadow: 0 2px 14px rgba(15, 23, 42, 0.03);
    margin-bottom: 20px;
    overflow: hidden;
    transition: box-shadow 0.2s ease, border-color 0.2s ease;
}
.pf-card:hover {
    box-shadow: 0 6px 20px rgba(15, 23, 42, 0.05);
}
.pf-card-head {
    padding: 16px 22px;
    border-bottom: 1px solid #f1f5f9;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: #fafbfc;
}
.pf-card-title {
    font-size: 14.5px;
    font-weight: 700;
    color: #0f172a;
    display: flex;
    align-items: center;
    gap: 10px;
}
.pf-card-body {
    padding: 22px;
}
.pf-hero-banner {
    background: linear-gradient(135deg, #f8fafc 0%, #eff6ff 100%);
    border: 1px solid #dbeafe;
    border-left: 4px solid #2563eb;
    border-radius: 16px;
    padding: 16px 20px;
    margin-bottom: 22px;
    display: flex;
    align-items: flex-start;
    gap: 16px;
}
.pf-floating-dock {
    position: sticky;
    bottom: 16px;
    z-index: 99;
    background: rgba(255, 255, 255, 0.94);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid rgba(226, 232, 240, 0.95);
    border-radius: 18px;
    padding: 12px 24px;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.1);
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 24px;
}
.pf-ai-btn {
    background: linear-gradient(135deg, #7c3aed 0%, #D81B60 100%) !important;
    color: #ffffff !important;
    border: none !important;
    font-weight: 700 !important;
    border-radius: 8px !important;
    box-shadow: 0 2px 8px rgba(124, 58, 237, 0.25) !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 6px !important;
    transition: all 0.2s ease !important;
}
.pf-ai-btn:hover {
    opacity: 0.92;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(124, 58, 237, 0.35) !important;
}
.pf-save-btn {
    background: linear-gradient(135deg, #D81B60 0%, #b7154f 100%) !important;
    color: #ffffff !important;
    border: none !important;
    font-weight: 700 !important;
    border-radius: 10px !important;
    height: 42px !important;
    padding: 0 24px !important;
    box-shadow: 0 4px 14px rgba(216, 27, 96, 0.28) !important;
    display: inline-flex !important;
    align-items: center !important;
    gap: 8px !important;
    transition: all 0.2s ease !important;
}
.pf-save-btn:hover {
    opacity: 0.95;
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(216, 27, 96, 0.35) !important;
}
.pf-lang-tabs .ant-tabs-nav {
    margin-bottom: 20px;
}
`;

interface FeatureTileProps {
    icon: React.ReactNode;
    title: string;
    description: string;
    checked?: boolean;
    disabled?: boolean;
    activeColor?: string;
    activeBg?: string;
    onChange?: (checked: boolean) => void;
    activeLabel?: string;
    inactiveLabel?: string;
}

const FeatureTile: React.FC<FeatureTileProps> = ({
    icon,
    title,
    description,
    checked = false,
    disabled = false,
    activeColor = '#059669',
    activeBg = '#f0fdf4',
    onChange,
    activeLabel = 'Active',
    inactiveLabel = 'Inactive',
}) => {
    return (
        <div
            onClick={() => !disabled && onChange?.(!checked)}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 14px',
                borderRadius: 14,
                border: `1.5px solid ${checked ? activeColor : '#e2e8f0'}`,
                background: checked ? activeBg : '#ffffff',
                cursor: disabled ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.65 : 1,
                transition: 'all 0.18s ease',
                marginBottom: 10,
                boxShadow: checked ? `0 2px 8px ${activeColor}15` : 'none',
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                <div
                    style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: checked ? `${activeColor}20` : '#f1f5f9',
                        color: checked ? activeColor : '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                        flexShrink: 0,
                        transition: 'all 0.2s ease',
                    }}
                >
                    {icon}
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>
                            {title}
                        </span>
                        <Tag
                            bordered={false}
                            style={{
                                margin: 0,
                                fontSize: 10.5,
                                fontWeight: 700,
                                borderRadius: 6,
                                padding: '0 6px',
                                background: checked ? activeColor : '#e2e8f0',
                                color: checked ? '#ffffff' : '#475569',
                            }}
                        >
                            {checked ? activeLabel : inactiveLabel}
                        </Tag>
                    </div>
                    <div
                        style={{
                            fontSize: 11.5,
                            color: '#64748b',
                            marginTop: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        {description}
                    </div>
                </div>
            </div>
            <div style={{ marginLeft: 8 }} onClick={(e) => e.stopPropagation()}>
                <Switch
                    checked={checked}
                    disabled={disabled}
                    onChange={(val) => onChange?.(val)}
                    style={{
                        backgroundColor: checked ? activeColor : undefined,
                    }}
                />
            </div>
        </div>
    );
};

const ProductForm: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams();
    const isEdit = !!id && id !== 'new';
    const { message } = App.useApp();
    const queryClient = useQueryClient();
    const [form] = Form.useForm<ProductFormValues>();
    const user = useAuthStore((state) => state.user);
    const isSuperAdmin = user?.role === AdminRole.SUPER_ADMIN;
    const isBranchScoped = !!user && !isSuperAdmin && user.role !== AdminRole.CUSTOMER_SUPPORT;
    const isReadOnlyUser = !!user && user.role === AdminRole.CUSTOMER_SUPPORT;

    const catalogDisabled = !isSuperAdmin;
    const readOnly = isReadOnlyUser || (!isSuperAdmin && !isBranchScoped);

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

    // Watchers for real-time mobile preview & translation indicators
    const watchedName = Form.useWatch('name', form);
    const watchedNameSi = Form.useWatch('name_si', form);
    const watchedNameTa = Form.useWatch('name_ta', form);
    const watchedPrice = Form.useWatch('price', form);
    const watchedWeight = Form.useWatch('weight', form);
    const watchedWeightUnit = Form.useWatch('weight_unit', form);
    const watchedCashback = Form.useWatch('cashback_percentage', form);
    const watchedFeatured = Form.useWatch('is_featured', form);
    const watchedPerishable = Form.useWatch('is_perishable', form);

    const primaryThumb = gallery.find((g) => g.is_primary)?.image_url || gallery[0]?.image_url;
    const categoryObj = rootCategories.find((c) => c.category_id === selectedCategoryId);

    const { data: product, isLoading: loadingProduct } = useQuery({
        queryKey: ['admin', 'product', id],
        queryFn: () => productsApi.getById(id!),
        enabled: isEdit,
    });

    useEffect(() => {
        if (product) {
            setSlugTouched(true);
            const globalPrice = product.global_price ?? product.price;
            form.setFieldsValue({
                name: product.name,
                name_si: product.name_si ?? undefined,
                name_ta: product.name_ta ?? undefined,
                slug: product.slug,
                sku: product.sku ?? undefined,
                price: globalPrice !== null && globalPrice !== undefined ? Number(globalPrice) : undefined,
                cashback_percentage:
                    product.global_cashback_percentage !== null && product.global_cashback_percentage !== undefined
                        ? Number(product.global_cashback_percentage)
                        : undefined,
                referral_commission_percentage:
                    product.referral_commission_percentage !== null &&
                    product.referral_commission_percentage !== undefined
                        ? Number(product.referral_commission_percentage)
                        : undefined,
                category_id: product.category_id ?? undefined,
                subcategory_id: product.subcategory_id ?? undefined,
                description: product.description ?? undefined,
                description_si: product.description_si ?? undefined,
                description_ta: product.description_ta ?? undefined,
                short_description: product.short_description ?? undefined,
                short_description_si: product.short_description_si ?? undefined,
                short_description_ta: product.short_description_ta ?? undefined,
                search_keywords: product.search_keywords ?? undefined,
                weight: product.weight !== null && product.weight !== undefined ? Number(product.weight) : undefined,
                weight_unit: product.weight_unit || 'kg',
                is_active: product.is_active,
                is_featured: product.is_featured,
                is_perishable: product.is_perishable ?? false,
                is_returnable: product.is_returnable ?? true,
                price_review_level: product.price_review_level ?? undefined,
            });
            let primaryAssigned = false;
            const loaded: GalleryImage[] = (product.images || [])
                .slice()
                .sort((a, b) => a.sort_order - b.sort_order)
                .map((img) => {
                    const isPrimary = img.is_primary && !primaryAssigned;
                    if (isPrimary) primaryAssigned = true;
                    return {
                        uid: img.image_id,
                        image_id: img.image_id,
                        image_url: img.image_url,
                        is_primary: isPrimary,
                    };
                });
            if (loaded.length > 0 && !primaryAssigned) {
                loaded[0].is_primary = true;
            }
            setGallery(loaded);
            setOriginalImages(loaded);
            form.setFieldsValue({ images: loaded });
        }
    }, [product, form]);

    // Keyboard shortcut for quick save (Ctrl + S / Cmd + S)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                if (!readOnly && !saveMutation.isPending) {
                    form.submit();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [form, readOnly]);

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

        // Reconcile the primary thumbnail for already-saved images.
        const desiredPrimary = gallery.find((g) => g.is_primary);
        const originalPrimaryId = originalImages.find((o) => o.is_primary)?.image_id;
        if (desiredPrimary?.image_id && desiredPrimary.image_id !== originalPrimaryId) {
            await productsApi.setPrimaryImage(productId, desiredPrimary.image_id);
        }
    };

    const saveMutation = useMutation({
        mutationFn: async (values: ProductFormValues) => {
            if (!gallery || gallery.length === 0) {
                message.error('Please upload at least one product image (thumbnail).');
                throw new Error('Please upload at least one product image (thumbnail).');
            }

            if (
                values.weight === undefined ||
                values.weight === null ||
                isNaN(Number(values.weight)) ||
                Number(values.weight) <= 0
            ) {
                message.error('Please enter a valid product weight greater than 0.');
                throw new Error('Please enter a valid product weight greater than 0.');
            }

            if (!values.weight_unit || !values.weight_unit.trim()) {
                message.error('Please select a measurement unit.');
                throw new Error('Please select a measurement unit.');
            }

            const imagesPayload = gallery.map((img, i) => ({
                image_url: img.image_url,
                is_primary: img.is_primary,
                sort_order: i,
            }));

            const payload: ProductPayload = {
                name: values.name.trim(),
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
                price: values.price !== undefined && values.price !== null ? Number(values.price) : 0,
                cashback_percentage: values.cashback_percentage ?? null,
                weight: Number(values.weight),
                weight_unit: values.weight_unit || 'kg',
                is_active: values.is_active,
                is_featured: values.is_featured,
                is_perishable: values.is_perishable ?? false,
                is_returnable: values.is_returnable ?? true,
                price_review_level: values.price_review_level ?? null,
                images: imagesPayload,
            };

            const saved = isEdit
                ? await productsApi.update(id!, payload)
                : await productsApi.create(payload);

            if (isEdit && isSuperAdmin) {
                await syncImages(saved.product_id);
            }
            const commission = values.referral_commission_percentage ?? null;
            const before = isEdit ? product?.referral_commission_percentage ?? null : null;
            if (isSuperAdmin && commission !== before) {
                await referralCommissionApi.setProductRate(saved.product_id, commission);
            }
            return saved;
        },
        onSuccess: () => {
            message.success(
                isBranchScoped
                    ? 'Branch visibility updated.'
                    : isEdit
                        ? 'Product updated.'
                        : 'Product created.'
            );
            queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
            if (isEdit) {
                queryClient.invalidateQueries({ queryKey: ['admin', 'product', id] });
            }
            navigate('/products');
        },
        onError: (err: unknown) =>
            message.error(apiDetailMessage(err) ?? 'Failed to save product.'),
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
        onSuccess: ({ keywords, cached, remainingToday }) => {
            const existing: string = form.getFieldValue('search_keywords') || '';
            const seen = new Set<string>();
            const merged = [...existing.split(','), ...keywords.split(',')]
                .map((t) => t.trim())
                .filter((t) => {
                    const key = t.toLocaleLowerCase();
                    if (!t || seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
            const added = merged.length - existing.split(',').filter((t) => t.trim()).length;
            form.setFieldValue('search_keywords', merged.join(', '));
            const allowance = cached
                ? 'from cache, no AI cost'
                : `${remainingToday} AI suggestions left today`;
            if (added > 0) {
                message.success(`Added ${added} keywords (${allowance}). Review before saving.`);
            } else {
                message.info(`Nothing new to add (${allowance}).`);
            }
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
            <div style={{ textAlign: 'center', padding: '100px 0' }}>
                <Spin size="large" />
                <div style={{ marginTop: 16, color: '#64748b', fontWeight: 600 }}>Loading product details...</div>
            </div>
        );
    }

    return (
        <div className="product-form-container">
            <style>{productFormStyles}</style>

            {/* Header Row */}
            <div className="pf-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                    <Button
                        icon={<ArrowLeftOutlined />}
                        onClick={() => navigate('/products')}
                        className="pf-back-btn"
                    >
                        Back to Products
                    </Button>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <h1
                                style={{
                                    margin: 0,
                                    fontSize: 24,
                                    fontWeight: 800,
                                    color: '#0f172a',
                                    letterSpacing: '-0.02em',
                                }}
                            >
                                {isBranchScoped
                                    ? 'Product Details & Branch Visibility'
                                    : readOnly
                                        ? 'Product Details'
                                        : isEdit
                                            ? `Edit Product`
                                            : 'New Product'}
                            </h1>
                            <Tag
                                color={isBranchScoped ? 'gold' : isEdit ? 'blue' : 'magenta'}
                                style={{ fontWeight: 700, borderRadius: 10, padding: '2px 10px', fontSize: 12 }}
                            >
                                {isBranchScoped ? 'Branch Scoped' : isEdit ? 'Catalog Item' : 'New Master Item'}
                            </Tag>
                        </div>
                        <div style={{ fontSize: 13, color: '#64748b', marginTop: 3, fontWeight: 500 }}>
                            {isBranchScoped
                                ? 'Review central catalog details and manage branch availability'
                                : isEdit
                                    ? 'Update specifications, media, translations, and base pricing'
                                    : 'Add a new product to the central Sribees catalog'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Hero Role Banner */}
            <div className="pf-hero-banner">
                <div
                    style={{
                        width: 42,
                        height: 42,
                        borderRadius: 12,
                        background: isBranchScoped ? '#fef3c7' : readOnly ? '#f1f5f9' : '#eff6ff',
                        color: isBranchScoped ? '#d97706' : readOnly ? '#475569' : '#2563eb',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 20,
                        flexShrink: 0,
                    }}
                >
                    {isBranchScoped ? <CompassOutlined /> : readOnly ? <EyeOutlined /> : <GlobalOutlined />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 14.5, color: '#0f172a', marginBottom: 2 }}>
                        {isBranchScoped
                            ? 'Branch Product View'
                            : readOnly
                                ? 'View-Only Catalog Inspection'
                                : 'Global Catalog Master Product'}
                    </div>
                    <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.45 }}>
                        {isBranchScoped
                            ? 'Global catalog details (name, descriptions, images, weight, category, SKU, base price) are managed by Super Admin. You can manage whether this product is Active (Visible) or Inactive (Hidden) for your branch below.'
                            : readOnly
                                ? "You can inspect this product's catalog details. Editing permissions are restricted to Super Admins."
                                : 'Set the shared catalog details, multi-language descriptions, images, and default Base Price here. Branch stock quantities and branch-specific price overrides are managed per branch from Inventory.'}
                    </div>
                </div>
                <Tag
                    color={isBranchScoped ? 'warning' : readOnly ? 'default' : 'processing'}
                    style={{ fontWeight: 700, borderRadius: 8, padding: '3px 12px', fontSize: 11.5 }}
                >
                    {isBranchScoped ? 'Branch Manager' : readOnly ? 'Read Only' : 'Super Admin'}
                </Tag>
            </div>

            <Form
                form={form}
                layout="vertical"
                onFinish={(values) => saveMutation.mutate(values)}
                initialValues={{ is_active: true, is_featured: false, is_returnable: true, weight_unit: 'kg' }}
            >
                <Row gutter={24}>
                    {/* Left Column: Core Details, Multi-Language Copy, Media */}
                    <Col xs={24} lg={15}>
                        {/* 1. Details & Translations Card */}
                        <div className="pf-card">
                            <div className="pf-card-head">
                                <div className="pf-card-title">
                                    <ShoppingOutlined style={{ color: '#D81B60', fontSize: 17 }} />
                                    <span>Product Information & Descriptions</span>
                                </div>
                                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                    Sinhala/Tamil optional — blank falls back to English
                                </Typography.Text>
                            </div>
                            <div className="pf-card-body">
                                <Tabs
                                    defaultActiveKey="en"
                                    className="pf-lang-tabs"
                                    items={[
                                        {
                                            key: 'en',
                                            label: (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                                                    🇬🇧 English
                                                    <Tag color="magenta" style={{ margin: 0, fontSize: 10, borderRadius: 6, padding: '0 6px' }}>
                                                        Primary
                                                    </Tag>
                                                </span>
                                            ),
                                            children: (
                                                <>
                                                    <Form.Item
                                                        label={<span style={{ fontWeight: 600 }}>Product Name (English)</span>}
                                                        name="name"
                                                        rules={[{ required: true, message: 'Name is required' }]}
                                                    >
                                                        <Input
                                                            disabled={catalogDisabled}
                                                            placeholder="e.g. Organic Whole Milk 1L"
                                                            style={{ borderRadius: 10, height: 40 }}
                                                            onChange={(e) => {
                                                                if (!slugTouched) {
                                                                    form.setFieldValue('slug', slugify(e.target.value));
                                                                }
                                                            }}
                                                        />
                                                    </Form.Item>
                                                    <Form.Item
                                                        label={<span style={{ fontWeight: 600 }}>Short Description</span>}
                                                        name="short_description"
                                                        rules={[{ max: 500, message: 'Max 500 characters' }]}
                                                    >
                                                        <TextArea
                                                            disabled={catalogDisabled}
                                                            rows={2}
                                                            style={{ borderRadius: 10 }}
                                                            placeholder="One-line summary shown in mobile listings and search snippets"
                                                        />
                                                    </Form.Item>
                                                    <Form.Item
                                                        label={<span style={{ fontWeight: 600 }}>Full Description</span>}
                                                        name="description"
                                                    >
                                                        <TextArea
                                                            disabled={catalogDisabled}
                                                            rows={4}
                                                            style={{ borderRadius: 10 }}
                                                            placeholder="Detailed product specifications, nutritional information, ingredients, or usage guidelines"
                                                        />
                                                    </Form.Item>
                                                </>
                                            ),
                                        },
                                        {
                                            key: 'si',
                                            label: (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                                                    🇱🇰 සිංහල
                                                    {watchedNameSi?.trim() ? (
                                                        <Tag color="success" style={{ margin: 0, fontSize: 10, borderRadius: 6, padding: '0 6px' }}>
                                                            ✓ Added
                                                        </Tag>
                                                    ) : (
                                                        <Tag style={{ margin: 0, fontSize: 10, borderRadius: 6, padding: '0 6px', color: '#94a3b8' }}>
                                                            Optional
                                                        </Tag>
                                                    )}
                                                </span>
                                            ),
                                            children: (
                                                <>
                                                    <Form.Item
                                                        label={<span style={{ fontWeight: 600 }}>නිෂ්පාදනයේ නම (Name in Sinhala)</span>}
                                                        name="name_si"
                                                        rules={[{ max: 255, message: 'Max 255 characters' }]}
                                                    >
                                                        <Input
                                                            disabled={catalogDisabled}
                                                            placeholder="උදා: කාබනික නැවුම් කිරි (1 ලීටර්)"
                                                            style={{ borderRadius: 10, height: 40 }}
                                                        />
                                                    </Form.Item>
                                                    <Form.Item
                                                        label={<span style={{ fontWeight: 600 }}>කෙටි සාරාංශය (Short Description)</span>}
                                                        name="short_description_si"
                                                        rules={[{ max: 500, message: 'Max 500 characters' }]}
                                                    >
                                                        <TextArea
                                                            disabled={catalogDisabled}
                                                            rows={2}
                                                            style={{ borderRadius: 10 }}
                                                            placeholder="ලැයිස්තුවේ පෙන්වන එක් පේළියක සාරාංශය"
                                                        />
                                                    </Form.Item>
                                                    <Form.Item
                                                        label={<span style={{ fontWeight: 600 }}>සම්පූර්ණ විස්තරය (Full Description)</span>}
                                                        name="description_si"
                                                    >
                                                        <TextArea
                                                            disabled={catalogDisabled}
                                                            rows={4}
                                                            style={{ borderRadius: 10 }}
                                                            placeholder="සම්පූර්ණ නිෂ්පාදන විස්තරය"
                                                        />
                                                    </Form.Item>
                                                </>
                                            ),
                                        },
                                        {
                                            key: 'ta',
                                            label: (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                                                    🇮🇳 தமிழ்
                                                    {watchedNameTa?.trim() ? (
                                                        <Tag color="success" style={{ margin: 0, fontSize: 10, borderRadius: 6, padding: '0 6px' }}>
                                                            ✓ Added
                                                        </Tag>
                                                    ) : (
                                                        <Tag style={{ margin: 0, fontSize: 10, borderRadius: 6, padding: '0 6px', color: '#94a3b8' }}>
                                                            Optional
                                                        </Tag>
                                                    )}
                                                </span>
                                            ),
                                            children: (
                                                <>
                                                    <Form.Item
                                                        label={<span style={{ fontWeight: 600 }}>தயாரிப்பு பெயர் (Name in Tamil)</span>}
                                                        name="name_ta"
                                                        rules={[{ max: 255, message: 'Max 255 characters' }]}
                                                    >
                                                        <Input
                                                            disabled={catalogDisabled}
                                                            placeholder="எ.கா. புதிய பால் (1 லி)"
                                                            style={{ borderRadius: 10, height: 40 }}
                                                        />
                                                    </Form.Item>
                                                    <Form.Item
                                                        label={<span style={{ fontWeight: 600 }}>குறுகிய விளக்கம் (Short Description)</span>}
                                                        name="short_description_ta"
                                                        rules={[{ max: 500, message: 'Max 500 characters' }]}
                                                    >
                                                        <TextArea
                                                            disabled={catalogDisabled}
                                                            rows={2}
                                                            style={{ borderRadius: 10 }}
                                                            placeholder="பட்டியலில் காட்டப்படும் ஒரு வரி சுருக்கம்"
                                                        />
                                                    </Form.Item>
                                                    <Form.Item
                                                        label={<span style={{ fontWeight: 600 }}>முழு விவரம் (Full Description)</span>}
                                                        name="description_ta"
                                                    >
                                                        <TextArea
                                                            disabled={catalogDisabled}
                                                            rows={4}
                                                            style={{ borderRadius: 10 }}
                                                            placeholder="முழு தயாரிப்பு விவரம்"
                                                        />
                                                    </Form.Item>
                                                </>
                                            ),
                                        },
                                    ]}
                                />

                                <Row gutter={16}>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            label={<span style={{ fontWeight: 600 }}>URL Slug</span>}
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
                                                disabled={catalogDisabled}
                                                placeholder="organic-whole-milk-1l"
                                                style={{ borderRadius: 10, height: 40 }}
                                                onChange={() => setSlugTouched(true)}
                                            />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={24} md={12}>
                                        <Form.Item
                                            label={
                                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                                                    <span style={{ fontWeight: 600 }}>Search Keywords</span>
                                                    <Button
                                                        size="small"
                                                        disabled={catalogDisabled}
                                                        icon={<ThunderboltOutlined />}
                                                        loading={suggestKeywordsMutation.isPending}
                                                        onClick={() => suggestKeywordsMutation.mutate()}
                                                        className="pf-ai-btn"
                                                    >
                                                        ✨ Suggest with AI
                                                    </Button>
                                                </div>
                                            }
                                            name="search_keywords"
                                            extra="Sinhala, Tamil, Singlish, English keywords shoppers use. Spelling variants are handled automatically."
                                        >
                                            <TextArea
                                                disabled={catalogDisabled}
                                                rows={2}
                                                style={{ borderRadius: 10 }}
                                                placeholder="e.g. kesel, කෙසෙල්, வாழைப்பழம், ambul kesel"
                                            />
                                        </Form.Item>
                                    </Col>
                                </Row>
                            </div>
                        </div>

                        {/* 2. Product Images Card */}
                        <div className="pf-card">
                            <div className="pf-card-head">
                                <div className="pf-card-title">
                                    <PictureOutlined style={{ color: '#D81B60', fontSize: 17 }} />
                                    <span>Product Gallery & Thumbnail</span>
                                    <span style={{ color: '#ff4d4f', fontSize: 16 }}>*</span>
                                </div>
                                <Tag color="blue" style={{ borderRadius: 6, fontWeight: 600 }}>
                                    Up to 5 images • Max 1MB
                                </Tag>
                            </div>
                            <div className="pf-card-body">
                                <Form.Item
                                    name="images"
                                    rules={[
                                        {
                                            validator: async () => {
                                                if (!gallery || gallery.length === 0) {
                                                    return Promise.reject(
                                                        new Error('Please upload at least one product image (thumbnail).')
                                                    );
                                                }
                                                return Promise.resolve();
                                            },
                                        },
                                    ]}
                                >
                                    <ImageGalleryUpload
                                        value={gallery}
                                        onChange={(newGallery) => {
                                            setGallery(newGallery);
                                            form.setFieldValue('images', newGallery);
                                            form.validateFields(['images']).catch(() => { });
                                        }}
                                        maxImages={5}
                                        maxFileSizeMB={1}
                                        disabled={catalogDisabled}
                                        productId={isEdit ? id : undefined}
                                    />
                                </Form.Item>
                            </div>
                        </div>
                    </Col>

                    {/* Right Column: Pricing, Weight, Organization & Live Mobile Preview */}
                    <Col xs={24} lg={9}>
                        {/* 1. Live Customer Mobile App Preview */}
                        <div className="pf-card" style={{ background: '#fafbfc', border: '1.5px dashed #cbd5e1' }}>
                            <div className="pf-card-head" style={{ background: '#ffffff' }}>
                                <div className="pf-card-title">
                                    <MobileOutlined style={{ color: '#D81B60', fontSize: 17 }} />
                                    <span>Live Customer App Preview</span>
                                </div>
                                <Tag color="magenta" style={{ fontWeight: 700, borderRadius: 6, margin: 0 }}>
                                    Real-time
                                </Tag>
                            </div>
                            <div className="pf-card-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                <div
                                    style={{
                                        width: '100%',
                                        maxWidth: 260,
                                        background: '#ffffff',
                                        borderRadius: 16,
                                        border: '1px solid #e2e8f0',
                                        boxShadow: '0 6px 18px rgba(15, 23, 42, 0.06)',
                                        overflow: 'hidden',
                                        position: 'relative',
                                    }}
                                >
                                    {/* Top Badges */}
                                    <div
                                        style={{
                                            position: 'absolute',
                                            top: 8,
                                            left: 8,
                                            right: 8,
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center',
                                            zIndex: 2,
                                        }}
                                    >
                                        {watchedCashback ? (
                                            <span
                                                style={{
                                                    background: '#059669',
                                                    color: '#ffffff',
                                                    fontSize: 10,
                                                    fontWeight: 800,
                                                    padding: '2px 7px',
                                                    borderRadius: 6,
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.12)',
                                                }}
                                            >
                                                ⚡ {watchedCashback}% CASHBACK
                                            </span>
                                        ) : <span />}
                                        {watchedFeatured && (
                                            <span
                                                style={{
                                                    background: '#f59e0b',
                                                    color: '#ffffff',
                                                    fontSize: 10,
                                                    fontWeight: 800,
                                                    padding: '2px 7px',
                                                    borderRadius: 6,
                                                }}
                                            >
                                                ★ Featured
                                            </span>
                                        )}
                                    </div>

                                    {/* Thumbnail Preview */}
                                    <div
                                        style={{
                                            width: '100%',
                                            height: 160,
                                            background: '#f8fafc',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            overflow: 'hidden',
                                            borderBottom: '1px solid #f1f5f9',
                                        }}
                                    >
                                        {primaryThumb ? (
                                            <img
                                                src={primaryThumb}
                                                alt="Preview"
                                                style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 8 }}
                                            />
                                        ) : (
                                            <div style={{ textAlign: 'center', color: '#94a3b8' }}>
                                                <PictureOutlined style={{ fontSize: 32 }} />
                                                <div style={{ fontSize: 11, marginTop: 4, fontWeight: 500 }}>No image uploaded</div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Content Info */}
                                    <div style={{ padding: 12 }}>
                                        <div
                                            style={{
                                                fontSize: 10.5,
                                                color: '#64748b',
                                                fontWeight: 700,
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.04em',
                                            }}
                                        >
                                            {categoryObj?.name || 'Category'}
                                        </div>
                                        <div
                                            style={{
                                                fontWeight: 700,
                                                fontSize: 13,
                                                color: '#0f172a',
                                                marginTop: 2,
                                                minHeight: 32,
                                                lineHeight: 1.25,
                                                display: '-webkit-box',
                                                WebkitLineClamp: 2,
                                                WebkitBoxOrient: 'vertical',
                                                overflow: 'hidden',
                                            }}
                                        >
                                            {watchedName || 'Organic Whole Milk 1L'}
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                                            <span
                                                style={{
                                                    fontSize: 10.5,
                                                    fontWeight: 700,
                                                    background: '#f1f5f9',
                                                    color: '#475569',
                                                    padding: '1px 6px',
                                                    borderRadius: 4,
                                                }}
                                            >
                                                {watchedWeight ? `${watchedWeight} ${watchedWeightUnit || 'kg'}` : '1 kg'}
                                            </span>
                                            {watchedPerishable && (
                                                <span
                                                    style={{
                                                        fontSize: 10,
                                                        fontWeight: 700,
                                                        background: '#fff7ed',
                                                        color: '#c2410c',
                                                        padding: '1px 6px',
                                                        borderRadius: 4,
                                                    }}
                                                >
                                                    Fresh
                                                </span>
                                            )}
                                        </div>

                                        <div
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                marginTop: 10,
                                                paddingTop: 8,
                                                borderTop: '1px solid #f1f5f9',
                                            }}
                                        >
                                            <div>
                                                <div style={{ fontSize: 9.5, color: '#94a3b8', fontWeight: 700 }}>PRICE</div>
                                                <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>
                                                    LKR {(Number(watchedPrice) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </div>
                                            </div>
                                            <div
                                                style={{
                                                    width: 30,
                                                    height: 30,
                                                    borderRadius: 8,
                                                    background: '#D81B60',
                                                    color: '#ffffff',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontSize: 16,
                                                    fontWeight: 700,
                                                }}
                                            >
                                                +
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <Typography.Text
                                    type="secondary"
                                    style={{ fontSize: 11.5, textAlign: 'center', marginTop: 12, display: 'block' }}
                                >
                                    Real-time mobile customer preview as shoppers will see it in the app.
                                </Typography.Text>
                            </div>
                        </div>

                        {/* 2. Weight & Measurement Card */}
                        <div className="pf-card">
                            <div className="pf-card-head">
                                <div className="pf-card-title">
                                    <InboxOutlined style={{ color: '#D81B60', fontSize: 17 }} />
                                    <span>Weight & Measurement</span>
                                    <span style={{ color: '#ff4d4f', fontSize: 16 }}>*</span>
                                </div>
                            </div>
                            <div className="pf-card-body">
                                <Row gutter={12}>
                                    <Col xs={14}>
                                        <Form.Item
                                            label={<span style={{ fontWeight: 600 }}>Weight / Size</span>}
                                            name="weight"
                                            tooltip="Used for delivery fee calculation and product size display"
                                            rules={[
                                                { required: true, message: 'Please enter weight' },
                                                {
                                                    type: 'number',
                                                    min: 0.001,
                                                    message: 'Weight must be greater than 0',
                                                },
                                            ]}
                                        >
                                            <InputNumber
                                                disabled={catalogDisabled}
                                                style={{ width: '100%', borderRadius: 10, height: 40 }}
                                                placeholder="e.g. 500 or 1.5"
                                                min={0.001}
                                                step={0.01}
                                                precision={3}
                                                parser={(val) => (val ? (val.replace(/[^0-9.]/g, '') as any) : '')}
                                                onKeyDown={(e) => {
                                                    if (
                                                        [
                                                            'Backspace',
                                                            'Delete',
                                                            'Tab',
                                                            'Escape',
                                                            'Enter',
                                                            'ArrowLeft',
                                                            'ArrowRight',
                                                            'ArrowUp',
                                                            'ArrowDown',
                                                            'Home',
                                                            'End',
                                                        ].includes(e.key) ||
                                                        e.ctrlKey ||
                                                        e.metaKey
                                                    ) {
                                                        return;
                                                    }
                                                    if (e.key === '.' && !(e.currentTarget as HTMLInputElement).value.includes('.')) {
                                                        return;
                                                    }
                                                    if (!/^[0-9]$/.test(e.key)) {
                                                        e.preventDefault();
                                                    }
                                                }}
                                            />
                                        </Form.Item>
                                    </Col>
                                    <Col xs={10}>
                                        <Form.Item
                                            label={<span style={{ fontWeight: 600 }}>Unit</span>}
                                            name="weight_unit"
                                            rules={[{ required: true, message: 'Select unit' }]}
                                        >
                                            <Select
                                                disabled={catalogDisabled}
                                                style={{ height: 40 }}
                                                options={[
                                                    { label: 'g (Grams)', value: 'g' },
                                                    { label: 'kg (Kilograms)', value: 'kg' },
                                                ]}
                                            />
                                        </Form.Item>
                                    </Col>
                                </Row>
                                <Typography.Text type="secondary" style={{ fontSize: 11.5, display: 'block', marginTop: -4 }}>
                                    💡 1kg ට අඩු භාණ්ඩ සඳහා <strong>Grams (g)</strong> ද, 1kg හෝ ඊට වැඩි නම් <strong>Kilograms (kg)</strong> ද තෝරන්න.
                                </Typography.Text>
                            </div>
                        </div>

                        {/* 3. Pricing & Incentives Card */}
                        <div className="pf-card">
                            <div className="pf-card-head">
                                <div className="pf-card-title">
                                    <DollarOutlined style={{ color: '#D81B60', fontSize: 17 }} />
                                    <span>Pricing & Commission</span>
                                </div>
                            </div>
                            <div className="pf-card-body">
                                <Form.Item
                                    label={<span style={{ fontWeight: 600 }}>Base Price (LKR)</span>}
                                    name="price"
                                    tooltip="Global catalog base price. Branches can override this with their local price in Inventory."
                                    extra="Default master price displayed across branches."
                                >
                                    <InputNumber
                                        disabled={catalogDisabled}
                                        min={0}
                                        step={0.01}
                                        precision={2}
                                        style={{ width: '100%', borderRadius: 10, height: 40 }}
                                        prefix="LKR"
                                        placeholder="0.00"
                                    />
                                </Form.Item>

                                <Form.Item
                                    label={<span style={{ fontWeight: 600 }}>Cashback (%)</span>}
                                    name="cashback_percentage"
                                    tooltip="Earned cashback % for this product. The app displays a Cash Back badge when set."
                                    extra="Leave empty to use the platform default rate."
                                >
                                    <InputNumber
                                        disabled={catalogDisabled}
                                        min={0}
                                        max={100}
                                        step={0.1}
                                        style={{ width: '100%', borderRadius: 10, height: 40 }}
                                        placeholder="Platform default"
                                    />
                                </Form.Item>

                                <Form.Item
                                    label={<span style={{ fontWeight: 600 }}>Referral Commission (%)</span>}
                                    name="referral_commission_percentage"
                                    tooltip="Paid to whoever referred the customer on this product. Leave empty for no commission."
                                >
                                    <InputNumber
                                        disabled={catalogDisabled}
                                        min={0}
                                        max={100}
                                        step={0.5}
                                        precision={2}
                                        style={{ width: '100%', borderRadius: 10, height: 40 }}
                                        suffix="%"
                                        placeholder="No commission"
                                    />
                                </Form.Item>
                            </div>
                        </div>

                        {/* 4. Categorization, SKU & Attributes Card */}
                        <div className="pf-card">
                            <div className="pf-card-head">
                                <div className="pf-card-title">
                                    <AppstoreOutlined style={{ color: '#D81B60', fontSize: 17 }} />
                                    <span>Organization & Attributes</span>
                                </div>
                            </div>
                            <div className="pf-card-body">
                                <Form.Item
                                    label={<span style={{ fontWeight: 600 }}>Category</span>}
                                    name="category_id"
                                    rules={[{ required: true, message: 'Category is required' }]}
                                >
                                    <Select
                                        disabled={catalogDisabled}
                                        placeholder="Select a category"
                                        allowClear
                                        showSearch
                                        optionFilterProp="label"
                                        style={{ height: 40 }}
                                        onChange={() => form.setFieldValue('subcategory_id', undefined)}
                                        options={rootCategories.map((c) => ({
                                            label: c.name,
                                            value: c.category_id,
                                        }))}
                                    />
                                </Form.Item>

                                <Form.Item
                                    label={<span style={{ fontWeight: 600 }}>Sub-category</span>}
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
                                        disabled={catalogDisabled || !selectedCategoryId || subcategories.length === 0}
                                        placeholder={
                                            selectedCategoryId
                                                ? 'Select a sub-category'
                                                : 'Select a category first'
                                        }
                                        allowClear
                                        showSearch
                                        optionFilterProp="label"
                                        style={{ height: 40 }}
                                        options={subcategories.map((c) => ({
                                            label: c.name,
                                            value: c.category_id,
                                        }))}
                                    />
                                </Form.Item>

                                <Form.Item
                                    label={<span style={{ fontWeight: 600 }}>SKU (Stock Keeping Unit)</span>}
                                    name="sku"
                                    rules={[{ required: true, whitespace: true, message: 'SKU is required' }]}
                                >
                                    <Input
                                        disabled={catalogDisabled}
                                        placeholder="e.g. MILK-ORG-1L"
                                        style={{ borderRadius: 10, height: 40 }}
                                        suffix={
                                            <Tooltip title="Generate unique SKU automatically using product name & category">
                                                <Button
                                                    type="primary"
                                                    size="small"
                                                    disabled={catalogDisabled}
                                                    icon={<StarFilled style={{ color: '#ffffff' }} />}
                                                    loading={suggestSkuMutation.isPending}
                                                    onClick={() => suggestSkuMutation.mutate()}
                                                    style={{
                                                        height: 26,
                                                        fontSize: 11,
                                                        fontWeight: 700,
                                                        borderRadius: 6,
                                                        background: '#f59e0b',
                                                        borderColor: '#f59e0b',
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: 4,
                                                    }}
                                                >
                                                    Auto SKU
                                                </Button>
                                            </Tooltip>
                                        }
                                    />
                                </Form.Item>

                                {/* Groups the Sribees Price app's tabs. Only the Super Admin
                                    sets it, so only they are made to choose. */}
                                <Form.Item
                                    label={<span style={{ fontWeight: 600 }}>Price Review</span>}
                                    name="price_review_level"
                                    tooltip="How often this product's price is re-checked in the Sribees Price app"
                                    rules={[{ required: isSuperAdmin, message: 'Choose how often the price is reviewed' }]}
                                >
                                    <Select
                                        disabled={catalogDisabled}
                                        placeholder="Select how often the price changes"
                                        style={{ height: 40 }}
                                        options={PRICE_REVIEW_LEVELS}
                                    />
                                </Form.Item>

                                {/* Interactive Feature Switch Tiles */}
                                <div style={{ marginTop: 20 }}>
                                    <div
                                        style={{
                                            fontSize: 13,
                                            fontWeight: 700,
                                            color: '#334155',
                                            marginBottom: 12,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                        }}
                                    >
                                        <SettingOutlined />
                                        <span>Product Visibility & Policies</span>
                                    </div>

                                    {/* 1. Active / Visibility */}
                                    <Form.Item name="is_active" valuePropName="checked" noStyle>
                                        <FeatureTile
                                            icon={<EyeOutlined />}
                                            title={isBranchScoped ? 'Branch Visibility' : 'Catalog Status'}
                                            description={
                                                isBranchScoped
                                                    ? "Visible in this branch's mobile app catalog"
                                                    : "Active and available across the platform"
                                            }
                                            activeLabel={isBranchScoped ? 'Visible' : 'Active'}
                                            inactiveLabel={isBranchScoped ? 'Hidden' : 'Inactive'}
                                            activeColor="#059669"
                                            activeBg="#f0fdf4"
                                            disabled={readOnly}
                                        />
                                    </Form.Item>

                                    {/* 2. Featured */}
                                    <Form.Item name="is_featured" valuePropName="checked" noStyle>
                                        <FeatureTile
                                            icon={<StarOutlined />}
                                            title="Featured Product"
                                            description="Showcase on home screen banner and hero feed"
                                            activeLabel="Featured"
                                            inactiveLabel="Standard"
                                            activeColor="#d97706"
                                            activeBg="#fffbeb"
                                            disabled={catalogDisabled}
                                        />
                                    </Form.Item>

                                    {/* 3. Perishable */}
                                    <Form.Item name="is_perishable" valuePropName="checked" noStyle>
                                        <FeatureTile
                                            icon={<ThunderboltOutlined />}
                                            title="Perishable Stock"
                                            description="Short shelf life — prioritized for Quick Sale deals"
                                            activeLabel="Perishable"
                                            inactiveLabel="Shelf-stable"
                                            activeColor="#ea580c"
                                            activeBg="#fff7ed"
                                            disabled={catalogDisabled}
                                        />
                                    </Form.Item>

                                    {/* 4. Returnable */}
                                    <Form.Item name="is_returnable" valuePropName="checked" noStyle>
                                        <FeatureTile
                                            icon={<RollbackOutlined />}
                                            title="Customer Returns"
                                            description="Allow customers to request returns within policy"
                                            activeLabel="Returnable"
                                            inactiveLabel="Final Sale"
                                            activeColor="#2563eb"
                                            activeBg="#eff6ff"
                                            disabled={catalogDisabled}
                                        />
                                    </Form.Item>
                                </div>
                            </div>
                        </div>
                    </Col>
                </Row>

                {/* Floating Bottom Sticky Action Dock */}
                <div className="pf-floating-dock" hidden={readOnly}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <Tag
                            color={isEdit ? 'blue' : 'green'}
                            style={{ margin: 0, fontWeight: 700, fontSize: 12, borderRadius: 8, padding: '2px 10px' }}
                        >
                            {isEdit ? 'Edit Mode' : 'New Product'}
                        </Tag>
                        <span style={{ fontSize: 12.5, color: '#64748b', fontWeight: 500 }}>
                            Tip: Press <kbd style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 6px', fontSize: 11, fontWeight: 700 }}>Ctrl + S</kbd> to quick save
                        </span>
                    </div>
                    <Space size={12}>
                        <Button
                            size="large"
                            style={{ borderRadius: 10, fontWeight: 600, height: 42, color: '#475569' }}
                            onClick={() => navigate('/products')}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="primary"
                            htmlType="submit"
                            size="large"
                            className="pf-save-btn"
                            loading={saveMutation.isPending}
                            icon={<SaveOutlined />}
                        >
                            {isBranchScoped
                                ? 'Update Branch Visibility'
                                : isEdit
                                    ? 'Save Changes'
                                    : 'Publish Product'}
                        </Button>
                    </Space>
                </div>
            </Form>
        </div>
    );
};

export default ProductForm;
