import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrderListItem, OrderListResult } from '../../api/orders.api';
import { ordersApi } from '../../api/orders.api';
import { renderPage } from '../../test/renderPage';
import { signIn, signOut } from '../../test/users';
import { AdminRole } from '../../types/admin.types';
import OrderList from './OrderList';

vi.mock('../../api/orders.api', async (importOriginal) => {
    const real = await importOriginal<typeof import('../../api/orders.api')>();
    return { ...real, ordersApi: { ...real.ordersApi, list: vi.fn(), exportCSV: vi.fn(), exportPDF: vi.fn() } };
});
vi.mock('../../api/transfers.api', () => ({ transfersApi: { branches: vi.fn().mockResolvedValue([]) } }));
const list = vi.mocked(ordersApi.list);

function order(over: Partial<OrderListItem>): OrderListItem {
    return {
        order_id: 'o-1', order_number: 'SB-1001', user_id: 'u-1', customer_name: 'Nimal Perera',
        customer_email: null, branch_id: 'b-1', branch_name: 'Colombo', status: 'pending',
        payment_status: 'pending', total_amount: 2450, item_count: 3, created_at: '2026-09-25T04:30:00Z',
        courier_booking_status: null, courier_waybill: null, courier_tracking_status: null, ...over,
    };
}

function result(orders: OrderListItem[], counts: Record<string, number> = {}): OrderListResult {
    return {
        orders, total: orders.length, page: 1, limit: 20, total_pages: 1,
        scope: { is_super_admin: true, branch_id: null }, statusCounts: counts,
    };
}

describe('OrderList', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        signIn(AdminRole.SUPER_ADMIN);
    });
    afterEach(signOut);

    it('shows each order with its parcel state, and flags a parcel no rider was booked for', async () => {
        list.mockResolvedValue(result([
            order({}),
            order({ order_id: 'o-2', order_number: 'SB-1002', status: 'packed', courier_booking_status: 'failed' }),
            order({ order_id: 'o-3', order_number: 'SB-1003', status: 'shipped', courier_waybill: 'WB123',
                    courier_tracking_status: 'in_transit' }),
        ], { pending: 1, packed: 1, shipped: 1 }));
        renderPage(<OrderList />);

        expect(await screen.findByText('SB-1001')).toBeInTheDocument();
        expect(screen.getByText('Not booked')).toBeInTheDocument();
        expect(screen.getByText('WB123')).toBeInTheDocument();
        expect(screen.getByText('in transit')).toBeInTheDocument();
    });

    it('filters by the tab the manager picks', async () => {
        list.mockResolvedValue(result([order({})], { pending: 2, confirmed: 1 }));
        renderPage(<OrderList />);
        await screen.findByText('SB-1001');
        expect(list.mock.calls[0][0]).toMatchObject({ order_statuses: undefined });

        fireEvent.click(screen.getByText(/New Orders/));
        await waitFor(() =>
            expect(list.mock.calls.at(-1)![0]).toMatchObject({ order_statuses: 'pending,confirmed', page: 1 }),
        );
    });

    it('says so when the orders cannot be loaded', async () => {
        list.mockImplementation(async () => {
            throw Object.assign(new Error('500'), { response: { data: { detail: 'Orders are unavailable' } } });
        });
        renderPage(<OrderList />);
        expect(await screen.findByText('Orders are unavailable')).toBeInTheDocument();
    });
});
