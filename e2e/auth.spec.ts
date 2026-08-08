/**
 * Authentication and route guards.
 *
 * The seeded admin accounts are the first thing a fresh deploy needs: if the
 * password hash in the seed does not verify against the app's own hasher,
 * nobody can get in at all, and every other test here fails for a reason that
 * has nothing to do with what it was testing.
 */
import { expect, test } from '@playwright/test';
import { ACCOUNTS, login } from './helpers';

test.describe('Authentication', () => {
    test('an unauthenticated visitor is sent to the login page', async ({ page }) => {
        await page.goto('/analytics');
        await expect(page).toHaveURL(/\/login/);
    });

    test('a wrong password is refused and stays on the login page', async ({ page }) => {
        await page.goto('/login');
        await page.locator('#login_email').fill(ACCOUNTS.superAdmin.email);
        await page.locator('#login_password').fill('definitely-not-the-password');
        await page.getByRole('button', { name: /sign in|login|log in/i }).click();

        await expect(page).toHaveURL(/\/login/);
        // Something must say no. A silent no-op looks identical to a hung
        // request, which is how "login is broken" gets shipped.
        await expect(
            page.locator('.ant-message, .ant-notification, .ant-form-item-explain-error')
        ).toBeVisible();
    });

    test('the seeded super admin can sign in', async ({ page }) => {
        await login(page, ACCOUNTS.superAdmin);
        await expect(page.getByTestId('dashboard-page')).toBeVisible();
    });

    test('every seeded branch manager can sign in', async ({ page }) => {
        for (const account of [ACCOUNTS.colomboManager, ACCOUNTS.kandyManager]) {
            await login(page, account);
            await expect(page.getByTestId('dashboard-page')).toBeVisible();
            await page.goto('/login');
        }
    });
});
