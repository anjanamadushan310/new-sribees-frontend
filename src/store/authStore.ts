/**
 * Authentication Store using Zustand
 * Manages user authentication state, tokens, and branch context
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AdminRole } from '../types/admin.types';
import type { Resource, Action, PermissionGrant } from '../types/admin.types';

// User interface
interface User {
    admin_id: string;
    email: string;
    full_name: string;
    role: AdminRole;
    role_name?: string;
    branch_id?: string;
    branch_name?: string;
    is_active?: boolean;
    avatar_url?: string;
    // Effective (resource, action) grants, resolved server-side on
    // login/profile. The authoritative source for hasPermission() below —
    // covers staff accounts, which have no entry in the static
    // ROLE_PERMISSIONS map.
    permissions: PermissionGrant[];
}

export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
}

// Auth state interface
interface AuthState {
    user: User | null;
    token: string | null;
    refreshToken: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;

    // Actions
    login: (user: User, tokens: AuthTokens) => void;
    logout: () => void;
    setTokens: (tokens: AuthTokens) => void;
    updateUser: (userData: Partial<User>) => void;
    setLoading: (loading: boolean) => void;

    // Permission checks
    hasPermission: (resource: Resource, action: Action) => boolean;
    isSuperAdmin: () => boolean;
    isBranchManager: () => boolean;
    isCustomerSupport: () => boolean;
    canAccessBranch: (branchId: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            token: null,
            refreshToken: null,
            isAuthenticated: false,
            isLoading: false,

            login: (user, tokens) => {
                // Legacy mirror keys kept for code that reads localStorage directly
                localStorage.setItem('admin_token', tokens.accessToken);
                localStorage.setItem('admin_user', JSON.stringify(user));
                set({
                    user,
                    token: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    isAuthenticated: true,
                    isLoading: false,
                });
            },

            logout: () => {
                localStorage.removeItem('admin_token');
                localStorage.removeItem('admin_user');
                localStorage.removeItem('active_branch');
                set({
                    user: null,
                    token: null,
                    refreshToken: null,
                    isAuthenticated: false,
                    isLoading: false,
                });
            },

            setTokens: (tokens) => {
                localStorage.setItem('admin_token', tokens.accessToken);
                set({ token: tokens.accessToken, refreshToken: tokens.refreshToken });
            },

            updateUser: (userData) => {
                const currentUser = get().user;
                if (currentUser) {
                    const updatedUser = { ...currentUser, ...userData };
                    localStorage.setItem('admin_user', JSON.stringify(updatedUser));
                    set({ user: updatedUser });
                }
            },

            setLoading: (loading) => {
                set({ isLoading: loading });
            },

            hasPermission: (resource: Resource, action: Action) => {
                const user = get().user;
                if (!user) return false;
                // Super Admin's effective set is the full delegatable catalog
                // (seeded that way server-side), so a plain membership check
                // already covers it — no wildcard case to special-case here.
                return user.permissions.some((p) => p.resource === resource && p.action === action);
            },

            isSuperAdmin: () => {
                const user = get().user;
                return user?.role === AdminRole.SUPER_ADMIN;
            },

            isBranchManager: () => {
                const user = get().user;
                return user?.role === AdminRole.BRANCH_MANAGER;
            },

            isCustomerSupport: () => {
                const user = get().user;
                return user?.role === AdminRole.CUSTOMER_SUPPORT;
            },

            canAccessBranch: (branchId: string) => {
                const user = get().user;
                if (!user) return false;

                // Super admin can access all branches
                if (user.role === AdminRole.SUPER_ADMIN) return true;

                // Other roles can only access their assigned branch
                return user.branch_id === branchId;
            },
        }),
        {
            name: 'admin-auth-storage',
            partialize: (state) => ({
                user: state.user,
                token: state.token,
                refreshToken: state.refreshToken,
                isAuthenticated: state.isAuthenticated,
            }),
        }
    )
);

// Selectors for common use cases
export const selectUser = (state: AuthState) => state.user;
export const selectIsAuthenticated = (state: AuthState) => state.isAuthenticated;
export const selectUserRole = (state: AuthState) => state.user?.role;
export const selectUserBranch = (state: AuthState) => state.user?.branch_id;
