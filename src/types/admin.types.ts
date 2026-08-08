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
} as const;

export type AdminRole = typeof AdminRole[keyof typeof AdminRole];

// All roles the backend recognizes; anything else must not pass the login gate
export const VALID_ADMIN_ROLES: readonly AdminRole[] = Object.values(AdminRole);

export function isValidAdminRole(role: unknown): role is AdminRole {
    return typeof role === 'string' && (VALID_ADMIN_ROLES as readonly string[]).includes(role);
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

// Role-based permissions configuration
export const ROLE_PERMISSIONS: Record<AdminRole, Permission[]> = {
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

// Role display names
export const ROLE_NAMES: Record<AdminRole, string> = {
    [AdminRole.SUPER_ADMIN]: 'Super Admin',
    [AdminRole.BRANCH_MANAGER]: 'Branch Manager',
    [AdminRole.MARKETING_MANAGER]: 'Marketing Manager',
    [AdminRole.INVENTORY_MANAGER]: 'Inventory Manager',
    [AdminRole.CUSTOMER_SUPPORT]: 'Customer Support',
};

// Role colors for badges
export const ROLE_COLORS: Record<AdminRole, { bg: string; text: string }> = {
    [AdminRole.SUPER_ADMIN]: { bg: '#fee2e2', text: '#dc2626' },
    [AdminRole.BRANCH_MANAGER]: { bg: '#dbeafe', text: '#2563eb' },
    [AdminRole.MARKETING_MANAGER]: { bg: '#dcfce7', text: '#16a34a' },
    [AdminRole.CUSTOMER_SUPPORT]: { bg: '#fef3c7', text: '#d97706' },
    [AdminRole.INVENTORY_MANAGER]: { bg: '#ede9fe', text: '#7c3aed' },
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

export const NAVIGATION_CONFIG: Record<AdminRole, string[]> = {
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
