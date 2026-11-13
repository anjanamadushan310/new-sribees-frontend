/**
 * App Users (Super Admin) — who has the customer app open, on which version,
 * and how long each install uses it per day since it was downloaded. The web
 * store (www.sribeesonline.com) reports too, with platform 'web': one row per
 * browser. Targets /api/v1/admin/app-usage, fed by the heartbeat.
 */
import apiClient from './client';

/** The page's filter: phone app, web store, or both (undefined). */
export type UsageChannel = 'app' | 'web';

export interface AppInstall {
    device_id: string;
    user_id: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    /** No customer has signed in on this install yet. */
    is_guest: boolean;
    platform: 'android' | 'ios' | 'web';
    /** Web only: "Chrome on Windows", read by the server from the browser. */
    browser?: string | null;
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
    channel?: UsageChannel | null;
    /** Online within the chosen channel. */
    online_count: number;
    /** Online by channel, whatever the filter. */
    online_app_count?: number;
    online_web_count?: number;
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
    overview: async (channel?: UsageChannel): Promise<AppUsageOverview> => {
        const res = await apiClient.get<{ data: AppUsageOverview }>('/admin/app-usage', {
            params: channel ? { channel } : undefined,
        });
        return res.data.data;
    },

    installs: async (params: {
        search?: string;
        channel?: UsageChannel;
        page: number;
        limit: number;
    }): Promise<AppInstallList> => {
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
