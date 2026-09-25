import { AdminRole } from '../types/admin.types';
import type { PermissionGrant } from '../types/admin.types';
import { useAuthStore } from '../store/authStore';

export function signIn(role: AdminRole, opts: { branch_id?: string; permissions?: PermissionGrant[] } = {}) {
    useAuthStore.getState().login(
        {
            admin_id: `id-${role}`,
            email: `${role}@example.test`,
            full_name: role,
            role,
            branch_id: opts.branch_id,
            permissions: opts.permissions ?? [],
        },
        { accessToken: `access-${role}`, refreshToken: `refresh-${role}` },
    );
}

export function signOut() {
    useAuthStore.getState().logout();
}
