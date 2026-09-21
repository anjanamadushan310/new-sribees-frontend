/**
 * Axios API Client with Interceptors
 * Handles authentication, token refresh/rotation, branch isolation,
 * and session invalidation.
 */

import axios, { AxiosError } from 'axios';
import type { InternalAxiosRequestConfig } from 'axios';
import { useAuthStore } from '../store/authStore';
import { AdminRole } from '../types/admin.types';
import { recordServerDate } from '../utils/server-clock';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api/v1';

// Create axios instance
const apiClient = axios.create({
    baseURL: API_BASE_URL,
    timeout: 30000,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Request interceptor - Add auth token and branch context
apiClient.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        const { token, user } = useAuthStore.getState();

        // Add authentication token
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }

        // Add branch context for non-super-admin users
        if (user && user.role !== AdminRole.SUPER_ADMIN && user.branch_id) {
            config.headers['X-Branch-ID'] = user.branch_id;
        }

        // Add active branch from store (for super admin branch switching)
        const activeBranch = localStorage.getItem('active_branch');
        if (activeBranch && !config.headers['X-Branch-ID']) {
            config.headers['X-Branch-ID'] = activeBranch;
        }

        return config;
    },
    (error) => {
        return Promise.reject(error);
    }
);

interface RetriableRequestConfig extends InternalAxiosRequestConfig {
    _retry?: boolean;
}

// Endpoints that must never trigger a token refresh on 401
const AUTH_ENDPOINTS = ['/admin/auth/login', '/admin/auth/refresh'];

const isAuthEndpoint = (url?: string): boolean =>
    !!url && AUTH_ENDPOINTS.some((endpoint) => url.includes(endpoint));

const forceLogout = (): void => {
    useAuthStore.getState().logout();
    if (!window.location.pathname.includes('/login')) {
        window.location.href = '/login';
    }
};

// Single-flight refresh: concurrent 401s share one refresh request
let refreshPromise: Promise<string> | null = null;

const refreshTokens = (): Promise<string> => {
    if (!refreshPromise) {
        const { refreshToken } = useAuthStore.getState();
        if (!refreshToken) {
            return Promise.reject(new Error('No refresh token available'));
        }

        // Bare axios call so this request bypasses the interceptors above
        refreshPromise = axios
            .post(`${API_BASE_URL}/admin/auth/refresh`, { refresh_token: refreshToken })
            .then((response) => {
                const { token, refresh_token } = response.data.data;
                useAuthStore.getState().setTokens({
                    accessToken: token,
                    refreshToken: refresh_token,
                });
                return token as string;
            })
            .finally(() => {
                refreshPromise = null;
            });
    }
    return refreshPromise;
};

// Response interceptor - Refresh expired tokens, retry once, else logout
apiClient.interceptors.response.use(
    (response) => {
        // Every reply carries the server's own `Date`. Learning the offset here
        // means no screen has to trust this machine's clock for a rule the
        // server decides — what "today" covers, most of all.
        recordServerDate(response.headers?.date as string | undefined);
        return response;
    },
    async (error: AxiosError<{ message?: string; detail?: string }>) => {
        // A 4xx carries a Date header too, and an error is exactly when the
        // clock is worth correcting.
        recordServerDate(error.response?.headers?.date as string | undefined);
        const originalRequest = error.config as RetriableRequestConfig | undefined;

        if (
            error.response?.status === 401 &&
            originalRequest &&
            !originalRequest._retry &&
            !isAuthEndpoint(originalRequest.url)
        ) {
            originalRequest._retry = true;
            try {
                const newToken = await refreshTokens();
                originalRequest.headers.Authorization = `Bearer ${newToken}`;
                return apiClient(originalRequest);
            } catch {
                forceLogout();
                return Promise.reject(error);
            }
        }

        // 401 with no way to recover (auth endpoint or retried already)
        if (error.response?.status === 401 && !isAuthEndpoint(originalRequest?.url)) {
            forceLogout();
        }

        return Promise.reject(error);
    }
);

// Helper function for GET requests
export const get = async <T>(url: string, params?: Record<string, unknown>): Promise<T> => {
    const response = await apiClient.get<T>(url, { params });
    return response.data;
};

// Helper function for POST requests
export const post = async <T>(url: string, data?: unknown): Promise<T> => {
    const response = await apiClient.post<T>(url, data);
    return response.data;
};

// Helper function for PUT requests
export const put = async <T>(url: string, data?: unknown): Promise<T> => {
    const response = await apiClient.put<T>(url, data);
    return response.data;
};

// Helper function for PATCH requests
export const patch = async <T>(url: string, data?: unknown): Promise<T> => {
    const response = await apiClient.patch<T>(url, data);
    return response.data;
};

// Helper function for DELETE requests
export const del = async <T>(url: string): Promise<T> => {
    const response = await apiClient.delete<T>(url);
    return response.data;
};

// Helper for file uploads
export const uploadFile = async <T>(url: string, formData: FormData): Promise<T> => {
    const response = await apiClient.post<T>(url, formData, {
        headers: {
            'Content-Type': 'multipart/form-data',
        },
    });
    return response.data;
};

// Cache invalidation helper
export const invalidateCache = async (keys: string[]): Promise<void> => {
    await apiClient.post('/admin/cache/invalidate', { keys });
};

export default apiClient;
