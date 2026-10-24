import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InventoryItem } from '../../api/inventory.api';
import { inventoryApi } from '../../api/inventory.api';
import { referralCommissionApi } from '../../api/referralCommission.api';
import { weightOptionsApi } from '../../api/weightOptions.api';
import { renderPage } from '../../test/renderPage';
import { signIn, signOut } from '../../test/users';
import { AdminRole } from '../../types/admin.types';
import BranchInventory from './BranchInventory';

vi.mock('../../api/inventory.api', () => ({
    inventoryApi: { list: vi.fn(), update: vi.fn(), stockable: vi.fn(), stockProduct: vi.fn() },
}));
vi.mock('../../api/branches.api', () => ({ branchesApi: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../api/weightOptions.api', async (importOriginal) => {
    const real = await importOriginal<typeof import('../../api/weightOptions.api')>();
    return { ...real, weightOptionsApi: { get: vi.fn(), setBranchPrice: vi.fn() } };
});
vi.mock('../../api/referralCommission.api', async (importOriginal) => {
    const real = await importOriginal<typeof import('../../api/referralCommission.api')>();
    return {
        ...real,
        referralCommissionApi: { settings: vi.fn(), setBranchRate: vi.fn() },
    };
});
const inventory = vi.mocked(inventoryApi);
const rates = vi.mocked(referralCommissionApi);
const weights = vi.mocked(weightOptionsApi);

function row(over: Partial<InventoryItem>): InventoryItem {
    return {
        inventory_id: 'inv-1', product_id: 'p-1', product_name: 'Samba Rice 5kg', sku: 'RICE5', branch_id: 'b-1',
        branch_name: 'Colombo', branch_price: null, global_price: 1000, effective_price: 1000,
        discount_percentage: null, global_discount_percentage: null, effective_discount: null,
        cashback_percentage: null, global_cashback_percentage: null, effective_cashback: 1,
        referral_commission_percentage: null, global_referral_commission_percentage: null,
        effective_referral_commission: 0, is_on_sale: false, stock_quantity: 20, reserved_quantity: 0,
        available_quantity: 20, low_stock_threshold: 5, is_low_stock: false, is_active: true, ...over,
    };
}

describe('BranchInventory commission', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        inventory.list.mockResolvedValue({
            items: [
                row({ effective_referral_commission: 5, referral_commission_percentage: 5,
                      global_referral_commission_percentage: 2 }),
                row({ inventory_id: 'inv-2', product_id: 'p-2', product_name: 'Iodised Salt' }),
            ],
            total: 2, page: 1, limit: 10, total_pages: 1,
            scope: { is_super_admin: false, branch_id: 'b-1' },
        });
        inventory.update.mockResolvedValue(row({}));
        rates.settings.mockResolvedValue({ branch_max_percent: 10, level2_share: 0.5, highest_live_percent: 5 });
        rates.setBranchRate.mockResolvedValue({
            product_id: 'p-1', referral_commission_percentage: 7, global_referral_commission_percentage: 2,
            effective_referral_commission: 7,
        });
    });
    beforeEach(() => {
        weights.get.mockResolvedValue({ product_id: 'p-1', sold_by_weight: false, branch_id: 'b-1', options: [] });
    });
    afterEach(() => signOut());

    it('shows what each product earns and where the rate comes from', async () => {
        signIn(AdminRole.BRANCH_MANAGER, { branch_id: 'b-1' });
        renderPage(<BranchInventory />);
        const rice = (await screen.findByText('Samba Rice 5kg')).closest('tr')!;
        expect(within(rice).getByText('5%')).toBeTruthy();
        expect(within(rice).getByText('Branch')).toBeTruthy();
        const salt = screen.getByText('Iodised Salt').closest('tr')!;
        expect(within(salt).getByText('Off')).toBeTruthy();
    });

    it('does not call commission endpoint when rate was not changed', async () => {
        signIn(AdminRole.BRANCH_MANAGER, { branch_id: 'b-1' });
        renderPage(<BranchInventory />);
        const rice = (await screen.findByText('Samba Rice 5kg')).closest('tr')!;

        fireEvent.click(within(rice).getByText('Quick Edit'));
        fireEvent.click(await screen.findByRole('button', { name: 'Save' }));
        await waitFor(() => expect(inventory.update).toHaveBeenCalledTimes(1));
        expect(rates.setBranchRate).not.toHaveBeenCalled();
    });

    it('saves a changed rate through the commission endpoint, and only then', async () => {
        signIn(AdminRole.BRANCH_MANAGER, { branch_id: 'b-1' });
        renderPage(<BranchInventory />);
        const rice = (await screen.findByText('Samba Rice 5kg')).closest('tr')!;

        fireEvent.click(within(rice).getByText('Quick Edit'));
        const field = await screen.findByPlaceholderText('2 (default)');
        fireEvent.change(field, { target: { value: '7' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() => expect(rates.setBranchRate).toHaveBeenCalledWith('inv-1', 7));
        const payload = inventory.update.mock.calls.at(-1)![1];
        expect(payload).not.toHaveProperty('referral_commission_percentage');
    });

    it('keeps commission away from inventory managers', async () => {
        signIn(AdminRole.INVENTORY_MANAGER, { branch_id: 'b-1' });
        renderPage(<BranchInventory />);
        const rice = (await screen.findByText('Samba Rice 5kg')).closest('tr')!;
        fireEvent.click(within(rice).getByText('Quick Edit'));
        await screen.findByRole('button', { name: 'Save' });
        expect(screen.queryByText('Referral commission (%)')).toBeNull();
        expect(rates.settings).not.toHaveBeenCalled();
    });
});

describe('BranchInventory weight prices', () => {
    const option = (over: object) => ({
        variant_id: 'v-500', weight_grams: 500, label: '500g', global_price: 500, branch_price: null,
        original_price: 500, price: 500, ...over,
    });

    beforeEach(() => {
        vi.clearAllMocks();
        inventory.list.mockResolvedValue({
            items: [row({ product_name: 'White Sugar 1kg' })],
            total: 1, page: 1, limit: 10, total_pages: 1,
            scope: { is_super_admin: false, branch_id: 'b-1' },
        });
        rates.settings.mockResolvedValue({ branch_max_percent: 10, level2_share: 0.5, highest_live_percent: 5 });
        weights.get.mockResolvedValue({
            product_id: 'p-1', sold_by_weight: true, branch_id: 'b-1',
            options: [option({}), option({ variant_id: 'v-1k', weight_grams: 1000, label: '1kg', global_price: 1000, branch_price: 950 })],
        });
        weights.setBranchPrice.mockResolvedValue({ product_id: 'p-1', sold_by_weight: true, branch_id: 'b-1', options: [] });
    });
    afterEach(() => signOut());

    it('lets a branch manager price each weight, sending only the ones changed', async () => {
        signIn(AdminRole.BRANCH_MANAGER, { branch_id: 'b-1' });
        renderPage(<BranchInventory />);
        const sugar = (await screen.findByText('White Sugar 1kg')).closest('tr')!;
        fireEvent.click(within(sugar).getByText('Quick Edit'));

        const half = await screen.findByLabelText('Branch price for 500g');
        fireEvent.change(half, { target: { value: '520' } });
        fireEvent.click(screen.getByRole('button', { name: 'Save weight prices' }));

        await waitFor(() => expect(weights.setBranchPrice).toHaveBeenCalledTimes(1));
        expect(weights.setBranchPrice).toHaveBeenCalledWith('p-1', 'v-500', 520, 'b-1');
    });
});
