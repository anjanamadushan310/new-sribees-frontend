/**
 * Dashboard — the Super Admin's landing page.
 *
 * The assertion that matters most here is that the numbers are not zero. Every
 * one of these components renders perfectly against an empty database; a
 * dashboard of zeros and blank charts is indistinguishable from a working one
 * unless a test insists on real figures.
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

test.describe('Dashboard (Super Admin)', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, ACCOUNTS.superAdmin);
        await expect(page.getByTestId('dashboard-page')).toBeVisible();
        await waitForDataLoaded(page);
    });

    test('KPI cards show real figures, not placeholder zeros', async ({ page }) => {
        const revenue = parseMoney(await kpiValue(page, 'revenue'));
        const orders = parseCount(await kpiValue(page, 'orders'));
        const customers = parseCount(await kpiValue(page, 'active-customers'));

        expect(revenue).toBeGreaterThan(0);
        expect(orders).toBeGreaterThan(0);
        expect(customers).toBeGreaterThan(0);

        // Low stock is a count, so zero is a legitimate answer — assert only
        // that the card resolved to a number rather than staying blank.
        expect(parseCount(await kpiValue(page, 'low-stock-alerts'))).not.toBeNaN();
    });

    test('each KPI reports a change against the previous period', async ({ page }) => {
        // "No prior period" is a valid state, so accept either — what must not
        // happen is a card with no comparison element at all.
        const deltas = page.getByTestId('delta').or(page.getByTestId('delta-none'));
        expect(await deltas.count()).toBeGreaterThanOrEqual(3);
    });

    test('both trend charts render', async ({ page }) => {
        // Recharts draws into SVG; a chart that failed to get data renders the
        // container but no path.
        const paths = page.locator('.recharts-surface path');
        expect(await paths.count()).toBeGreaterThan(0);
    });

    test('the branch table lists every branch in the network', async ({ page }) => {
        const table = page.getByTestId('branch-performance');
        await expect(table).toBeVisible();
        for (const code of BRANCH_CODES) {
            await expect(table.getByTestId(`branch-row-${code}`)).toBeVisible();
        }
    });

    test('branch revenues add up to the headline revenue', async ({ page }) => {
        // The single most valuable invariant on the page: the league table and
        // the KPI card are computed by different queries, and a reader who
        // spots them disagreeing stops trusting the whole screen.
        const headline = parseMoney(await kpiValue(page, 'revenue'));

        const table = page.getByTestId('branch-performance');
        let sum = 0;
        for (const code of BRANCH_CODES) {
            const row = table.getByTestId(`branch-row-${code}`);
            const revenueCell = row.locator('td').nth(1);
            sum += parseMoney((await revenueCell.textContent()) ?? '');
        }

        // Rounding to whole rupees happens per cell, so allow a rupee of slack
        // per branch rather than demanding exact equality.
        expect(Math.abs(sum - headline)).toBeLessThanOrEqual(BRANCH_CODES.length);
    });

    test('switching the period changes the figures', async ({ page }) => {
        const thirtyDays = parseMoney(await kpiValue(page, 'revenue'));

        await page.getByTestId('period-filter').getByText('7 days').click();
        await waitForDataLoaded(page);

        const sevenDays = parseMoney(await kpiValue(page, 'revenue'));
        expect(sevenDays).toBeGreaterThan(0);
        // A week cannot out-earn the month that contains it.
        expect(sevenDays).toBeLessThan(thirtyDays);
    });

    test('clicking a branch row scopes the page to that branch', async ({ page }) => {
        const networkRevenue = parseMoney(await kpiValue(page, 'revenue'));

        await page.getByTestId('branch-performance').getByTestId('branch-row-CMB').click();
        await waitForDataLoaded(page);

        const branchRevenue = parseMoney(await kpiValue(page, 'revenue'));
        expect(branchRevenue).toBeGreaterThan(0);
        expect(branchRevenue).toBeLessThan(networkRevenue);
    });
});
