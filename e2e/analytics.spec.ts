/**
 * Analytics & Reports.
 *
 * This page was, until recently, entirely hardcoded mock data — it rendered
 * beautifully and meant nothing. These tests exist so that cannot happen again
 * silently: they assert the figures come from the API, agree with the Dashboard,
 * and change when the filters change.
 */
import { expect, test } from '@playwright/test';
import {
    ACCOUNTS,
    BRANCH_CODES,
    kpiValue,
    login,
    parseCount,
    parseMoney,
    waitForDataLoaded,
} from './helpers';

test.describe('Analytics (Super Admin)', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, ACCOUNTS.superAdmin);
        await page.goto('/analytics');
        await expect(page.getByTestId('analytics-page')).toBeVisible();
        await waitForDataLoaded(page);
    });

    test('no request failed', async ({ page }) => {
        // The page surfaces any failed query as a single alert. Catching it
        // here names the real problem instead of leaving a downstream
        // assertion to fail on an empty table for unclear reasons.
        await expect(page.locator('.ant-alert-error')).toHaveCount(0);
    });

    test('all five KPI cards carry real values', async ({ page }) => {
        expect(parseMoney(await kpiValue(page, 'revenue'))).toBeGreaterThan(0);
        expect(parseCount(await kpiValue(page, 'orders'))).toBeGreaterThan(0);
        expect(parseMoney(await kpiValue(page, 'avg-order-value'))).toBeGreaterThan(0);
        expect(parseCount(await kpiValue(page, 'customers'))).toBeGreaterThan(0);
        expect(parseCount(await kpiValue(page, 'items-sold'))).toBeGreaterThan(0);
    });

    test('every section renders with rows', async ({ page }) => {
        for (const id of ['branch-performance', 'category-mix', 'order-fulfilment', 'top-products', 'top-customers']) {
            const section = page.getByTestId(id);
            await expect(section).toBeVisible();
            await expect(section.locator('.ant-empty')).toHaveCount(0);
        }

        await expect(
            page.getByTestId('top-products').locator('tbody tr.ant-table-row')
        ).not.toHaveCount(0);
        await expect(
            page.getByTestId('top-customers').locator('tbody tr.ant-table-row')
        ).not.toHaveCount(0);
    });

    test('top products are ranked highest-revenue first', async ({ page }) => {
        // Revenue is the last column of the Top products table.
        const rows = page.getByTestId('top-products').locator('tbody tr.ant-table-row');
        const count = await rows.count();
        expect(count).toBeGreaterThan(1);

        const revenues: number[] = [];
        for (let i = 0; i < count; i++) {
            revenues.push(parseMoney((await rows.nth(i).locator('td').last().textContent()) ?? ''));
        }
        for (let i = 1; i < revenues.length; i++) {
            expect(revenues[i - 1]).toBeGreaterThanOrEqual(revenues[i]);
        }
    });

    test('the category mix is drawn and adds to about 100%', async ({ page }) => {
        const mix = page.getByTestId('category-mix');
        await expect(mix.locator('.recharts-pie-sector, .recharts-sector')).not.toHaveCount(0);

        const shares = await mix.locator('span, div').allTextContents();
        const percentages = shares
            .map((t) => t.match(/^(\d+(?:\.\d+)?)%$/)?.[1])
            .filter(Boolean)
            .map(Number);
        expect(percentages.length).toBeGreaterThan(0);
        const total = percentages.reduce((a, b) => a + b, 0);
        expect(total).toBeGreaterThan(98);
        expect(total).toBeLessThan(102);
    });

    test('the branch filter narrows the whole page', async ({ page }) => {
        const networkRevenue = parseMoney(await kpiValue(page, 'revenue'));

        await page.getByTestId('branch-filter').click();
        // Target the rendered dropdown item, not getByRole('option'): rc-select
        // also renders a visually hidden option list for screen readers whose
        // text is the raw value, and that decoy is what an accessible-name
        // match resolves to first — then never becomes clickable.
        await page
            .locator('.ant-select-item-option')
            .filter({ hasText: 'Colombo Main' })
            .click();
        await waitForDataLoaded(page);

        const branchRevenue = parseMoney(await kpiValue(page, 'revenue'));
        expect(branchRevenue).toBeGreaterThan(0);
        expect(branchRevenue).toBeLessThan(networkRevenue);
    });

    test('the Dashboard and Analytics report the same revenue', async ({ page }) => {
        // Two screens, two sets of components, one figure. If these ever
        // diverge, at least one of them is lying and there is no way for a
        // reader to tell which.
        const analytics = parseMoney(await kpiValue(page, 'revenue'));

        await page.goto('/');
        await expect(page.getByTestId('dashboard-page')).toBeVisible();
        await waitForDataLoaded(page);
        const dashboard = parseMoney(await kpiValue(page, 'revenue'));

        expect(dashboard).toBe(analytics);
    });
});

test.describe('Branch isolation', () => {
    test('a Branch Manager sees only their own branch', async ({ page }) => {
        await login(page, ACCOUNTS.colomboManager);
        await page.goto('/analytics');
        await expect(page.getByTestId('analytics-page')).toBeVisible();
        await waitForDataLoaded(page);

        await expect(page.locator('.ant-alert-error')).toHaveCount(0);

        // No branch picker: the server ignores branch_id for a scoped admin, so
        // offering the control would be offering something that does nothing.
        await expect(page.getByTestId('branch-filter')).toHaveCount(0);
        await expect(page.getByText(/your branch only/i)).toBeVisible();

        const table = page.getByTestId('branch-performance');
        await expect(table.getByTestId('branch-row-CMB')).toBeVisible();
        for (const code of BRANCH_CODES.filter((c) => c !== 'CMB')) {
            await expect(table.getByTestId(`branch-row-${code}`)).toHaveCount(0);
        }
    });

    test('two Branch Managers see different figures', async ({ page }) => {
        // Isolation that returns the same number for every manager is not
        // isolation — it is a filter that silently does nothing.
        await login(page, ACCOUNTS.colomboManager);
        await waitForDataLoaded(page);
        const colombo = parseMoney(await kpiValue(page, 'revenue'));

        await login(page, ACCOUNTS.kandyManager);
        await waitForDataLoaded(page);
        const kandy = parseMoney(await kpiValue(page, 'revenue'));

        expect(colombo).toBeGreaterThan(0);
        expect(kandy).toBeGreaterThan(0);
        expect(colombo).not.toBe(kandy);
    });
});

test.describe('Role visibility', () => {
    for (const [label, account] of [
        ['Marketing Manager', ACCOUNTS.marketing],
        ['Inventory Manager', ACCOUNTS.inventory],
    ] as const) {
        test(`${label} is not offered Analytics`, async ({ page }) => {
            await login(page, account);

            // The API refuses these roles, so the sidebar must not advertise a
            // page that can only answer 403.
            await expect(page.locator('.ant-menu').getByText('Analytics')).toHaveCount(0);

            await page.goto('/analytics');
            await expect(page.getByTestId('analytics-page')).toHaveCount(0);
        });
    }
});
