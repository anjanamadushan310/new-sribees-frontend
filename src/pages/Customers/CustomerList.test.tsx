import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Customer } from '../../api/customers.api';
import { customersApi } from '../../api/customers.api';
import { renderPage } from '../../test/renderPage';
import { signIn, signOut } from '../../test/users';
import { AdminRole } from '../../types/admin.types';
import CustomerList from './CustomerList';

vi.mock('../../api/customers.api', () => ({
    customersApi: {
        list: vi.fn(),
        update: vi.fn(),
        setStatus: vi.fn(),
        getProfile: vi.fn(),
        getOrders: vi.fn(),
        block: vi.fn(),
        unblock: vi.fn(),
        delete: vi.fn(),
    },
}));
const api = vi.mocked(customersApi);

const nimal: Customer = {
    user_id: 'u-1',
    email: 'nimal@example.test',
    full_name: 'Nimal Perera',
    phone: '+94771234567',
    nic: '199512345678',
    alternate_phone: '+94719999999',
    role: 'customer',
    is_active: true,
    is_blocked: false,
    is_verified: true,
    created_at: '2026-09-01T04:30:00Z',
    last_login: null,
} as Customer;

// Text and selector queries, not role queries: a role query walks the whole
// table's accessibility tree, which is slow enough in jsdom to time out.
function lastButton(row: HTMLElement): HTMLElement {
    const buttons = row.querySelectorAll('button');
    return buttons[buttons.length - 1];
}

async function openEdit() {
    renderPage(<CustomerList />);
    const row = (await screen.findByText('Nimal Perera')).closest('tr')!;
    fireEvent.click(lastButton(row));
    fireEvent.click(await screen.findByText('Edit Info'));
    return waitFor(() => {
        const modal = document.querySelector('.ant-modal');
        expect(modal).not.toBeNull();
        return modal as HTMLElement;
    });
}

function save(dialog: HTMLElement) {
    fireEvent.click(within(dialog).getByText('OK').closest('button')!);
}

describe('CustomerList', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.list.mockResolvedValue({ customers: [nimal], total: 1, page: 1, limit: 10, pages: 1 });
        api.update.mockResolvedValue(undefined);
    });
    afterEach(signOut);

    it('lists customers with their contact details', async () => {
        signIn(AdminRole.SUPER_ADMIN);
        renderPage(<CustomerList />);
        expect(await screen.findByText('Nimal Perera')).toBeInTheDocument();
        expect(screen.getByText('+94771234567')).toBeInTheDocument();
        expect(api.list).toHaveBeenCalled();
    });

    it("lets Customer Support edit the profile but not the phone, the customer's OTP login", async () => {
        signIn(AdminRole.CUSTOMER_SUPPORT);
        const dialog = await openEdit();
        const phone = within(dialog).getByPlaceholderText('+94771234567');
        expect(phone).toBeDisabled();
        expect(within(dialog).getByText('Only a Super Admin can change this.')).toBeInTheDocument();
        expect(within(dialog).getByPlaceholderText('John Doe')).toBeEnabled();

        fireEvent.change(within(dialog).getByPlaceholderText('John Doe'), { target: { value: 'Nimal P.' } });
        save(dialog);
        await waitFor(() => expect(api.update).toHaveBeenCalled());
        const [id, values] = api.update.mock.calls[0];
        expect(id).toBe('u-1');
        expect(values).toMatchObject({ full_name: 'Nimal P.' });
    });

    it('lets the Super Admin change the phone', async () => {
        signIn(AdminRole.SUPER_ADMIN);
        const dialog = await openEdit();
        const phone = within(dialog).getByPlaceholderText('+94771234567');
        expect(phone).toBeEnabled();
        expect(within(dialog).queryByText('Only a Super Admin can change this.')).not.toBeInTheDocument();

        fireEvent.change(phone, { target: { value: '+94770000001' } });
        save(dialog);
        await waitFor(() => expect(api.update).toHaveBeenCalled());
        expect(api.update.mock.calls[0][1]).toMatchObject({ phone: '+94770000001' });
    });

    it("shows a Branch Manager the list but not the edit action", async () => {
        signIn(AdminRole.BRANCH_MANAGER, { branch_id: 'b-1' });
        renderPage(<CustomerList />);
        const row = (await screen.findByText('Nimal Perera')).closest('tr')!;
        fireEvent.click(lastButton(row));
        expect(await screen.findByText('View Profile')).toBeInTheDocument();
        expect(screen.queryByText('Edit Info')).not.toBeInTheDocument();
    });
});
