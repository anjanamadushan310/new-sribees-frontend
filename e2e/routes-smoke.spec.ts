/**
 * Every screen opens.
 *
 * The cheapest test with the widest net: sign in as the Super Admin and visit
 * every route in the router. A page passes when it renders its layout, throws
 * no uncaught error, and none of the API calls it makes on load comes back 5xx.
 *
 * This is what catches "the Customers page is blank" after a backend rename, a
 * lazy chunk that fails to load, or a component that crashes on a field the
 * seed data happens to leave null -- the whole class of regression nobody
 * writes a dedicated test for until it has already shipped.
 */
import { expect, test, type Page } from '@playwright/test';
import { ACCOUNTS, login } from './helpers';

// Keep in step with src/router.tsx. Parameterised routes are covered by the
// page that links to them (products/:id/edit from Products, and so on).
const ROUTES = [
    '/',
    '/products',
    '/products/new',
    '/search-misses',
    '/categories',
    '/coupons',
    '/quick-sale',
    '/banners',
    '/orders',
    '/orders/cancellations',
    '/inventory',
    '/inventory/low-stock',
    '/inventory/transfers',
    '/analytics',
    '/analytics/watchlist',
    '/analytics/branch',
    '/users',
    '/branches',
    '/partners',
    '/staff',
    '/customers',
    '/support-tickets',
    '/settings',
    '/settings/app',
    '/settings/platform',
    '/settings/loyalty',
    '/settings/service-areas',
];

function watch(page: Page) {
    const problems: string[] = [];
    page.on('pageerror', (err) => problems.push(`uncaught: ${err.message}`));
    page.on('response', (res) => {
        if (res.url().includes('/api/') && res.status() >= 500) {
            problems.push(`${res.status()} ${res.request().method()} ${new URL(res.url()).pathname}`);
        }
    });
    return problems;
}

test.describe('Every admin screen opens for the Super Admin', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, ACCOUNTS.superAdmin);
    });

    for (const route of ROUTES) {
        test(`${route} renders without errors`, async ({ page }) => {
            const problems = watch(page);
            await page.goto(route);
            await expect(page).not.toHaveURL(/\/login/);
            // The layout's sidebar is the proof the protected shell rendered.
            await expect(page.locator('.ant-layout-sider, .ant-menu').first()).toBeVisible();
            await page.waitForLoadState('networkidle');
            // An Ant Design Result with status 500/error is how a caught crash looks.
            await expect(page.locator('.ant-result-error, .ant-result-500')).toHaveCount(0);
            expect(problems, problems.join('\n')).toEqual([]);
        });
    }
});
