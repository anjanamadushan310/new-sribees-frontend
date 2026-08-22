/**
 * Admin Staff API (/api/v1/admin/staff) — manage delegated staff accounts
 * created beneath the current admin. Restricted server-side to base-role
 * admins (require_base_role_admin) — a staff account can never reach these
 * routes itself.
 */
import apiClient from './client';
import type {
    CreateStaffPayload,
    StaffListWire,
    StaffResponseWire,
    StaffUser,
    UpdateStaffPayload,
} from '../types/roles.types';
import { mapStaffWire } from '../types/roles.types';

export const staffApi = {
    list: async (): Promise<StaffUser[]> => {
        const res = await apiClient.get<StaffListWire>('/admin/staff');
        return res.data.staff.map(mapStaffWire);
    },

    create: async (payload: CreateStaffPayload): Promise<StaffUser> => {
        const res = await apiClient.post<StaffResponseWire>('/admin/staff', payload);
        return mapStaffWire(res.data.staff);
    },

    update: async (id: string, payload: UpdateStaffPayload): Promise<StaffUser> => {
        const res = await apiClient.put<StaffResponseWire>(`/admin/staff/${id}`, payload);
        return mapStaffWire(res.data.staff);
    },

    /** Soft delete — sets is_active = false on the server. */
    deactivate: async (id: string): Promise<void> => {
        await apiClient.delete(`/admin/staff/${id}`);
    },
};
