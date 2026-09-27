import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SmsOverview } from '../../api/sms.api';
import { smsApi } from '../../api/sms.api';
import { renderPage } from '../../test/renderPage';
import { signIn, signOut } from '../../test/users';
import { AdminRole } from '../../types/admin.types';
import SmsSettings from './SmsSettings';

vi.mock('../../api/sms.api', () => ({
    smsApi: { overview: vi.fn(), setDailyLimit: vi.fn() },
}));
const api = vi.mocked(smsApi);

function overview(over: Partial<SmsOverview> = {}): SmsOverview {
    return {
        provider: 'notifylk', is_live: true, missing: [], sender_id: 'NotifyDEMO',
        balance: 812.5, balance_error: null, daily_limit: 100, sent_today: 37, remaining_today: 63,
        history: [
            { date: '2026-09-27', sent: 37 },
            { date: '2026-09-26', sent: 12 },
        ],
        rules: {
            resend_wait_seconds: 300, per_number_per_hour: 5, per_number_per_day: 10,
            per_address_per_hour: 10, code_valid_seconds: 180, wrong_tries_per_code: 5,
        },
        ...over,
    };
}

describe('SmsSettings', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        signIn(AdminRole.SUPER_ADMIN);
        api.overview.mockResolvedValue(overview());
    });
    afterEach(signOut);

    it('shows today against the daily limit, the credit and the rules', async () => {
        renderPage(<SmsSettings />);
        expect(await screen.findByText('Sent today')).toBeInTheDocument();
        expect(screen.getByText('37')).toBeInTheDocument();
        expect(screen.getByText('63')).toBeInTheDocument();
        expect(screen.getByText('of 100 a day')).toBeInTheDocument();
        expect(screen.getByText('5 minutes')).toBeInTheDocument();
        expect(screen.getByText('10 an hour')).toBeInTheDocument();
    });

    it('saves a new daily limit', async () => {
        api.setDailyLimit.mockResolvedValue(overview({ daily_limit: 250, remaining_today: 213 }));
        renderPage(<SmsSettings />);
        const box = await screen.findByLabelText('Daily SMS limit');
        fireEvent.change(box, { target: { value: '250' } });
        fireEvent.blur(box);
        fireEvent.click(screen.getByText('Save'));
        await waitFor(() => expect(api.setDailyLimit).toHaveBeenCalledWith(250));
        expect(await screen.findByText('of 250 a day')).toBeInTheDocument();
    });

    it('says plainly when no codes are being texted', async () => {
        api.overview.mockResolvedValue(overview({ provider: 'console', is_live: false, sender_id: null, balance: null }));
        renderPage(<SmsSettings />);
        expect(await screen.findByText(/Codes are written to the server log only/)).toBeInTheDocument();
    });
});
