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
    /** Rupees of order value (excluding delivery) per loyalty point. */
    loyalty_spend_per_point: number;
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

/**
 * The Lottie splash the mobile app plays (/admin/settings/splash-animation).
 *
 * Installed apps pick a change up through /app/app-config: they download the
 * new file on their next launch or resume and play it from the launch after
 * that — a splash cannot wait on the network, so it only plays what is
 * already on the phone.
 */
export interface SplashAnimation {
    animation_url: string;
    sha256: string;
    bytes: number;
    width: number;
    height: number;
    frame_rate: number;
    duration_ms: number;
    background_color: string;
    filename: string | null;
    uploaded_at: string;
    is_active: boolean;
    updated_at: string | null;
}

interface SplashWire {
    success: boolean;
    data: SplashAnimation | null;
}

export const splashAnimationApi = {
    get: async (): Promise<SplashAnimation | null> => {
        const res = await apiClient.get<SplashWire>('/admin/settings/splash-animation');
        return res.data.data;
    },

    upload: async (file: File, backgroundColor: string): Promise<SplashAnimation | null> => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('background_color', backgroundColor);
        const res = await apiClient.post<SplashWire>(
            '/admin/settings/splash-animation',
            formData,
            { headers: { 'Content-Type': 'multipart/form-data' } }
        );
        return res.data.data;
    },

    update: async (
        payload: { is_active?: boolean; background_color?: string }
    ): Promise<SplashAnimation | null> => {
        const res = await apiClient.patch<SplashWire>('/admin/settings/splash-animation', payload);
        return res.data.data;
    },

    remove: async (): Promise<void> => {
        await apiClient.delete('/admin/settings/splash-animation');
    },
};
