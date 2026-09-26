import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Coupon } from '../../api/coupons.api';
import { couponsApi } from '../../api/coupons.api';
import { renderPage } from '../../test/renderPage';
import { signIn, signOut } from '../../test/users';
import { AdminRole } from '../../types/admin.types';
import CouponList from './CouponList';

vi.mock('../../api/coupons.api', () => ({
    couponsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), deactivate: vi.fn(), delete: vi.fn() },
}));
vi.mock('../../api/loyalty.api', () => ({ loyaltyApi: { listTiers: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../api/categories.api', () => ({ categoriesApi: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../api/branches.api', () => ({ branchesApi: { list: vi.fn().mockResolvedValue([]) } }));
const api = vi.mocked(couponsApi);

function coupon(over: Partial<Coupon>): Coupon {
    return {
        coupon_id: 'c-1', code: 'RICE10', branch_id: null, branch_name: null, is_network_wide: true,
        description: 'Ten off rice', discount_type: 'percentage', discount_value: 10, min_order_value: 0,
        max_discount_amount: null, usage_limit: null, used_count: 4, per_user_limit: null, is_public: true,
        valid_from: '2026-09-01T00:00:00Z', valid_until: '2026-12-31T00:00:00Z', is_active: true,
        created_at: '2026-09-01T00:00:00Z', budget_cap: 10000, budget_spent: 9600, budget_used_percent: 96,
        auto_stop_on_budget: true, exclude_quick_sale: false, first_order_only: false, min_tier_id: null,
        target_user_id: null, category_ids: [], product_ids: [], status: 'active', revenue_generated: 54000,
        orders_count: 12, ...over,
    } as Coupon;
}

describe('CouponList', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        signIn(AdminRole.MARKETING_MANAGER, { branch_id: 'b-1' });
        api.list.mockResolvedValue({
            coupons: [
                coupon({}),
                coupon({ coupon_id: 'c-2', code: 'GONE', status: 'depleted' }),
                coupon({ coupon_id: 'c-3', code: 'OLD', status: 'expired' }),
            ],
            total: 3, page: 1, limit: 10, total_pages: 1,
        } as Awaited<ReturnType<typeof couponsApi.list>>);
        api.deactivate.mockResolvedValue(undefined as never);
    });
    afterEach(signOut);

    it('shows each coupon with its derived status', async () => {
        renderPage(<CouponList />);
        expect(await screen.findByText('RICE10')).toBeInTheDocument();
        const gone = screen.getByText('GONE').closest('tr')!;
        expect(within(gone).getByText('Budget Depleted')).toBeInTheDocument();
        const old = screen.getByText('OLD').closest('tr')!;
        expect(within(old).getByText('Expired')).toBeInTheDocument();
    });

    it('filters by status on the server', async () => {
        renderPage(<CouponList />);
        await screen.findByText('RICE10');
        fireEvent.click(screen.getAllByText('Budget Depleted').find((el) => el.closest('.ant-segmented'))!);
        await waitFor(() => expect(api.list.mock.calls.at(-1)![0]).toMatchObject({ status: 'depleted' }));
    });

    it('deactivates only a live coupon, after confirming', async () => {
        renderPage(<CouponList />);
        // Text queries, not role queries: a role query walks the whole table's
        // accessibility tree, which is slow enough in jsdom to time out.
        const live = (await screen.findByText('RICE10')).closest('tr')!;
        fireEvent.click(within(live).getByText('Deactivate').closest('button')!);
        const confirm = await waitFor(() => {
            const pop = document.querySelector('.ant-popconfirm');
            expect(pop).not.toBeNull();
            return pop as HTMLElement;
        });
        fireEvent.click(within(confirm).getByText('Deactivate').closest('button')!);
        await waitFor(() => expect(api.deactivate).toHaveBeenCalledWith('c-1'));

        const old = screen.getByText('OLD').closest('tr')!;
        const oldButton = within(old).queryByText('Deactivate')?.closest('button');
        expect(oldButton == null || oldButton.disabled).toBe(true);
    });
});
