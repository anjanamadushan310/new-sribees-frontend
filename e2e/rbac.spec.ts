/**
 * Role-based access, from the browser AND from the API.
 *
 * A hidden menu item is a convenience, not a control. Each case here checks
 * both halves: the screen is not reachable for the role, and the API behind it
 * refuses the role's own token when called directly -- which is what an
 * attacker with a Branch Manager login would do.
 */
import { expect, test, type Page } from '@playwright/test';
import { ACCOUNTS, login } from './helpers';

async function tokenOf(page: Page): Promise<string> {
    return page.evaluate(() => localStorage.getItem('admin_token') ?? '');
}

async function apiStatus(page: Page, path: string, method = 'GET'): Promise<number> {
    const token = await tokenOf(page);
    const res = await page.request.fetch(`/api/v1${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        data: method === 'GET' ? undefined : {},
    });
    return res.status();
}

test.describe('Branch Manager', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, ACCOUNTS.colomboManager);
    });

    test('cannot open Super-Admin screens', async ({ page }) => {
        for (const route of ['/users', '/branches', '/settings/platform']) {
            await page.goto(route);
            await expect(page).not.toHaveURL(new RegExp(`${route}$`));
        }
    });

    test('is refused by the API behind those screens', async ({ page }) => {
        expect(await apiStatus(page, '/admin/users')).toBe(403);
        expect(await apiStatus(page, '/admin/branches', 'POST')).toBeGreaterThanOrEqual(403);
        // The legacy catalogue and order routes are Super Admin only.
        expect(await apiStatus(page, '/orders/admin/all')).toBe(403);
        expect(await apiStatus(page, '/notifications/admin/broadcast', 'POST')).toBe(403);
    });

    test("never sees another branch's orders", async ({ page }) => {
        const token = await tokenOf(page);
        const ownBranch = await page.evaluate(
            () => JSON.parse(localStorage.getItem('admin_user') ?? '{}').branch_id as string | undefined,
        );
        expect(ownBranch).toBeTruthy();
        // Asking for everything, and for another branch explicitly: the scope
        // is decided by the server from the token, never by the request.
        for (const query of ['limit=100', 'limit=100&branch_id=b0000000-0000-4000-a000-000000000002']) {
            const res = await page.request.get(`/api/v1/admin/orders?${query}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            expect(res.status()).toBe(200);
            const body = await res.json();
            const orders: { branch_id?: string | null }[] = body?.data?.orders ?? [];
            const foreign = orders.filter((o) => o.branch_id && o.branch_id !== ownBranch);
            expect(foreign, `${query}: ${foreign.length} orders from other branches`).toEqual([]);
        }
    });
});

test.describe('Marketing Manager', () => {
    test('cannot read analytics the server reserves for managers', async ({ page }) => {
        await login(page, ACCOUNTS.marketing);
        expect(await apiStatus(page, '/admin/analytics/summary?days=30')).toBe(403);
    });
});

test.describe('Signed out', () => {
    test('a stale token in storage does not open the app', async ({ page }) => {
        await page.goto('/login');
        await page.evaluate(() => {
            localStorage.setItem(
                'admin-auth-storage',
                JSON.stringify({
                    state: {
                        user: { admin_id: 'x', email: 'x', full_name: 'x', role: 'super_admin', permissions: [] },
                        token: 'forged.token.value',
                        refreshToken: 'forged',
                        isAuthenticated: true,
                    },
                    version: 0,
                }),
            );
        });
        await page.goto('/users');
        // The first API call 401s, the refresh fails, and the app signs out.
        await expect(page).toHaveURL(/\/login/, { timeout: 30_000 });
    });
});
