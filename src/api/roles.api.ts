/**
 * Admin Role API (/api/v1/admin/roles).
 * GET routes: any authenticated admin. POST: base-role admins only
 * (enforced server-side via require_base_role_admin).
 */
import apiClient from './client';
import type {
    CreateRolePayload,
    PermissionCatalogWire,
    RoleListWire,
    RoleResponseWire,
    RoleWire,
} from '../types/roles.types';

export const rolesApi = {
    getCatalog: async (): Promise<PermissionCatalogWire> => {
        const res = await apiClient.get<PermissionCatalogWire>('/admin/roles/catalog');
        return res.data;
    },

    list: async (): Promise<RoleWire[]> => {
        const res = await apiClient.get<RoleListWire>('/admin/roles');
        return res.data.roles;
    },

    create: async (payload: CreateRolePayload): Promise<RoleWire> => {
        const res = await apiClient.post<RoleResponseWire>('/admin/roles', payload);
        return res.data.role;
    },
};
