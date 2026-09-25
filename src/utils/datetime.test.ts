import { afterEach, describe, expect, it, vi } from 'vitest';
import { DISPLAY_TZ, slt, todayISO } from './datetime';
import { clockSkewMs, isClockSynced, recordServerDate, serverNow } from './server-clock';

afterEach(() => {
    vi.useRealTimers();
    // Reset the learned skew between tests.
    recordServerDate(new Date().toUTCString());
});

describe('Sri Lanka time (the suite runs in New York on purpose)', () => {
    it('renders UTC timestamps in Colombo, whatever the machine zone is', () => {
        expect(DISPLAY_TZ).toBe('Asia/Colombo');
        // 09:30 UTC is 15:00 in Colombo (UTC+5:30, no DST).
        expect(slt('2026-09-25T09:30:00Z').format('YYYY-MM-DD HH:mm')).toBe('2026-09-25 15:00');
    });

    it('starts "today" at Colombo midnight, not the browser\'s', () => {
        // 20:00 UTC on the 24th is already 01:30 on the 25th in Colombo.
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-09-24T20:00:00Z'));
        recordServerDate(new Date('2026-09-24T20:00:00Z').toUTCString());
        expect(todayISO()).toBe('2026-09-25');
        expect(slt().startOf('day').toISOString()).toBe('2026-09-24T18:30:00.000Z');
    });
});

describe('server clock', () => {
    it('uses the server Date header, not the local clock', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-01-01T00:00:00Z')); // a machine a day behind
        recordServerDate('Fri, 02 Jan 2026 00:00:00 GMT');
        expect(isClockSynced()).toBe(true);
        expect(clockSkewMs()).toBe(24 * 3600 * 1000);
        expect(serverNow().toISOString()).toBe('2026-01-02T00:00:00.000Z');
    });

    it('ignores a missing or garbled header instead of guessing', () => {
        recordServerDate('Fri, 02 Jan 2026 00:00:00 GMT');
        const before = clockSkewMs();
        recordServerDate(undefined);
        recordServerDate('not a date');
        expect(clockSkewMs()).toBe(before);
    });
});
