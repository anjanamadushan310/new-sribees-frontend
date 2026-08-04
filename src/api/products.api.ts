/**
 * Admin Product API
 * Targets the admin catalog surface: /api/v1/admin/products
 * (global catalog — all products, active and inactive; no branch context).
 *
 * The backend's format_product() returns snake_case with a nested category
 * object and an images array of objects; the types below match that wire shape.
 */
import apiClient from './client';

export interface ProductImage {
    image_id: string;
    image_url: string;
    alt_text?: string | null;
    is_primary: boolean;
    sort_order: number;
}

export interface ProductCategoryRef {
    category_id: string;
    name: string;
    slug: string;
    image_url?: string | null;
}

// Product as returned by the admin list/detail endpoints.
// `price` / `stock_quantity` are the GLOBAL template values here — the admin
// catalog has no branch context. Per-branch prices live in the Inventory API.
export interface AdminProduct {
    product_id: string;
    name: string;
    slug: string;
    description?: string | null;
    short_description?: string | null;
    sku?: string | null;
    price: number;
    compare_at_price?: number | null;
    stock_quantity: number;
    is_active: boolean;
    is_featured: boolean;
    category_id: string | null;
    subcategory_id: string | null;
    category: ProductCategoryRef | null;
    subcategory: ProductCategoryRef | null;
    images: ProductImage[];
    created_at?: string | null;
    updated_at?: string | null;
}

// Create/update payload — matches ProductCreate / ProductUpdate on the backend
export interface ProductPayload {
    name: string;
    slug: string;
    description?: string | null;
    short_description?: string | null;
    sku?: string | null;
    price: number;
    compare_at_price?: number | null;
    cost_price?: number | null;
    category_id?: string | null;
    // Must be a child of category_id — the backend rejects a mismatched pair.
    subcategory_id?: string | null;
    stock_quantity?: number;
    low_stock_threshold?: number;
    is_active?: boolean;
    is_featured?: boolean;
}

export interface ProductListParams {
    page?: number;
    limit?: number;
    search?: string;
    category_id?: string;
    subcategory_id?: string;
    is_active?: boolean;
    sort_by?: 'created_at' | 'price' | 'name' | 'view_count';
    sort_order?: 'asc' | 'desc';
}

export interface ProductListResult {
    products: AdminProduct[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
}

interface ProductListWire {
    success: boolean;
    data: {
        products: AdminProduct[];
        pagination: { total: number; page: number; limit: number; total_pages: number };
    };
}

interface ProductDetailWire {
    success: boolean;
    data: AdminProduct;
}

export interface ImageLinkPayload {
    image_url: string;
    alt_text?: string | null;
    is_primary?: boolean;
    sort_order?: number;
}

export const productsApi = {
    list: async (params?: ProductListParams): Promise<ProductListResult> => {
        // Drop empty values so we don't send blank query params.
        const clean: Record<string, unknown> = {};
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null && v !== '') clean[k] = v;
            });
        }
        const res = await apiClient.get<ProductListWire>('/admin/products', { params: clean });
        return {
            products: res.data.data.products,
            ...res.data.data.pagination,
        };
    },

    getById: async (id: string): Promise<AdminProduct> => {
        const res = await apiClient.get<ProductDetailWire>(`/admin/products/${id}`);
        return res.data.data;
    },

    create: async (payload: ProductPayload): Promise<AdminProduct> => {
        const res = await apiClient.post<ProductDetailWire>('/admin/products', payload);
        return res.data.data;
    },

    update: async (id: string, payload: Partial<ProductPayload>): Promise<AdminProduct> => {
        const res = await apiClient.put<ProductDetailWire>(`/admin/products/${id}`, payload);
        return res.data.data;
    },

    remove: async (id: string): Promise<void> => {
        await apiClient.delete(`/admin/products/${id}`);
    },

    // --- Images -------------------------------------------------------------

    /** Upload a raw file to storage; returns the hosted URL (not yet linked). */
    uploadImage: async (file: File): Promise<string> => {
        const formData = new FormData();
        formData.append('file', file);
        const res = await apiClient.post<{ success: boolean; data: { image_url: string } }>(
            '/admin/products/upload-image',
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        return res.data.data.image_url;
    },

    /** Link an uploaded image URL to a product. */
    linkImage: async (productId: string, payload: ImageLinkPayload): Promise<ProductImage> => {
        const res = await apiClient.post<{ success: boolean; data: ProductImage }>(
            `/admin/products/${productId}/images`,
            payload
        );
        return res.data.data;
    },

    /** Detach an image from a product. */
    removeImage: async (productId: string, imageId: string): Promise<void> => {
        await apiClient.delete(`/admin/products/${productId}/images/${imageId}`);
    },

    /** Persist a primary-thumbnail change for an already-linked image. */
    setPrimaryImage: async (productId: string, imageId: string): Promise<ProductImage> => {
        const res = await apiClient.patch<{ success: boolean; data: ProductImage }>(
            `/admin/products/${productId}/images/${imageId}/primary`
        );
        return res.data.data;
    },
};
