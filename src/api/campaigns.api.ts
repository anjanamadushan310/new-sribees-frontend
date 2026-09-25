/**
 * Push Campaigns API — marketing notifications to customers' phones.
 * Targets /api/v1/admin/notification-campaigns. Branch-scoped on the server:
 * a Marketing Manager's campaign reaches the customers their branch has
 * served; only a Super Admin can address every customer (branch_id null).
 *
 * Copy is written once per language. English is required; Sinhala and Tamil
 * fall back to it, per field, for a customer whose app is in that language.
 */
import apiClient from './client';

export type CampaignCategory = 'offers' | 'promotions' | 'general';
export type CampaignStatus = 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';
export type CampaignLinkType = 'product' | 'offers';
export type Lang = 'en' | 'si' | 'ta';

export interface LocalizedText {
    en: string;
    si?: string | null;
    ta?: string | null;
}

export interface Campaign {
    campaign_id: string;
    category: CampaignCategory;
    title: LocalizedText;
    message: LocalizedText;
    image_url: string | null;
    link_type: CampaignLinkType | null;
    link_value: string | null;
    /** null = every customer. */
    branch_id: string | null;
    branch_name: string | null;
    status: CampaignStatus;
    scheduled_at: string | null;
    started_at: string | null;
    finished_at: string | null;
    /** Customers who got it in their in-app feed. */
    recipients: number;
    /** Devices it was pushed to, and how FCM answered. */
    devices: number;
    delivered: number;
    failed: number;
    /** Customers (not taps) who opened it. */
    opened: number;
    /** opened / recipients; null until anyone has received it. */
    open_rate: number | null;
    error: string | null;
    created_by_name: string | null;
    created_at: string | null;
}

export interface CampaignScope {
    is_super_admin: boolean;
    branch_id: string | null;
}

export interface CampaignListResult {
    campaigns: Campaign[];
    total: number;
    page: number;
    limit: number;
    scope: CampaignScope;
}

export interface Audience {
    /** Live customers with this category switched on. */
    customers: number;
    /** Customers in the audience who switched this category off. */
    opted_out: number;
    devices: number;
    devices_by_language: Record<Lang, number>;
    branch_id: string | null;
}

export interface CampaignPayload {
    category: CampaignCategory;
    title: LocalizedText;
    message: LocalizedText;
    /** The stored path returned by uploadImage. */
    image_url?: string | null;
    link_type?: CampaignLinkType | null;
    link_value?: string | null;
    /** Super Admin only. null/omitted = every customer. */
    branch_id?: string | null;
    /** ISO with offset; omit to send now. */
    scheduled_at?: string | null;
}

export const campaignsApi = {
    list: async (page = 1, limit = 20): Promise<CampaignListResult> => {
        const res = await apiClient.get<{ success: boolean; data: CampaignListResult }>(
            '/admin/notification-campaigns',
            { params: { page, limit } },
        );
        return res.data.data;
    },

    audience: async (category: CampaignCategory, branchId?: string | null): Promise<Audience> => {
        const res = await apiClient.get<{ success: boolean; data: Audience }>(
            '/admin/notification-campaigns/audience',
            { params: branchId ? { category, branch_id: branchId } : { category } },
        );
        return res.data.data;
    },

    create: async (payload: CampaignPayload): Promise<Campaign> => {
        const res = await apiClient.post<{ success: boolean; data: Campaign }>(
            '/admin/notification-campaigns',
            payload,
        );
        return res.data.data;
    },

    cancel: async (id: string): Promise<Campaign> => {
        const res = await apiClient.post<{ success: boolean; data: Campaign }>(
            `/admin/notification-campaigns/${id}/cancel`,
        );
        return res.data.data;
    },

    /** Returns the display URL and the path to send back as image_url. */
    uploadImage: async (file: File): Promise<{ image_url: string; path: string }> => {
        const formData = new FormData();
        formData.append('file', file);
        const res = await apiClient.post<{ success: boolean; data: { image_url: string; path: string } }>(
            '/admin/notification-campaigns/upload-image',
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } },
        );
        return res.data.data;
    },
};
