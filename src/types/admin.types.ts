/**
 * Admin Types for SRIBEESonline Admin Dashboard
 * Defines roles, permissions, and admin user types
 */

// Admin Role Types - using const object instead of enum for erasableSyntaxOnly compatibility
// Values MUST match the backend enum in fastapi_backend/app/models/admin.py (AdminRole).
export const AdminRole = {
    SUPER_ADMIN: 'super_admin',
    BRANCH_MANAGER: 'branch_manager',
    MARKETING_MANAGER: 'marketing_manager',
    INVENTORY_MANAGER: 'inventory_manager',
    CUSTOMER_SUPPORT: 'customer_support',
    STAFF: 'staff',
} as const;

export type AdminRole = typeof AdminRole[keyof typeof AdminRole];

// The 5 original roles — every one of them can create delegated staff
// beneath themselves (see pages/Staff/StaffList.tsx). STAFF itself is
// excluded: staff accounts can never create further staff.
export const BASE_ADMIN_ROLES: readonly AdminRole[] = [
    AdminRole.SUPER_ADMIN,
    AdminRole.BRANCH_MANAGER,
    AdminRole.MARKETING_MANAGER,
    AdminRole.INVENTORY_MANAGER,
    AdminRole.CUSTOMER_SUPPORT,
];

// Roles selectable when creating/editing a base-role admin via /users
// (Super Admin only) — deliberately excludes STAFF, which is created via
// /staff instead, with a delegated permission set rather than a fixed role.
export const VALID_ADMIN_ROLES: readonly AdminRole[] = BASE_ADMIN_ROLES;

export function isValidAdminRole(role: unknown): role is AdminRole {
    return typeof role === 'string' && (Object.values(AdminRole) as readonly string[]).includes(role);
}

// Resource types for permissions
export type Resource = 
    | 'dashboard'
    | 'products'
    | 'orders'
    | 'customers'
    | 'inventory'
    | 'analytics'
    | 'watchlist'
    | 'users'
    | 'branches'
    | 'settings'
    | 'reviews'
    | 'categories'
    | 'transfers'
    | 'marketing'
    | 'banners'
    | 'partners';

// Action types
export type Action = 'create' | 'read' | 'update' | 'delete' | '*';

export interface AdminUser {
    admin_id: string;
    email: string;
    full_name: string;
    role: AdminRole;
    // Custom role display name for staff accounts (e.g. "Branch Manager
    // Staff"); undefined for base-role admins — use ROLE_NAMES[role] then.
    role_name?: string;
    branch_id?: string;
    branch_name?: string;
    is_active: boolean;
    avatar_url?: string;
    phone?: string;
    last_login?: string;
    created_at?: string;
}

export interface Permission {
    resource: Resource | '*';
    action: Action;
}

// A concrete (resource, action) grant as returned by the backend on
// login/profile — no wildcards, unlike the static Permission/ROLE_PERMISSIONS
// shape above. This is what authStore/usePermissions actually check against.
export interface PermissionGrant {
    resource: string;
    action: string;
}

// Role-based permissions configuration.
//
// DOCUMENTATION ONLY as of the delegated-staff system (migration 037) — this
// is the literal source the backend's permission catalog seed data
// (fastapi_backend/app/core/permission_catalog.py, migrations/037) was
// ported from, kept here so the two stay comparable at a glance. No runtime
// authorization code should read this map anymore: effective permissions
// come from the backend on login/profile (see authStore.ts `user.permissions`)
// so that staff accounts — which have no fixed role here — are covered too.
export const ROLE_PERMISSIONS: Partial<Record<AdminRole, Permission[]>> = {
    [AdminRole.SUPER_ADMIN]: [
        { resource: '*', action: '*' }, // Full access
    ],
    [AdminRole.BRANCH_MANAGER]: [
        { resource: 'dashboard', action: 'read' },
        { resource: 'products', action: 'read' },
        { resource: 'products', action: 'update' },
        { resource: 'orders', action: 'read' },
        { resource: 'orders', action: 'update' },
        { resource: 'customers', action: 'read' },
        { resource: 'inventory', action: 'read' },
        { resource: 'inventory', action: 'update' },
        { resource: 'analytics', action: 'read' },
        { resource: 'watchlist', action: 'read' },
        { resource: 'reviews', action: 'read' },
        { resource: 'reviews', action: 'update' },
        { resource: 'transfers', action: 'create' },
        { resource: 'transfers', action: 'read' },
        { resource: 'settings', action: 'read' },
    ],
    [AdminRole.MARKETING_MANAGER]: [
        { resource: 'dashboard', action: 'read' },
        { resource: 'products', action: 'read' },
        { resource: 'customers', action: 'read' },
        // No 'analytics': /admin/analytics/* is server-side restricted to
        // super_admin and branch_manager. Granting it here only puts an
        // Analytics item in the sidebar that opens onto a wall of 403s.
        { resource: 'watchlist', action: 'read' },
        { resource: 'marketing', action: '*' },
        { resource: 'banners', action: '*' },
    ],
    [AdminRole.CUSTOMER_SUPPORT]: [
        { resource: 'dashboard', action: 'read' },
        { resource: 'products', action: 'read' },
        { resource: 'orders', action: 'read' },
        { resource: 'orders', action: 'update' },
        { resource: 'customers', action: 'read' },
        { resource: 'customers', action: 'update' },
        { resource: 'reviews', action: 'read' },
        { resource: 'reviews', action: 'update' },
    ],
    [AdminRole.INVENTORY_MANAGER]: [
        { resource: 'dashboard', action: 'read' },
        { resource: 'products', action: 'create' },
        { resource: 'products', action: 'read' },
        { resource: 'products', action: 'update' },
        { resource: 'inventory', action: 'read' },
        { resource: 'inventory', action: 'update' },
        { resource: 'categories', action: 'create' },
        { resource: 'categories', action: 'read' },
        { resource: 'categories', action: 'update' },
        // No 'analytics' — same reason as Marketing Manager above. Stock-side
        // reporting for this role lives under Inventory, not Analytics.
        { resource: 'transfers', action: 'create' },
        { resource: 'transfers', action: 'read' },
        { resource: 'transfers', action: 'update' },
    ],
};

