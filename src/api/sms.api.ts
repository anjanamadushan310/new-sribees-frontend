/**
 * SMS (Super Admin) — the provider that texts sign-in codes, its credit,
 * how many went out today against the daily total, and that total itself.
 * Targets /api/v1/admin/sms.
 */
import apiClient from './client';

export interface SmsRules {
    resend_wait_seconds: number;
    per_number_per_hour: number;
    per_number_per_day: number;
    per_address_per_hour: number;
    code_valid_seconds: number;
    wrong_tries_per_code: number;
}

export interface SmsOverview {
    /** "console" = texts only reach the server log. */
    provider: string;
    is_live: boolean;
    /** Names of missing server settings, never values. */
    missing: string[];
    sender_id: string | null;
    balance: number | null;
    balance_error: string | null;
    daily_limit: number;
    sent_today: number;
    remaining_today: number;
    /** Newest first, Sri Lankan days. */
    history: { date: string; sent: number }[];
    rules: SmsRules;
}

export const smsApi = {
    overview: async (): Promise<SmsOverview> => {
        const res = await apiClient.get<{ data: SmsOverview }>('/admin/sms');
        return res.data.data;
    },

    setDailyLimit: async (dailyLimit: number): Promise<SmsOverview> => {
        const res = await apiClient.put<{ data: SmsOverview }>('/admin/sms/settings', { daily_limit: dailyLimit });
        return res.data.data;
    },
};
