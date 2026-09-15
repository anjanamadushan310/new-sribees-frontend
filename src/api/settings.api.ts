/**
 * Admin Platform Settings API (/api/v1/admin/settings) — Super Admin only.
 * Wraps checkout pricing + mobile-app configuration.
 *
 * Note: order_tax_rate_percent is a percentage (15 = 15%).
 *
 * There is no delivery fee here. The delivery charge is SribeesExpress's quote
 * for each parcel, priced from the fulfilling branch to the customer's postal
 * city; the backend refuses a `flat_delivery_fee` field outright.
 */
import apiClient from './client';

export interface PlatformSettings {
    order_tax_rate_percent: number;
    splash_video_url: string | null;
}

export type PlatformSettingsUpdate = Partial<PlatformSettings>;

interface SettingsWire {
    success: boolean;
    data: PlatformSettings;
}

export const settingsApi = {
    get: async (): Promise<PlatformSettings> => {
        const res = await apiClient.get<SettingsWire>('/admin/settings');
        return res.data.data;
    },

    update: async (payload: PlatformSettingsUpdate): Promise<PlatformSettings> => {
        const res = await apiClient.patch<SettingsWire>('/admin/settings', payload);
        return res.data.data;
    },
};
