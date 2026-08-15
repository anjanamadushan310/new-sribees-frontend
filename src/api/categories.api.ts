/**
 * Admin Category API
 * Targets the admin catalog surface: /api/v1/admin/categories
 * (list is admin-only and includes inactive categories).
 *
 * The backend serializes categories as snake_case dicts (not by Pydantic
 * alias), so the wire shape maps 1:1 to the Category type below.
 */
import apiClient from './client';

/**
 * A category row. The hierarchy is flat-with-a-pointer: `parent_category_id`
 * null means top-level, set means it's a sub-category of that category. The
 * backend caps this at two levels.
 */
export interface Category {
    category_id: string;
    /** English copy — what customers see when their language has no translation. */
    name: string;
    slug: string;
    description?: string | null;
    /**
     * Per-language translations, returned raw by the admin endpoints so every
     * language is editable on one form. null = not translated yet.
     */
    name_si?: string | null;
    name_ta?: string | null;
    description_si?: string | null;
    description_ta?: string | null;
    image_url?: string | null;
    parent_category_id?: string | null;
    is_active: boolean;
    product_count?: number;
    /** Client-side only: populated when nesting rows for a tree table. */
    children?: Category[];
}

export interface CategoryPayload {
    name: string;
    slug: string;
    description?: string | null;
    // Send null (not "") to clear a translation, so the backend treats it as
    // absent and customers fall back to the English copy.
    name_si?: string | null;
    name_ta?: string | null;
    description_si?: string | null;
    description_ta?: string | null;
    /** Top-level categories only — the API rejects an image on a sub-category. */
    image_url?: string | null;
    parent_category_id?: string | null;
    is_active: boolean;
}

interface CategoryListWire {
    success: boolean;
    data: { categories: Category[] };
}

interface CategoryMutationWire {
    success: boolean;
    data: Category;
    message: string;
}

export const categoriesApi = {
    list: async (): Promise<Category[]> => {
        const res = await apiClient.get<CategoryListWire>('/admin/categories');
        return res.data.data.categories;
    },

    /**
     * Upload a category tile image and get back its hosted URL.
     *
     * The URL is then sent as `image_url` on create/update, so an image can be
     * chosen before the category itself exists.
     */
    uploadImage: async (file: File): Promise<string> => {
        const formData = new FormData();
        formData.append('file', file);
        const res = await apiClient.post<{ success: boolean; data: { image_url: string } }>(
            '/admin/categories/upload-image',
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        return res.data.data.image_url;
    },

    create: async (payload: CategoryPayload): Promise<Category> => {
        const res = await apiClient.post<CategoryMutationWire>('/admin/categories', payload);
        return res.data.data;
    },

    update: async (id: string, payload: Partial<CategoryPayload>): Promise<Category> => {
        const res = await apiClient.put<CategoryMutationWire>(`/admin/categories/${id}`, payload);
        return res.data.data;
    },

    remove: async (id: string): Promise<void> => {
        await apiClient.delete(`/admin/categories/${id}`);
    },
};
