/**
 * Admin Banners API — mobile home-screen carousel.
 * Targets /api/v1/admin/banners — branch-scoped on the server via
 * inject_branch_filter: Branch/Marketing Managers only ever see and modify
 * their own branch's banners, plus the read-only platform-wide ones.
 */
import apiClient from './client';

export interface Banner {
    banner_id: string;
    title: string;
    subtitle: string | null;
    image_url: string | null;
    link_type: 'category' | 'product' | null;
    target_id: string | null;
    branch_id: string | null;
    /** branch_id === null — shown in every branch, editable by Super Admin only. */
    is_platform_wide: boolean;
    sort_order: number;
    is_active: boolean;
    created_at: string | null;
}

export interface BannerScope {
    is_super_admin: boolean;
    branch_id: string | null;
}

export interface BannerListResult {
    banners: Banner[];
    scope: BannerScope;
}

export interface BannerPayload {
    title: string;
    subtitle?: string | null;
    image_url?: string | null;
    link_type?: 'category' | 'product' | null;
    target_id?: string | null;
    sort_order?: number;
    is_active?: boolean;
    /** Super Admin only; ignored by the server for scoped admins. */
    branch_id?: string | null;
}

interface ListWire {
    success: boolean;
    data: { banners: Banner[]; scope: BannerScope };
}

interface MutationWire {
    success: boolean;
    data: Banner;
    message: string;
}

export const bannersApi = {
    list: async (branchId?: string): Promise<BannerListResult> => {
        const res = await apiClient.get<ListWire>('/admin/banners', {
            params: branchId ? { branch_id: branchId } : undefined,
        });
        return res.data.data;
    },

    uploadImage: async (file: File): Promise<string> => {
        const formData = new FormData();
        formData.append('file', file);
        const res = await apiClient.post<{ success: boolean; data: { image_url: string } }>(
            '/admin/banners/upload-image',
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        return res.data.data.image_url;
    },

    create: async (payload: BannerPayload): Promise<Banner> => {
        const res = await apiClient.post<MutationWire>('/admin/banners', payload);
        return res.data.data;
    },

    update: async (id: string, payload: Partial<BannerPayload>): Promise<Banner> => {
        const res = await apiClient.put<MutationWire>(`/admin/banners/${id}`, payload);
        return res.data.data;
    },

    remove: async (id: string): Promise<void> => {
        await apiClient.delete(`/admin/banners/${id}`);
    },
};
