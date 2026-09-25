import { describe, expect, it } from 'vitest';
import { apiErrorMessage, mergeSeries } from './analytics';

describe('mergeSeries', () => {
    it('aligns the previous period by position, not by date', () => {
        const rows = mergeSeries(
            [
                { date: '2026-09-24', revenue: 100, orders: 1 },
                { date: '2026-09-25', revenue: 50, orders: 1, is_partial: true },
            ] as never,
            [
                { date: '2026-08-24', revenue: 80, orders: 2 },
                { date: '2026-08-25', revenue: 90, orders: 3 },
            ] as never,
        );
        expect(rows[0]).toMatchObject({ date: '2026-09-24', prevDate: '2026-08-24', prevRevenue: 80 });
        expect(rows[1]).toMatchObject({ isPartial: true, prevOrders: 3 });
    });

    it('works without a comparison series', () => {
        const rows = mergeSeries([{ date: 'd', revenue: 1, orders: 1 }] as never);
        expect(rows[0].prevRevenue).toBeUndefined();
    });
});

describe('apiErrorMessage', () => {
    it('prefers FastAPI detail, then the transport message, then a fallback', () => {
        expect(apiErrorMessage({ response: { data: { detail: 'Branch not found' } } })).toBe('Branch not found');
        expect(apiErrorMessage({ message: 'Network Error' })).toBe('Network Error');
        expect(apiErrorMessage({ response: { data: { detail: [{ msg: 'x' }] } } })).toBe('Please try again.');
        expect(apiErrorMessage(undefined)).toBe('Please try again.');
    });
});
