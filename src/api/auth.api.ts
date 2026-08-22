/**
 * Admin Auth API
 * Wire types match the FastAPI admin auth contract (/api/v1/admin/auth/*).
 * FastAPI serializes AdminResponse by alias, so fields arrive camelCase.
 */
import apiClient from './client';
import type { AdminRole } from '../types/admin.types';
import type { AuthTokens } from '../store/authStore';

export interface LoginCredentials {
    email: string;
    password: string;
}

// Backend AdminResponse schema as serialized on the wire
export interface AdminWire {
    adminId: string;
    email: string;
    fullName: string;
    role: AdminRole;
    roleName?: string | null;
    branchId?: string | null;
    isActive: boolean;
    lastLogin?: string | null;
    createdAt?: string;
    permissions: { resource: string; action: string }[];
}

interface AdminAuthWire {
    success: boolean;
    message: string;
    data: {
        admin: AdminWire;
        token: string;
        refresh_token: string;
    };
}

interface AdminProfileWire {
    success: boolean;
    admin: AdminWire;
}

// Internal user shape used by the auth store (snake_case)
export interface AdminUser {
    admin_id: string;
    email: string;
    full_name: string;
    role: AdminRole;
    role_name?: string;
    branch_id?: string;
    is_active?: boolean;
    permissions: { resource: string; action: string }[];
}

export function mapAdminWire(admin: AdminWire): AdminUser {
    return {
        admin_id: admin.adminId,
        email: admin.email,
        full_name: admin.fullName,
        role: admin.role,
        role_name: admin.roleName ?? undefined,
        branch_id: admin.branchId ?? undefined,
        is_active: admin.isActive,
        permissions: admin.permissions ?? [],
    };
}

export interface LoginResult {
    user: AdminUser;
    tokens: AuthTokens;
    message: string;
}

export const authApi = {
    login: async (credentials: LoginCredentials): Promise<LoginResult> => {
        const response = await apiClient.post<AdminAuthWire>('/admin/auth/login', credentials);
        const { admin, token, refresh_token } = response.data.data;
        return {
            user: mapAdminWire(admin),
            tokens: { accessToken: token, refreshToken: refresh_token },
            message: response.data.message,
        };
    },

    // "Me" endpoint for the admin realm
    getCurrentUser: async (): Promise<AdminUser> => {
        const response = await apiClient.get<AdminProfileWire>('/admin/auth/profile');
        return mapAdminWire(response.data.admin);
    },

    logout: async (): Promise<void> => {
        // Best-effort server-side session invalidation; local state is
        // cleared by the auth store regardless of the outcome.
        try {
            await apiClient.post('/admin/auth/logout');
        } catch {
            // Session may already be gone; nothing to do.
        }
    },

    updateProfile: async (fullName: string): Promise<AdminUser> => {
        const response = await apiClient.put<AdminProfileWire>('/admin/auth/profile', {
            full_name: fullName,
        });
        return mapAdminWire(response.data.admin);
    },

    changePassword: async (currentPassword: string, newPassword: string): Promise<void> => {
        await apiClient.post('/admin/auth/change-password', {
            current_password: currentPassword,
            new_password: newPassword,
        });
    },
};
