import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AdminRole } from '../types/admin.types';
import { signIn, signOut } from '../test/users';
import { usePermissions } from './usePermissions';

afterEach(signOut);

const perms = () => renderHook(() => usePermissions()).result.current;

describe('usePermissions', () => {
    it('grants nothing when nobody is signed in', () => {
        const p = perms();
        expect(p.can('products', 'read')).toBe(false);
        expect(p.canAccessRoute('/products')).toBe(false);
        expect(p.canAccessBranch('b1')).toBe(false);
    });

    it('lets the Super Admin do everything, in every branch', () => {
        signIn(AdminRole.SUPER_ADMIN);
        const p = perms();
        expect(p.can('settings', 'delete')).toBe(true);
        expect(p.canAccessAllBranches).toBe(true);
        expect(p.canAccessBranch('any')).toBe(true);
        expect(p.dashboardType).toBe('admin');
    });

    it('pins a branch manager to their own branch', () => {
        signIn(AdminRole.BRANCH_MANAGER, { branch_id: 'colombo' });
        const p = perms();
        expect(p.requiresBranchIsolation).toBe(true);
        expect(p.canAccessBranch('colombo')).toBe(true);
        expect(p.canAccessBranch('kandy')).toBe(false);
        expect(p.canManageUsers).toBe(false);
        expect(p.canManageBranches).toBe(false);
    });

    it('does not show Analytics to marketing (the API refuses it)', () => {
        signIn(AdminRole.MARKETING_MANAGER, { branch_id: 'colombo' });
        const p = perms();
        expect(p.canAccessRoute('/analytics')).toBe(false);
        expect(p.canAccessRoute('/coupons')).toBe(true);
    });

    it('treats global support as unscoped and branch support as scoped', () => {
        signIn(AdminRole.CUSTOMER_SUPPORT);
        expect(perms().canAccessAllBranches).toBe(true);
        signIn(AdminRole.CUSTOMER_SUPPORT, { branch_id: 'negombo' });
        expect(perms().canAccessBranch('kandy')).toBe(false);
    });

    it('gives staff exactly the grants the server resolved, and nothing else', () => {
        signIn(AdminRole.STAFF, {
            branch_id: 'colombo',
            permissions: [{ resource: 'orders', action: 'read' }],
        });
        const p = perms();
        expect(p.can('orders', 'read')).toBe(true);
        expect(p.can('orders', 'update')).toBe(false);
        expect(p.canAccessRoute('/products')).toBe(false);
        expect(p.canAccessRoute('/users')).toBe(false);
    });
});
