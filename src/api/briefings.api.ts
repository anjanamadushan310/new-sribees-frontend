/**
 * Admin AI Briefings API — what a branch tells the AI shopping assistant.
 * Targets /api/v1/admin/assistant-briefings, branch-scoped on the server:
 * a Branch Manager only ever writes their own branch's briefings and sees the
 * network-wide ones read-only. Only a Super Admin writes network-wide ones.
 */
import apiClient from './client';

/**
 * 'relevant' — mentioned only when it bears on what the customer asked
 *              (a delivery disruption, when they ask about an order).
 * 'announce' — told once to each customer, next to the answer to whatever
 *              they asked (an event, an invitation).
 */
export type BriefingMode = 'relevant' | 'announce';

/** Derived server-side from is_active and the window. */
export type BriefingStatus = 'live' | 'scheduled' | 'ended' | 'paused';

/** 'fallback' = the AI summary was unavailable; the digest is the note's opening. */
export type DigestSource = 'ai' | 'manager' | 'fallback';

export interface Briefing {
    briefing_id: string;
    branch_id: string | null;
    branch_name: string | null;
    is_network_wide: boolean;
    title: string;
    source_filename: string | null;
    /** What the manager uploaded or typed, kept for the record. */
    source_text: string;
    /** What the assistant actually reads on every turn. */
    digest: string;
    digest_source: DigestSource;
    mode: BriefingMode;
    starts_at: string;
    ends_at: string;
    is_active: boolean;
    status: BriefingStatus;
    /** How many replies have carried it so far. */
    mentions: number;
    /** False for network-wide rows seen by a Branch Manager. */
    can_edit: boolean;
    created_at: string | null;
    updated_at: string | null;
}

export interface BriefingLimits {
    digest_max: number;
    upload_max_bytes: number;
    max_live_branch: number;
    max_live_network: number;
    max_window_days: number;
}

export interface BriefingListResult {
    items: Briefing[];
    scope: { is_super_admin: boolean; branch_id: string | null };
    limits: BriefingLimits;
}

/** The AI's reading of a note, before anything is saved. */
export interface BriefingDraft {
    title: string;
    mode: BriefingMode;
    digest: string;
    digest_source: DigestSource;
    warnings: string[];
    source_text: string;
    source_filename: string | null;
}

export interface BriefingPayload {
    title: string;
    source_text: string;
    source_filename?: string | null;
    digest: string;
    digest_source: DigestSource;
    mode: BriefingMode;
    /** ISO with offset. */
    starts_at: string;
    ends_at: string;
    /** Super Admin only; ignored for scoped admins. null = every branch. */
    branch_id?: string | null;
}

export type BriefingUpdate = Partial<
    Pick<Briefing, 'title' | 'digest' | 'mode' | 'starts_at' | 'ends_at' | 'is_active'>
>;

interface Wire<T> {
    success: boolean;
    data: T;
}

const BASE = '/admin/assistant-briefings';

export const briefingsApi = {
    list: async (branchId?: string): Promise<BriefingListResult> => {
        const res = await apiClient.get<Wire<BriefingListResult>>(BASE, {
            params: branchId ? { branch_id: branchId } : undefined,
        });
        return res.data.data;
    },

    /** One AI call; saves nothing. Send a file or text, not both. */
    prepare: async (input: { file?: File; text?: string }): Promise<BriefingDraft> => {
        const form = new FormData();
        if (input.file) form.append('file', input.file);
        else form.append('text', input.text ?? '');
        const res = await apiClient.post<Wire<BriefingDraft>>(`${BASE}/prepare`, form, {
            headers: { 'Content-Type': 'multipart/form-data' },
            timeout: 60_000,
        });
        return res.data.data;
    },

    create: async (payload: BriefingPayload): Promise<Briefing> => {
        const res = await apiClient.post<Wire<Briefing>>(BASE, payload);
        return res.data.data;
    },

    update: async (id: string, payload: BriefingUpdate): Promise<Briefing> => {
        const res = await apiClient.patch<Wire<Briefing>>(`${BASE}/${id}`, payload);
        return res.data.data;
    },

    remove: async (id: string): Promise<void> => {
        await apiClient.delete(`${BASE}/${id}`);
    },
};
