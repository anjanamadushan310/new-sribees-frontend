/**
 * Admin Branch API (/api/v1/admin/branches) — Super Admin only.
 * Responses are snake_case dicts, matching the types below.
 *
 * Note: the model uses `district` (Sri-Lankan location); the UI labels it
 * "City / District". `province` is required by the DB.
 */
import apiClient from './client';

/**
 * One daily dispatch round.
 *
 * `dispatch_time` is 24-hour HH:MM in Asia/Colombo (Sri Lanka has one
 * timezone and no DST, so a wall-clock string is exact). `cutoff_minutes`
 * is how long before that ordering closes — the Marketing Dashboard counts
 * down to the cut-off, not to dispatch, because a run past its cut-off is
 * already locked.
 */
export interface DeliveryRun {
    label: string;
    dispatch_time: string;
    cutoff_minutes: number;
}

export interface Branch {
    branch_id: string;
    name: string;
    code: string;
    address?: string | null;
    district?: string | null;
    province: string;
    postal_city?: string | null;
    phone?: string | null;
    manager_id?: string | null;
    is_active: boolean;
    /** Daily dispatch rounds, ordered by dispatch_time. Empty = not set up. */
    delivery_runs: DeliveryRun[];
    /** Postal Cities this branch serves (synced to PostalCityBranchMapping). */
    coverage_postal_cities: string[];
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
    /** Full replacement set of Postal Cities this branch serves. */
    coverage_postal_cities?: string[];
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

    /**
     * Activate/deactivate a branch. Open to Branch Managers for their own
     * branch too (not just Super Admin) — see admin_branches.set_branch_status.
     */
    setStatus: async (id: string, isActive: boolean): Promise<Branch> => {
        const res = await apiClient.patch<BranchMutationWire>(`/admin/branches/${id}/status`, {
            is_active: isActive,
        });
        return res.data.data;
    },

    /**
     * Replace this branch's daily delivery runs (full set, not a patch — the
     * rounds only make sense relative to each other). Open to the branch's own
     * manager as well as Super Admin, like setStatus above.
     */
    setDeliveryRuns: async (id: string, runs: DeliveryRun[]): Promise<Branch> => {
        const res = await apiClient.put<BranchMutationWire>(
            `/admin/branches/${id}/delivery-runs`,
            { delivery_runs: runs },
        );
        return res.data.data;
    },
};
