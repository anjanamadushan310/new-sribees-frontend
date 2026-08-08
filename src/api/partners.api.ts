/**
 * Admin Partner API (/api/v1/admin/partners) — Super Admin only.
 * CRUD for the professional referral team, plus per-partner commission
 * ledger and out-of-band settlement tracking (no wallet — see mark-paid).
 */
import apiClient from './client';

export interface AdminPartner {
    partner_id: string;
    email: string;
    full_name: string;
    phone: string | null;
    referral_code: string | null;
    parent_partner_id: string | null;
    recruited_by: string | null;
    is_active: boolean;
    last_login: string | null;
    created_at: string | null;
    claimable_total: number;
    paid_total: number;
}

export interface CreatePartnerPayload {
    email: string;
    password: string;
    full_name: string;
    phone?: string | null;
}

export interface UpdatePartnerPayload {
    full_name?: string;
    phone?: string | null;
    password?: string; // omit to keep current
    is_active?: boolean;
}

export interface PartnerCommission {
    commission_id: string;
    order_number: string | null;
    date: string | null;
    amount: number;
    rate_percentage: number;
    level: number;
    status: 'pending' | 'claimable' | 'paid' | 'reversed';
}

interface PartnerListWire {
    success: boolean;
    data: { partners: AdminPartner[] };
}

interface PartnerMutationWire {
    success: boolean;
    data: AdminPartner;
    message: string;
}

interface PartnerCommissionsWire {
    success: boolean;
    data: { commissions: PartnerCommission[] };
}

interface MarkPaidWire {
    success: boolean;
    data: { count: number; amount: number };
    message: string;
}

export const partnersApi = {
    list: async (): Promise<AdminPartner[]> => {
        const res = await apiClient.get<PartnerListWire>('/admin/partners');
        return res.data.data.partners;
    },

    create: async (payload: CreatePartnerPayload): Promise<AdminPartner> => {
        const res = await apiClient.post<PartnerMutationWire>('/admin/partners', payload);
        return res.data.data;
    },

    update: async (id: string, payload: UpdatePartnerPayload): Promise<AdminPartner> => {
        const res = await apiClient.patch<PartnerMutationWire>(`/admin/partners/${id}`, payload);
        return res.data.data;
    },

    commissions: async (id: string): Promise<PartnerCommission[]> => {
        const res = await apiClient.get<PartnerCommissionsWire>(
            `/admin/partners/${id}/commissions`
        );
        return res.data.data.commissions;
    },

    markPaid: async (
        id: string,
        commissionIds?: string[]
    ): Promise<{ count: number; amount: number }> => {
        const res = await apiClient.post<MarkPaidWire>(
            `/admin/partners/${id}/commissions/mark-paid`,
            { commission_ids: commissionIds && commissionIds.length ? commissionIds : null }
        );
        return res.data.data;
    },
};