// Role display names. STAFF's entry is only a fallback for when a staff
// admin's custom role_name (from AdminResponse.roleName) isn't available —
// prefer that over this generic label wherever it's present.
export const ROLE_NAMES: Record<AdminRole, string> = {
    [AdminRole.SUPER_ADMIN]: 'Super Admin',
    [AdminRole.BRANCH_MANAGER]: 'Branch Manager',
    [AdminRole.MARKETING_MANAGER]: 'Marketing Manager',
    [AdminRole.INVENTORY_MANAGER]: 'Inventory Manager',
    [AdminRole.CUSTOMER_SUPPORT]: 'Customer Support',
    [AdminRole.STAFF]: 'Staff',
};

// Role colors for badges
export const ROLE_COLORS: Record<AdminRole, { bg: string; text: string }> = {
    [AdminRole.SUPER_ADMIN]: { bg: '#fee2e2', text: '#dc2626' },
    [AdminRole.BRANCH_MANAGER]: { bg: '#dbeafe', text: '#2563eb' },
    [AdminRole.MARKETING_MANAGER]: { bg: '#dcfce7', text: '#16a34a' },
    [AdminRole.CUSTOMER_SUPPORT]: { bg: '#fef3c7', text: '#d97706' },
    [AdminRole.INVENTORY_MANAGER]: { bg: '#ede9fe', text: '#7c3aed' },
    [AdminRole.STAFF]: { bg: '#e0e7ff', text: '#4338ca' },
};

// Navigation items by role
export interface NavItem {
    key: string;
    label: string;
    icon: string;
    path: string;
    requiredPermission?: { resource: Resource; action: Action };
    children?: NavItem[];
}

export const NAVIGATION_CONFIG: Partial<Record<AdminRole, string[]>> = {
    [AdminRole.SUPER_ADMIN]: [
        'dashboard',
        'products',
        'orders',
        'inventory',
        'analytics',
        'watchlist',
        'customers',
        'users',
        'branches',
        'settings',
    ],
    [AdminRole.BRANCH_MANAGER]: [
        'dashboard',
        'products',
        'orders',
        'inventory',
        'analytics',
        'watchlist',
        'customers',
        'settings',
    ],
    [AdminRole.MARKETING_MANAGER]: [
        'dashboard',
        'products',
        'analytics',
        'watchlist',
        'customers',
        'marketing',
    ],
    [AdminRole.CUSTOMER_SUPPORT]: [
        'dashboard',
        'orders',
        'customers',
        'reviews',
    ],
    [AdminRole.INVENTORY_MANAGER]: [
        'dashboard',
        'products',
        'inventory',
        'categories',
        'transfers',
    ],
};

// Demo credentials for testing
export const DEMO_USERS = {
    superAdmin: {
        email: 'superadmin@freshcart.lk',
        password: 'Admin@123',
        role: AdminRole.SUPER_ADMIN,
        name: 'Super Admin',
    },
    branchManagerColombo: {
        email: 'manager.colombo@freshcart.lk',
        password: 'Admin@123',
        role: AdminRole.BRANCH_MANAGER,
        name: 'Colombo Manager',
        branch: 'Colombo Central',
    },
    branchManagerKandy: {
        email: 'manager.kandy@freshcart.lk',
        password: 'Admin@123',
        role: AdminRole.BRANCH_MANAGER,
        name: 'Kandy Manager',
        branch: 'Kandy City',
    },
    support: {
        email: 'staff1.colombo@freshcart.lk',
        password: 'Admin@123',
        role: AdminRole.CUSTOMER_SUPPORT,
        name: 'Staff Colombo',
        branch: 'Colombo Central',
    },
};

// Permission check helper types
export interface PermissionCheck {
    resource: Resource;
    action: Action;
    branchId?: string;
}

// Admin user form data
export interface AdminUserFormData {
    email: string;
    password?: string;
    full_name: string;
    role: AdminRole;
    branch_id?: string;
    is_active: boolean;
    phone?: string;
}

// Admin list filters
export interface AdminUserFilters {
    search?: string;
    role?: AdminRole;
    branch_id?: string;
    is_active?: boolean;
    page?: number;
    limit?: number;
}
