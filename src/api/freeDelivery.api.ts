/**
 * Free delivery (/api/v1/admin/free-delivery), Super Admin only.
 *
 * A branch's offer covers everyone it delivers to, for its number of months
 * from the moment it is switched on. A grant covers one chosen customer until a
 * chosen date. The courier is still paid; the customer's charge is waived.
 */
import apiClient from './client';

export interface BranchOffer {
    branch_id: string;
    branch_name: string;
    enabled: boolean;
    months: number;
    min_order: number;
    enabled_at: string | null;
    ends_at: string | null;
    expired: boolean;
}

export interface BranchOfferPayload {
    enabled: boolean;
    months: number;
    min_order: number;
}

export interface FreeDeliveryGrant {
    grant_id: string;
    user_id: string;
    customer: string | null;
    phone: string | null;
    /** null: every branch. */
    branch_name: string | null;
    starts_at: string;
    ends_at: string;
    min_order: number;
    note: string | null;
    revoked_at: string | null;
}

export interface GrantPayload {
    user_ids: string[];
    ends_at: string;
    branch_id?: string;
    min_order: number;
    note?: string;
}

interface Wire<T> {
    success: boolean;
    data: T;
}

export const freeDeliveryApi = {
    branches: async (): Promise<BranchOffer[]> =>
        (await apiClient.get<Wire<BranchOffer[]>>('/admin/free-delivery/branches')).data.data,

    saveBranch: async (branchId: string, payload: BranchOfferPayload): Promise<BranchOffer> =>
        (await apiClient.put<Wire<BranchOffer>>(`/admin/free-delivery/branches/${branchId}`, payload)).data.data,

    grants: async (): Promise<FreeDeliveryGrant[]> =>
        (await apiClient.get<Wire<FreeDeliveryGrant[]>>('/admin/free-delivery/grants')).data.data,

    createGrants: async (payload: GrantPayload): Promise<number> =>
        (await apiClient.post<Wire<{ granted: number }>>('/admin/free-delivery/grants', payload)).data.data.granted,

    revokeGrant: async (grantId: string): Promise<void> => {
        await apiClient.delete(`/admin/free-delivery/grants/${grantId}`);
    },
};
