import axios, { AxiosError, AxiosHeaders, type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuthStore } from '../store/authStore';
import { AdminRole } from '../types/admin.types';
import { signIn, signOut } from '../test/users';
import apiClient from './client';

type Handler = (config: InternalAxiosRequestConfig) => { status: number; data?: unknown };

let seen: InternalAxiosRequestConfig[] = [];

function serve(handler: Handler) {
    const adapter: AxiosAdapter = async (config) => {
        seen.push(config);
        const { status, data } = handler(config);
        const response = {
            data: data ?? {},
            status,
            statusText: String(status),
            headers: new AxiosHeaders(),
            config,
        };
        if (status >= 400) {
            throw new AxiosError(`status ${status}`, String(status), config, null, response);
        }
        return response;
    };
    apiClient.defaults.adapter = adapter;
}

beforeEach(() => {
    seen = [];
    // forceLogout() navigates; keep jsdom from trying.
    Object.defineProperty(window, 'location', {
        value: { pathname: '/orders', href: '' },
        writable: true,
        configurable: true,
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    signOut();
});

describe('API client', () => {
    it("sends the bearer token and the scoped admin's branch", async () => {
        signIn(AdminRole.BRANCH_MANAGER, { branch_id: 'colombo' });
        serve(() => ({ status: 200 }));
        await apiClient.get('/admin/orders');
        expect(seen[0].headers.Authorization).toBe('Bearer access-branch_manager');
        expect(seen[0].headers['X-Branch-ID']).toBe('colombo');
    });

    it('sends no token when signed out', async () => {
        serve(() => ({ status: 200 }));
        await apiClient.get('/products');
        expect(seen[0].headers.Authorization).toBeUndefined();
    });

    it('refreshes once on a 401 and replays the request with the new token', async () => {
        signIn(AdminRole.SUPER_ADMIN);
        const refresh = vi.spyOn(axios, 'post').mockResolvedValue({
            data: { data: { token: 'fresh', refresh_token: 'fresh-refresh' } },
        });
        serve((c) => (c.headers.Authorization === 'Bearer fresh' ? { status: 200, data: { ok: 1 } } : { status: 401 }));

        const r = await apiClient.get('/admin/orders');
        expect(r.data).toEqual({ ok: 1 });
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(useAuthStore.getState().token).toBe('fresh');
        expect(useAuthStore.getState().refreshToken).toBe('fresh-refresh');
    });

    it('shares ONE refresh between concurrent 401s (refresh tokens rotate)', async () => {
        signIn(AdminRole.SUPER_ADMIN);
        const refresh = vi.spyOn(axios, 'post').mockResolvedValue({
            data: { data: { token: 'fresh', refresh_token: 'r2' } },
        });
        serve((c) => (c.headers.Authorization === 'Bearer fresh' ? { status: 200 } : { status: 401 }));
        await Promise.all([apiClient.get('/a'), apiClient.get('/b'), apiClient.get('/c')]);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('signs out when the refresh itself fails', async () => {
        signIn(AdminRole.SUPER_ADMIN);
        vi.spyOn(axios, 'post').mockRejectedValue(new Error('expired'));
        serve(() => ({ status: 401 }));
        await expect(apiClient.get('/admin/orders')).rejects.toBeTruthy();
        expect(useAuthStore.getState().isAuthenticated).toBe(false);
        expect(localStorage.getItem('admin_token')).toBeNull();
    });

    it('never tries to refresh a failed login', async () => {
        const refresh = vi.spyOn(axios, 'post');
        serve(() => ({ status: 401 }));
        await expect(apiClient.post('/admin/auth/login', {})).rejects.toBeTruthy();
        expect(refresh).not.toHaveBeenCalled();
    });

    it('passes a 403 through without signing anyone out', async () => {
        signIn(AdminRole.BRANCH_MANAGER, { branch_id: 'c' });
        serve(() => ({ status: 403 }));
        await expect(apiClient.get('/admin/users')).rejects.toBeTruthy();
        expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });
});
