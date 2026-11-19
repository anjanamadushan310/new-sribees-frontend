import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ActivityEvent } from '../../api/activity.api';
import { activityApi } from '../../api/activity.api';
import { renderPage } from '../../test/renderPage';
import ActivityTimeline from './ActivityTimeline';

vi.mock('../../api/activity.api', () => ({ activityApi: { timeline: vi.fn() } }));
const api = vi.mocked(activityApi);

let nextId = 100;
function ev(over: Partial<ActivityEvent>): ActivityEvent {
    nextId -= 1;
    return {
        id: nextId, event: 'app_open', screen: null, product_id: null, product_name: null, category_id: null,
        category_name: null, props: {}, device_id: 'guest_1', platform: 'android', app_version: '1.2.10',
        session_id: 's1', is_guest: false, occurred_at: '2026-11-18T16:55:00Z',
        occurred_at_lk: '2026-11-18 22:25:00', ...over,
    };
}

describe('ActivityTimeline', () => {
    beforeEach(() => vi.clearAllMocks());

    it('tells the story in plain words, grouped by day, guests tagged', async () => {
        api.timeline.mockResolvedValue({
            events: [
                ev({ event: 'sign_up', props: { method: 'google' }, occurred_at_lk: '2026-11-18 22:25:03' }),
                ev({ event: 'screen', screen: 'home', props: { seconds: 95, scroll_pct: 80 }, is_guest: true,
                     occurred_at_lk: '2026-11-18 22:10:00' }),
                ev({ event: 'image_swipe', product_name: 'Basmati Rice 1kg', props: { index: 2, total: 4 },
                     is_guest: true, occurred_at_lk: '2026-11-18 22:06:00' }),
                ev({ event: 'search', props: { query: 'rice' }, is_guest: true, platform: 'web',
                     occurred_at_lk: '2026-11-17 09:00:00' }),
            ],
            has_more: false,
            next_before_id: null,
        });
        renderPage(<ActivityTimeline who={{ userId: 'u-1' }} />);

        expect(await screen.findByText('Signed up with google')).toBeInTheDocument();
        expect(screen.getByText('Home — 1m 35s, scrolled 80%')).toBeInTheDocument();
        expect(screen.getByText('Basmati Rice 1kg')).toBeInTheDocument();
        expect(screen.getByText(/Photo 3 of 4/)).toBeInTheDocument();
        expect(screen.getByText('rice')).toBeInTheDocument();
        expect(screen.getByText('2026-11-18')).toBeInTheDocument();
        expect(screen.getByText('2026-11-17')).toBeInTheDocument();
        expect(screen.getAllByText('Guest')).toHaveLength(3);
        expect(screen.getByText('Web')).toBeInTheDocument();
        expect(api.timeline).toHaveBeenCalledWith({ userId: 'u-1' }, null);
    });

    it('loads older pages on request', async () => {
        api.timeline
            .mockResolvedValueOnce({ events: [ev({ event: 'app_open' })], has_more: true, next_before_id: 42 })
            .mockResolvedValueOnce({ events: [ev({ event: 'sign_out' })], has_more: false, next_before_id: null });
        renderPage(<ActivityTimeline who={{ deviceId: 'guest_1' }} />);

        fireEvent.click(await screen.findByRole('button', { name: /load older/i }));
        expect(await screen.findByText('Signed out')).toBeInTheDocument();
        await waitFor(() => expect(api.timeline).toHaveBeenLastCalledWith({ deviceId: 'guest_1' }, 42));
        expect(screen.queryByRole('button', { name: /load older/i })).not.toBeInTheDocument();
    });

    it('says so when nothing was recorded', async () => {
        api.timeline.mockResolvedValue({ events: [], has_more: false, next_before_id: null });
        renderPage(<ActivityTimeline who={{ userId: 'u-2' }} />);
        expect(await screen.findByText('No activity recorded yet')).toBeInTheDocument();
    });
});
