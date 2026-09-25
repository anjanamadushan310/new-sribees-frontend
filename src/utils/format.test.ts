import { describe, expect, it } from 'vitest';
import { compactLKR, formatLKR, formatLKRPrecise, formatNumber, formatPercent, titleCase } from './format';

const digits = (s: string) => s.replace(/[^0-9.-]/g, '');

describe('money formatting', () => {
    it('rounds whole rupees for KPIs and keeps cents where they matter', () => {
        expect(digits(formatLKR(1234567.89))).toBe('1234568');
        expect(digits(formatLKRPrecise(1234.5))).toBe('1234.50');
    });

    it('treats a missing figure as zero rather than printing NaN', () => {
        expect(formatLKR(undefined)).not.toMatch(/NaN|undefined/);
        expect(digits(formatLKR(null))).toBe('0');
        expect(formatNumber(undefined)).toBe('0');
        expect(formatPercent(null)).toBe('0.0%');
    });

    it('compacts axis labels only', () => {
        expect(compactLKR(2_500_000)).toBe('LKR 2.5M');
        expect(compactLKR(12_400)).toBe('LKR 12k');
        expect(compactLKR(999)).toBe('LKR 999');
        expect(compactLKR(-1_500_000)).toBe('LKR -1.5M');
    });
});

describe('titleCase', () => {
    it('turns status slugs into labels', () => {
        expect(titleCase('out_for_delivery')).toBe('Out For Delivery');
        expect(titleCase('pending')).toBe('Pending');
    });
});
