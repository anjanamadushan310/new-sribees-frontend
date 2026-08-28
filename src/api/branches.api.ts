/**
 * Admin Branch API (/api/v1/admin/branches) — Super Admin only.
 * Responses are snake_case dicts, matching the types below.
 *
 * Note: the model uses `district` (Sri-Lankan location); the UI labels it
 * "City / District". `province` is required by the DB.
 */
import apiClient from './client';

export interface Branch {
    branch_id: string;
    name: string;
    code: string;
    address?: string | null;
    district?: string | null;
    province: string;
    post_office?: string | null;
    phone?: string | null;
    manager_id?: string | null;
    is_active: boolean;
    /** Post Offices this branch serves (synced to PostOfficeBranchMapping). */
    coverage_post_offices: string[];
    created_at?: string | null;
    updated_at?: string | null;
}

export interface BranchPayload {
    name: string;
    code: string;
    address?: string | null;
    district?: string | null;
    province: string;
    phone?: string | null;
    is_active?: boolean;
    /** Full replacement set of Post Offices this branch serves. */
    coverage_post_offices?: string[];
}

interface BranchListWire {
    success: boolean;
    data: { branches: Branch[] };
}

interface BranchMutationWire {
    success: boolean;
    data: Branch;
    message: string;
}

export const branchesApi = {
    list: async (): Promise<Branch[]> => {
        const res = await apiClient.get<BranchListWire>('/admin/branches');
        return res.data.data.branches;
    },

    create: async (payload: BranchPayload): Promise<Branch> => {
        const res = await apiClient.post<BranchMutationWire>('/admin/branches', payload);
        return res.data.data;
    },

    update: async (id: string, payload: Partial<BranchPayload>): Promise<Branch> => {
        const res = await apiClient.put<BranchMutationWire>(`/admin/branches/${id}`, payload);
        return res.data.data;
    },

    remove: async (id: string): Promise<void> => {
        await apiClient.delete(`/admin/branches/${id}`);
    },
};
