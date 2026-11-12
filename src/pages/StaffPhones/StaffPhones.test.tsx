import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StaffPhone } from '../../api/staffPhones.api';
import { staffPhonesApi } from '../../api/staffPhones.api';
import { renderPage } from '../../test/renderPage';
import { signIn, signOut } from '../../test/users';
import { AdminRole } from '../../types/admin.types';
import { PROBLEM_TEXT } from './problemText';
import StaffPhones from './StaffPhones';

vi.mock('../../api/staffPhones.api', () => ({ staffPhonesApi: { list: vi.fn() } }));
const api = vi.mocked(staffPhonesApi);

function phone(over: Partial<StaffPhone>): StaffPhone {
    return {
        device_id: 'd-1', admin_id: 'a-1', full_name: 'Kamal Silva', role: 'branch_manager',
        branch_id: 'b-1', branch_name: 'Matugama', platform: 'android', device_model: 'Samsung SM-A155F',
        app_version: '0.8.0+9', notifications_on: true, channel_state: 'on', background_restricted: false,
        last_seen_at: '2026-11-12T04:00:00Z', can_ring: true, problem: null, ...over,
    };
}

describe('StaffPhones', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        signIn(AdminRole.SUPER_ADMIN);
        api.list.mockResolvedValue({
            phones: [
                phone({}),
                phone({
                    device_id: 'd-2', admin_id: 'a-2', full_name: 'Nimali Perera', role: 'customer_support',
                    channel_state: 'silent', can_ring: false, problem: 'channel_silent',
                }),
                phone({
                    device_id: 'd-3', admin_id: 'a-3', full_name: 'Old App User', app_version: null,
                    notifications_on: null, channel_state: null, can_ring: null, problem: 'unknown',
                    branch_id: 'b-2', branch_name: 'Kalutara',
                }),
            ],
            staff_without_phone: [
                { admin_id: 'a-9', full_name: 'Sunil Fernando', role: 'branch_manager', branch_id: 'b-1', branch_name: 'Matugama' },
            ],
        });
    });
    afterEach(signOut);

    it('shows which phones ring, which do not and why, and staff with no phone', async () => {
        renderPage(<StaffPhones />);
        expect(await screen.findByText('Kamal Silva')).toBeInTheDocument();
        expect(screen.getByText('Rings')).toBeInTheDocument();
        expect(screen.getByText('Will not ring')).toBeInTheDocument();
        expect(screen.getByText('Unknown')).toBeInTheDocument();
        expect(screen.getByText(/1 of 3 ring/)).toBeInTheDocument();
        expect(screen.getByText('Staff with no phone')).toBeInTheDocument();
        expect(screen.getByText(/Sunil Fernando/)).toBeInTheDocument();

        fireEvent.mouseEnter(screen.getByTestId('why-d-2'));
        expect(await screen.findByText(PROBLEM_TEXT.channel_silent)).toBeInTheDocument();
    });

    it('a failed load says so, not "no phones"', async () => {
        api.list.mockRejectedValue(new Error('403'));
        renderPage(<StaffPhones />);
        expect(await screen.findByText('Could not load the staff phones')).toBeInTheDocument();
        expect(screen.queryByText('No staff phone has signed in to the app yet')).not.toBeInTheDocument();
    });

    it('narrows to one branch', async () => {
        renderPage(<StaffPhones />);
        await screen.findByText('Kamal Silva');
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Branch' }));
        fireEvent.click(await screen.findByTitle('Kalutara'));
        await waitFor(() => expect(screen.queryByText('Kamal Silva')).not.toBeInTheDocument());
        expect(screen.getByText('Old App User')).toBeInTheDocument();
        expect(screen.queryByText('Staff with no phone')).not.toBeInTheDocument();
    });
});
