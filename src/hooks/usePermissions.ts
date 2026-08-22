/**
 * usePermissions Hook
 * Provides permission checking utilities with React integration
 */

import { useMemo } from 'react';
import { useAuthStore } from '../store/authStore';
import type { Resource, Action, PermissionGrant } from '../types/admin.types';
import { AdminRole } from '../types/admin.types';

// Backend-driven permission checks: `permissions` is the admin's effective,
// already-resolved (resource, action) set (see authStore.ts `user.permissions`,
// populated from AdminResponse on login/profile). No wildcard matching here —
// wildcards were expanded into concrete rows server-side (see
// fastapi_backend/app/core/permission_catalog.py), so this is a plain
// membership check that works the same way for base-role and staff admins.
function checkPermission(
    permissions: PermissionGrant[],
    resource: Resource | string,
    action: Action | string,
): boolean {
    return permissions.some((p) => p.resource === resource && p.action === action);
}

function checkAnyPermission(permissions: PermissionGrant[], resource: Resource | string): boolean {
    return permissions.some((p) => p.resource === resource);
}

export type DashboardType = 'admin' | 'manager' | 'marketing' | 'support' | 'inventory';

function getDashboardType(role: AdminRole): DashboardType {
    switch (role) {
        case AdminRole.SUPER_ADMIN: return 'admin';
        case AdminRole.BRANCH_MANAGER: return 'manager';
        case AdminRole.MARKETING_MANAGER: return 'marketing';
        case AdminRole.CUSTOMER_SUPPORT: return 'support';
        case AdminRole.INVENTORY_MANAGER: return 'inventory';
        default: return 'support';
    }
}

export const usePermissions = () => {
    const user = useAuthStore((state) => state.user);

    return useMemo(() => {
        const role = user?.role;
        const branchId = user?.branch_id;

        if (!role) {
            return {
                // Basic checks
                hasPermission: () => false,
                can: () => false,
                canAny: () => false,
                canCreate: () => false,
                canRead: () => false,
                canUpdate: () => false,
                canDelete: () => false,
                canAccessRoute: () => false,
                
                // Role checks
                role: undefined,
                isSuperAdmin: false,
                isBranchManager: false,
                isMarketing: false,
                isSupport: false,
                isInventory: false,
                isStaff: false,
                
                // Branch
                branchId: undefined,
                requiresBranchIsolation: true,
                canAccessAllBranches: false,
                canAccessBranch: () => false,
                
                // Dashboard
                dashboardType: 'support' as DashboardType,
                
                // Specific permissions
                canManageUsers: false,
                canManageBranches: false,
                canApproveTransfers: false,
                canCreateTransfers: false,
                canViewAnalytics: false,
                canViewGlobalAnalytics: false,
                canViewWatchlistAnalytics: false,
                canEditProducts: false,
                canUpdateInventory: false,
            };
        }

        const permissions = user?.permissions ?? [];

        const hasPermission = (resource: string, action: string): boolean => {
            return checkPermission(permissions, resource, action);
        };

        const can = (resource: Resource, action: Action) => checkPermission(permissions, resource, action);
        const canAny = (resource: Resource) => checkAnyPermission(permissions, resource);
        const canCreate = (resource: string) => hasPermission(resource, 'create');
        const canRead = (resource: string) => hasPermission(resource, 'read');
        const canUpdate = (resource: string) => hasPermission(resource, 'update');
        const canDelete = (resource: string) => hasPermission(resource, 'delete');

        const routePermissions: Record<string, { resource: string; action: string }> = {
            '/': { resource: 'dashboard', action: 'read' },
            '/products': { resource: 'products', action: 'read' },
            '/products/new': { resource: 'products', action: 'create' },
            '/categories': { resource: 'categories', action: 'read' },
            '/orders': { resource: 'orders', action: 'read' },
            '/customers': { resource: 'customers', action: 'read' },
            '/inventory': { resource: 'inventory', action: 'read' },
            '/analytics': { resource: 'analytics', action: 'read' },
            '/watchlist': { resource: 'watchlist', action: 'read' },
            '/coupons': { resource: 'marketing', action: 'read' },
            '/quick-sale': { resource: 'marketing', action: 'read' },
            '/banners': { resource: 'banners', action: 'read' },
            '/users': { resource: 'users', action: 'read' },
            '/branches': { resource: 'branches', action: 'read' },
            '/partners': { resource: 'partners', action: 'read' },
            '/settings': { resource: 'settings', action: 'read' },
            '/transfers': { resource: 'transfers', action: 'read' },
        };

        const canAccessRoute = (route: string): boolean => {
            const permission = routePermissions[route];
            if (!permission) return true;
            return hasPermission(permission.resource, permission.action);
        };

        // Role checks
        const isSuperAdmin = role === AdminRole.SUPER_ADMIN;
        const isBranchManager = role === AdminRole.BRANCH_MANAGER;
        const isMarketing = role === AdminRole.MARKETING_MANAGER;
        const isSupport = role === AdminRole.CUSTOMER_SUPPORT;
        const isInventory = role === AdminRole.INVENTORY_MANAGER;
        const isStaff = role === AdminRole.STAFF;

        // Branch access
        const requiresBranchIsolation = role === AdminRole.BRANCH_MANAGER;
        const canAccessAllBranches = !requiresBranchIsolation;
        const canAccessBranch = (targetBranchId: string) => {
            if (canAccessAllBranches) return true;
            return branchId === targetBranchId;
        };

        // Specific permissions
        const canManageUsers = isSuperAdmin;
        const canManageBranches = isSuperAdmin;
        const canApproveTransfers = role === AdminRole.SUPER_ADMIN || role === AdminRole.INVENTORY_MANAGER;
        const canCreateTransfers = role === AdminRole.SUPER_ADMIN || role === AdminRole.BRANCH_MANAGER || role === AdminRole.INVENTORY_MANAGER;
        const canViewAnalytics = role === AdminRole.SUPER_ADMIN || role === AdminRole.BRANCH_MANAGER || role === AdminRole.INVENTORY_MANAGER || role === AdminRole.MARKETING_MANAGER;
        const canViewGlobalAnalytics = isSuperAdmin;
        const canViewWatchlistAnalytics = role === AdminRole.SUPER_ADMIN || role === AdminRole.BRANCH_MANAGER;
        const canEditProducts = role === AdminRole.SUPER_ADMIN || role === AdminRole.INVENTORY_MANAGER;
        const canUpdateInventory = role === AdminRole.SUPER_ADMIN || role === AdminRole.BRANCH_MANAGER || role === AdminRole.INVENTORY_MANAGER;

        return {
            // Basic checks
            hasPermission,
            can,
            canAny,
            canCreate,
            canRead,
            canUpdate,
            canDelete,
            canAccessRoute,
            
            // Role checks
            role,
            isSuperAdmin,
            isBranchManager,
            isMarketing,
            isSupport,
            isInventory,
            isStaff,

            // Branch
            branchId,
            requiresBranchIsolation,
            canAccessAllBranches,
            canAccessBranch,
            
            // Dashboard
            dashboardType: getDashboardType(role),
            
            // Specific permissions
            canManageUsers,
            canManageBranches,
            canApproveTransfers,
            canCreateTransfers,
            canViewAnalytics,
            canViewGlobalAnalytics,
            canViewWatchlistAnalytics,
            canEditProducts,
            canUpdateInventory,
        };
    }, [user?.role, user?.branch_id, user?.permissions]);
};

export default usePermissions;
