/**
 * Customer activity log (Super Admin) — what a shopper did in the app or on
 * the web store: screens, products, photo swipes, searches, cart changes.
 * A customer's timeline includes what their phone did as a guest before they
 * signed in. Targets GET /api/v1/admin/activity.
 */
import apiClient from './client';

export interface ActivityEvent {
    id: number;
    event: string;
    screen: string | null;
    product_id: string | null;
    product_name: string | null;
    category_id: string | null;
    category_name: string | null;
    props: Record<string, string | number | boolean | null>;
    device_id: string;
    platform: 'android' | 'ios' | 'web';
    app_version: string | null;
    session_id: string | null;
    /** Sent before anyone signed in on that install. */
    is_guest: boolean;
    occurred_at: string;
    /** "2026-11-18 22:04:17", Asia/Colombo. */
    occurred_at_lk: string;
}

export interface ActivityPage {
    events: ActivityEvent[];
    has_more: boolean;
    next_before_id: number | null;
}

export type ActivityWho = { userId: string; deviceId?: never } | { deviceId: string; userId?: never };

export const activityApi = {
    timeline: async (who: ActivityWho, beforeId?: number | null, limit = 200): Promise<ActivityPage> => {
        const response = await apiClient.get('/admin/activity', {
            params: {
                user_id: who.userId,
                device_id: who.deviceId,
                before_id: beforeId ?? undefined,
                limit,
            },
        });
        return response.data.data;
    },
};
