/**
 * Admin Stock Transfers API (/api/v1/admin/transfers)
 *
 * A transfer always involves two branches. A scoped admin (Branch Manager,
 * Inventory Manager) sees and can create/act on transfers where their own
 * branch is either party — not a single fixed branch_id. Super Admins see
 * everything and must specify both branches explicitly when creating one.
 */
import apiClient from './client';

export type TransferStatus = 'pending' | 'approved' | 'in_transit' | 'completed' | 'cancelled';

export const TRANSFER_STATUS_META: Record<TransferStatus, { label: string; color: string }> = {
    pending: { label: 'Pending', color: 'gold' },
    approved: { label: 'Approved', color: 'blue' },
    in_transit: { label: 'In Transit', color: 'purple' },
    completed: { label: 'Completed', color: 'green' },
    cancelled: { label: 'Cancelled', color: 'red' },
};

export const TRANSFER_STATUSES = Object.keys(TRANSFER_STATUS_META) as TransferStatus[];

export interface StockTransfer {
    transfer_id: string;
    from_branch_id: string;
    from_branch_name: string;
    to_branch_id: string;
    to_branch_name: string;
    product_id: string;
    product_name: string;
    quantity: number;
    status: TransferStatus;
    requested_by_id: string;
    requested_by_name: string;
    approved_by_id: string | null;
    approved_by_name: string | null;
    notes: string | null;
    requested_at: string | null;
    approved_at: string | null;
    shipped_at: string | null;
    completed_at: string | null;
}

export interface TransferScope {
    is_super_admin: boolean;
    branch_id: string | null;
}

/** Minimal branch shape for the transfer-request "From"/"To" pickers. */
export interface TransferBranchOption {
    branch_id: string;
    name: string;
    code: string;
}

export interface TransferListParams {
    page?: number;
    limit?: number;
    status?: TransferStatus;
}

export interface TransferListResult {
    transfers: StockTransfer[];
    total: number;
    page: number;
    limit: number;
    total_pages: number;
    scope: TransferScope;
}

/** Create payload: scoped admins may omit whichever side is their own branch. */
export interface TransferCreatePayload {
    from_branch_id?: string;
    to_branch_id?: string;
    product_id: string;
    quantity: number;
    notes?: string;
}

interface Wire<T> {
    success: boolean;
    data: T;
    message?: string;
}

interface TransferListWire {
    success: boolean;
    data: {
        transfers: StockTransfer[];
        pagination: { total: number; page: number; limit: number; total_pages: number };
        scope: TransferScope;
    };
}

export const transfersApi = {
    /**
     * Every active branch's id/name/code, for the From/To pickers. Open to
     * any role that can reach this router — `/admin/branches` itself is
     * Super Admin only.
     */
    branches: async (): Promise<TransferBranchOption[]> => {
        const res = await apiClient.get<Wire<{ branches: TransferBranchOption[] }>>('/admin/transfers/branches');
        return res.data.data.branches;
    },

    list: async (params?: TransferListParams): Promise<TransferListResult> => {
        const clean: Record<string, unknown> = {};
        if (params) {
            Object.entries(params).forEach(([k, v]) => {
                if (v !== undefined && v !== null && v !== '') clean[k] = v;
            });
        }
        const res = await apiClient.get<TransferListWire>('/admin/transfers', { params: clean });
        return {
            transfers: res.data.data.transfers,
            scope: res.data.data.scope,
            ...res.data.data.pagination,
        };
    },

    create: async (payload: TransferCreatePayload): Promise<StockTransfer> => {
        const res = await apiClient.post<Wire<StockTransfer>>('/admin/transfers', payload);
        return res.data.data;
    },

    approve: async (id: string): Promise<StockTransfer> => {
        const res = await apiClient.post<Wire<StockTransfer>>(`/admin/transfers/${id}/approve`);
        return res.data.data;
    },

    reject: async (id: string, reason?: string): Promise<StockTransfer> => {
        const res = await apiClient.post<Wire<StockTransfer>>(`/admin/transfers/${id}/reject`, { reason });
        return res.data.data;
    },

    ship: async (id: string): Promise<StockTransfer> => {
        const res = await apiClient.post<Wire<StockTransfer>>(`/admin/transfers/${id}/ship`);
        return res.data.data;
    },

    complete: async (id: string): Promise<StockTransfer> => {
        const res = await apiClient.post<Wire<StockTransfer>>(`/admin/transfers/${id}/complete`);
        return res.data.data;
    },
};
