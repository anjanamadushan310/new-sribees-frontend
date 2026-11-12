/**
 * Staff phones (Sribees New Orders app, P9): which staff phones would ring
 * for a new order, and which staff registered none.
 * Targets GET /api/v1/admin/push-tokens. Super admins see every branch; a
 * branch manager sees their own branch (the server decides).
 */
import apiClient from './client';

/** Why a phone would stay quiet; null = it rings. */
export type PhoneProblem =
    | 'notifications_off'
    | 'channel_off'
    | 'channel_silent'
    | 'battery_restricted'
    | 'not_seen'
    | 'unknown';

export interface StaffPhone {
    device_id: string;
    admin_id: string;
    full_name: string;
    role: string;
    branch_id: string | null;
    branch_name: string | null;
    platform: string | null;
    device_model: string | null;
    app_version: string | null;
    notifications_on: boolean | null;
    channel_state: 'on' | 'silent' | 'off' | null;
    background_restricted: boolean | null;
    last_seen_at: string | null;
    /** null = an app older than 0.8.0 that does not report. */
    can_ring: boolean | null;
    problem: PhoneProblem | null;
}

export interface StaffWithoutPhone {
    admin_id: string;
    full_name: string;
    role: string;
    branch_id: string | null;
    branch_name: string | null;
}

export interface StaffPhones {
    phones: StaffPhone[];
    staff_without_phone: StaffWithoutPhone[];
}

export const staffPhonesApi = {
    list: async (): Promise<StaffPhones> => {
        const res = await apiClient.get<{ data: StaffPhones }>('/admin/push-tokens');
        return res.data.data;
    },
};
