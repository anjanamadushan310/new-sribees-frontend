/**
 * Shared helpers for the end-to-end suite.
 *
 * The accounts below are the ones migrations/026_seed_full_dataset.sql creates.
 * The seed IS the fixture: these tests do not create their own data, because
 * data a test invents proves the test can invent data, not that the deployed
 * seed works.
 */
import { expect, type Page } from '@playwright/test';

export const ACCOUNTS = {
    superAdmin: { email: 'superadmin@sribeesonline.lk', password: 'Admin@123' },
    colomboManager: { email: 'manager.colombo@sribeesonline.lk', password: 'Admin@123' },
    kandyManager: { email: 'manager.kandy@sribeesonline.lk', password: 'Admin@123' },
    marketing: { email: 'marketing@sribeesonline.lk', password: 'Admin@123' },
    inventory: { email: 'inventory@sribeesonline.lk', password: 'Admin@123' },
} as const;

/** Branch codes seeded by migrations/010_seed_branches.sql. */
export const BRANCH_CODES = ['CMB', 'KDY', 'GLE', 'NGB', 'KUR'] as const;

export async function login(page: Page, account: { email: string; password: string }) {
    await page.goto('/login');
    await page.locator('#login_email').fill(account.email);
    await page.locator('#login_password').fill(account.password);
    await page.getByRole('button', { name: /sign in|login|log in/i }).click();
    // The dashboard is the landing route, so leaving /login is the signal that
    // authentication actually succeeded rather than silently re-rendering.
    await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
}

/**
 * Read a KPI card's displayed value, e.g. kpiValue(page, 'revenue').
 * Waits for the card's skeleton to resolve first.
 */
export async function kpiValue(page: Page, slug: string): Promise<string> {
    const card = page.getByTestId(`kpi-${slug}`);
    await expect(card).toBeVisible();
    const value = card.locator('.ant-statistic-content-value');
    await expect(value).toBeVisible();
    return ((await value.textContent()) ?? '').trim();
}

/**
 * Parse "Rs 4,475,743" / "LKR 4,475,743.00" into a number.
 *
 * Currency symbol and grouping vary with the runtime's Intl data, so the parse
 * strips everything that is not a digit or a decimal point rather than trying
 * to match one exact format.
 */
export function parseMoney(text: string): number {
    const cleaned = text.replace(/[^0-9.]/g, '');
    return cleaned ? Number.parseFloat(cleaned) : Number.NaN;
}

export function parseCount(text: string): number {
    const cleaned = text.replace(/[^0-9]/g, '');
    return cleaned ? Number.parseInt(cleaned, 10) : Number.NaN;
}

/** Waits until every antd skeleton on the page has been replaced by content. */
export async function waitForDataLoaded(page: Page) {
    await expect(page.locator('.ant-skeleton')).toHaveCount(0, { timeout: 30_000 });
}
