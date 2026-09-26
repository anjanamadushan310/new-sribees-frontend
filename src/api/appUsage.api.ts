/**
 * App Users (Super Admin) — who has the customer app open, on which version,
 * and how long each install uses it per day since it was downloaded.
 * Targets /api/v1/admin/app-usage, fed by the app's heartbeat.
 */
import apiClient from './client';

export interface AppInstall {
    device_id: string;
    user_id: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    /** No customer has signed in on this install yet. */
    is_guest: boolean;
    platform: 'android' | 'ios';
    app_version: string | null;
    build_number: string | null;
    /** null when Settings → App Settings has no latest version set. */
    is_latest_version: boolean | null;
    /** The phone's own install time (the download date). */
    installed_at: string | null;
    /** True when the phone gave no install time and the first heartbeat stands in. */
    installed_at_is_estimate: boolean;
    first_seen_at: string | null;
    last_seen_at: string | null;
    is_online: boolean;
    today_seconds: number;
    total_seconds: number;
    days_active: number;
}

export interface AppUsageOverview {
    online_count: number;
    online: AppInstall[];
    total_installs: number;
    active_today: number;
    seconds_today: number;
    latest_version: string | null;
    versions: { version: string; installs: number }[];
    online_window_minutes: number;
    generated_at: string;
}

export interface AppInstallList {
    installs: AppInstall[];
    total: number;
    page: number;
    limit: number;
}

export interface AppUsageDay {
    date: string;
    seconds: number;
    opens: number;
    /** False for days before the install's first heartbeat: never measured. */
    measured: boolean;
}

export interface AppInstallHistory {
    install: AppInstall;
    days: AppUsageDay[];
}

export const appUsageApi = {
    overview: async (): Promise<AppUsageOverview> => {
        const res = await apiClient.get<{ data: AppUsageOverview }>('/admin/app-usage');
        return res.data.data;
    },

    installs: async (params: { search?: string; page: number; limit: number }): Promise<AppInstallList> => {
        const res = await apiClient.get<{ data: AppInstallList }>('/admin/app-usage/installs', { params });
        return res.data.data;
    },

    history: async (deviceId: string): Promise<AppInstallHistory> => {
        const res = await apiClient.get<{ data: AppInstallHistory }>(
            `/admin/app-usage/installs/${encodeURIComponent(deviceId)}`,
        );
        return res.data.data;
    },
};
