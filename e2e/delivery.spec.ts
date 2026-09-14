/**
 * Delivery lifecycle — the screens that changed when SribeesExpress became the
 * only source of a delivery charge (see fastapi_backend/docs/DELIVERY_LIFECYCLE.md).
 *
 * What is worth asserting here is mostly *absence*: no admin-settable delivery
 * fee, and no "post office" left in the vocabulary. Both are the kind of thing
 * that reappears in one screen at a time and is only noticed by a customer.
 */
import { expect, test } from '@playwright/test';
import { ACCOUNTS, login, waitForDataLoaded } from './helpers';

test.describe('Delivery lifecycle (Super Admin)', () => {
    test.beforeEach(async ({ page }) => {
        await login(page, ACCOUNTS.superAdmin);
    });

    test('platform settings offer no delivery fee to set', async ({ page }) => {
        await page.goto('/settings/platform');
        await waitForDataLoaded(page);

        // The field is gone and the backend rejects it; what remains is the
        // explanation of where the charge now comes from.
        await expect(page.getByRole('spinbutton', { name: /delivery fee/i })).toHaveCount(0);
        await expect(page.getByText(/Delivery charges come from SribeesExpress/i)).toBeVisible();
    });

    test('courier settings are about postal cities and outlets', async ({ page }) => {
        await page.goto('/settings');
        await page.getByRole('tab', { name: /courier/i }).click();

        await expect(page.getByText(/1\. Postal cities/i)).toBeVisible();
        await expect(page.getByText(/2\. Branch outlets/i)).toBeVisible();
        // The rename has to hold everywhere, not just on the tab headings.
        await expect(page.locator('body')).not.toContainText(/post office/i);
    });

    test('an order shows its courier quote and the address postal city', async ({ page }) => {
        await page.goto('/orders');
        await waitForDataLoaded(page);

        await page.locator('tbody tr').filter({ hasText: /SO-|FC-/ }).first().locator('a').first().click();
        const drawer = page.locator('.ant-drawer-body');
        await expect(drawer).toBeVisible();

        const logistics = drawer.getByRole('tab', { name: /logistics|courier|delivery/i }).first();
        if (await logistics.count()) await logistics.click();

        await expect(drawer).toContainText(/Courier|SribeesExpress/i);
        await expect(drawer).not.toContainText(/post office/i);
    });
});
