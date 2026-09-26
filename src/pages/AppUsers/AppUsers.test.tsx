import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppInstall } from '../../api/appUsage.api';
import { appUsageApi } from '../../api/appUsage.api';
import { renderPage } from '../../test/renderPage';
import { signIn, signOut } from '../../test/users';
import { AdminRole } from '../../types/admin.types';
import AppUsers from './AppUsers';

vi.mock('../../api/appUsage.api', () => ({
    appUsageApi: { overview: vi.fn(), installs: vi.fn(), history: vi.fn() },
}));
const api = vi.mocked(appUsageApi);

function install(over: Partial<AppInstall>): AppInstall {
    return {
        device_id: 'guest_1', user_id: 'u-1', customer_name: 'Nimal Perera', customer_phone: '+94771234567',
        is_guest: false, platform: 'android', app_version: '1.4.0', build_number: '14', is_latest_version: true,
        installed_at: '2026-09-20T04:00:00Z', installed_at_is_estimate: false, first_seen_at: '2026-09-26T04:00:00Z',
        last_seen_at: '2026-09-26T10:00:00Z', is_online: true, today_seconds: 1500, total_seconds: 7300,
        days_active: 3, ...over,
    };
}

describe('AppUsers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        signIn(AdminRole.SUPER_ADMIN);
        const online = install({});
        const old = install({
            device_id: 'guest_2', is_guest: true, customer_name: null, customer_phone: null,
            app_version: '1.3.0', is_latest_version: false, is_online: false,
        });
        api.overview.mockResolvedValue({
            online_count: 1, online: [online], total_installs: 2, active_today: 2, seconds_today: 3900,
            latest_version: '1.4.0', versions: [{ version: '1.4.0', installs: 1 }, { version: '1.3.0', installs: 1 }],
            online_window_minutes: 5, generated_at: '2026-09-26T10:01:00Z',
        });
        api.installs.mockResolvedValue({ installs: [online, old], total: 2, page: 1, limit: 20 });
        api.history.mockResolvedValue({
            install: online,
            days: [
                { date: '2026-09-26', seconds: 1500, opens: 3, measured: true },
                { date: '2026-09-25', seconds: 0, opens: 0, measured: false },
            ],
        });
    });
    afterEach(signOut);

    it('shows who is online, the totals, and who is behind on versions', async () => {
        renderPage(<AppUsers />);
        expect(await screen.findByText('Using the app now')).toBeInTheDocument();
        expect(await screen.findByText('1h 05m')).toBeInTheDocument(); // time in app today
        expect(screen.getAllByText('Nimal Perera').length).toBeGreaterThan(0);
        expect(await screen.findByText('Guest')).toBeInTheDocument();
        expect(screen.getByText('1.3.0 (14)')).toBeInTheDocument();
    });

    it('opens a phone’s day-by-day history, marking days never measured', async () => {
        renderPage(<AppUsers />);
        fireEvent.click((await screen.findByText('Guest')).closest('tr')!);
        await waitFor(() => expect(api.history).toHaveBeenCalledWith('guest_2'));
        expect(await screen.findByText('Daily use since download')).toBeInTheDocument();
        expect(await screen.findByText('Not measured')).toBeInTheDocument();
        const drawer = document.querySelector('.ant-drawer') as HTMLElement;
        expect(within(drawer).getAllByText('25m').length).toBeGreaterThan(0);
    });

    it('searches by name, phone or version', async () => {
        renderPage(<AppUsers />);
        await screen.findByText('Every phone with the app');
        const box = screen.getByPlaceholderText('Name, phone or version');
        fireEvent.change(box, { target: { value: '1.3.0' } });
        fireEvent.keyDown(box, { key: 'Enter', code: 'Enter', keyCode: 13 });
        await waitFor(() =>
            expect(api.installs).toHaveBeenLastCalledWith({ search: '1.3.0', page: 1, limit: 20 }),
        );
    });
});
