/**
 * Types for the delegated staff / custom role system (/admin/roles, /admin/staff).
 * Wire shapes match the FastAPI schemas in fastapi_backend/app/schemas/roles.py
 * (camelCase — FastAPI serializes by alias).
 */

export interface PermissionWire {
    permissionId: string;
    resource: string;
    action: string;
}

export interface RoleWire {
    roleId: string;
    name: string;
    isSystem: boolean;
    permissions: PermissionWire[];
}

export interface PermissionCatalogWire {
    success: boolean;
    permissions: PermissionWire[];
    myPermissionIds: string[];
}

export interface RoleListWire {
    success: boolean;
    roles: RoleWire[];
}

export interface RoleResponseWire {
    success: boolean;
    role: RoleWire;
}

export interface CreateRolePayload {
    name: string;
    permissionIds: string[];
}

export interface StaffWire {
    adminId: string;
    email: string;
    fullName: string;
    role: RoleWire;
    branchId: string | null;
    branchName: string | null;
    parentAdminId: string;
    isActive: boolean;
    createdAt: string;
}

export interface StaffResponseWire {
    success: boolean;
    staff: StaffWire;
    message?: string;
}

export interface StaffListWire {
    success: boolean;
    staff: StaffWire[];
    total: number;
}

export interface CreateStaffPayload {
    email: string;
    password: string;
    fullName: string;
    branchId?: string | null;
    // Exactly one of the two must be set.
    roleId?: string;
    newRole?: CreateRolePayload;
}

export interface UpdateStaffPayload {
    fullName?: string;
    password?: string;
    branchId?: string | null;
    isActive?: boolean;
    permissionIds?: string[];
}

// Frontend-shaped staff row (snake_case, mirrors AdminUser's convention)
export interface StaffUser {
    admin_id: string;
    email: string;
    full_name: string;
    role_id: string;
    role_name: string;
    is_system_role: boolean;
    permissions: PermissionWire[];
    branch_id: string | null;
    branch_name: string | null;
    parent_admin_id: string;
    is_active: boolean;
    created_at: string;
}

export function mapStaffWire(staff: StaffWire): StaffUser {
    return {
        admin_id: staff.adminId,
        email: staff.email,
        full_name: staff.fullName,
        role_id: staff.role.roleId,
        role_name: staff.role.name,
        is_system_role: staff.role.isSystem,
        permissions: staff.role.permissions,
        branch_id: staff.branchId,
        branch_name: staff.branchName,
        parent_admin_id: staff.parentAdminId,
        is_active: staff.isActive,
        created_at: staff.createdAt,
    };
}
