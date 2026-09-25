import { afterEach, describe, expect, it } from 'vitest';
import { AdminRole } from '../types/admin.types';
import { signIn, signOut } from '../test/users';
import { useAuthStore } from './authStore';

afterEach(signOut);

describe('authStore', () => {
    it('logout clears every copy of the credentials', () => {
        signIn(AdminRole.SUPER_ADMIN);
        localStorage.setItem('active_branch', 'x');
        useAuthStore.getState().logout();
        const s = useAuthStore.getState();
        expect(s.token).toBeNull();
        expect(s.refreshToken).toBeNull();
        expect(s.user).toBeNull();
        for (const key of ['admin_token', 'admin_user', 'active_branch']) {
            expect(localStorage.getItem(key)).toBeNull();
        }
    });

    it('checks branch access against the assigned branch', () => {
        signIn(AdminRole.INVENTORY_MANAGER, { branch_id: 'galle' });
        expect(useAuthStore.getState().canAccessBranch('galle')).toBe(true);
        expect(useAuthStore.getState().canAccessBranch('kandy')).toBe(false);
    });

    it('hasPermission honours server grants for staff', () => {
        signIn(AdminRole.STAFF, { permissions: [{ resource: 'orders', action: 'read' }] });
        expect(useAuthStore.getState().hasPermission('orders', 'read')).toBe(true);
        expect(useAuthStore.getState().hasPermission('orders', 'delete')).toBe(false);
    });

    it('updateUser merges and persists', () => {
        signIn(AdminRole.SUPER_ADMIN);
        useAuthStore.getState().updateUser({ full_name: 'Renamed' });
        expect(useAuthStore.getState().user?.full_name).toBe('Renamed');
        expect(JSON.parse(localStorage.getItem('admin_user') ?? '{}').full_name).toBe('Renamed');
    });
});
