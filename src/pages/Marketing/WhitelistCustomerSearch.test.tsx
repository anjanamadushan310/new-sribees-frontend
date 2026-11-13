import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerSuggestion } from '../../api/coupons.api';
import { couponsApi } from '../../api/coupons.api';
import { renderPage } from '../../test/renderPage';
import WhitelistCustomerSearch from './WhitelistCustomerSearch';
import { canonicalMobile, isListed, localMobile } from './whitelist';

vi.mock('../../api/coupons.api', () => ({ couponsApi: { searchCustomers: vi.fn() } }));
const api = vi.mocked(couponsApi);

const nimal: CustomerSuggestion = {
    user_id: 'u-1', name: 'Nimal Perera', phone: '+94771234567', email: 'nimal@x.lk',
    customer_code: 'SB-12345', auth_provider: null, is_blocked: false,
};
const google: CustomerSuggestion = {
    user_id: 'u-2', name: 'Nirmala Silva', phone: null, email: 'nirmala@gmail.com',
    customer_code: 'SB-54321', auth_provider: 'google', is_blocked: false,
};

const type = (value: string) =>
    fireEvent.change(screen.getByLabelText('Search customers to add'), { target: { value } });

describe('WhitelistCustomerSearch', () => {
    beforeEach(() => {
        api.searchCustomers.mockReset();
    });

    it('suggests customers from the first letters and adds the picked account', async () => {
        api.searchCustomers.mockResolvedValue([nimal, google]);
        const onAdd = vi.fn();
        renderPage(<WhitelistCustomerSearch listed={[]} onAdd={onAdd} />);
        type('n');
        expect(await screen.findByText('Nimal Perera')).toBeInTheDocument();
        expect(api.searchCustomers).toHaveBeenCalledWith('n', expect.anything());
        expect(screen.getByText('0771234567 · nimal@x.lk · SB-12345')).toBeInTheDocument();
        // A Google customer with no number is still offered, by email.
        expect(screen.getByText('nirmala@gmail.com · SB-54321')).toBeInTheDocument();

        fireEvent.click(screen.getByText('Nirmala Silva'));
        expect(onAdd).toHaveBeenCalledWith({
            user_id: 'u-2', name: 'Nirmala Silva', phone: null, email: 'nirmala@gmail.com', customer_code: 'SB-54321',
        });
    });

    it('marks a customer already on the list', async () => {
        api.searchCustomers.mockResolvedValue([nimal]);
        renderPage(<WhitelistCustomerSearch listed={[{ name: 'N', phone: '+94771234567' }]} onAdd={vi.fn()} />);
        type('nim');
        expect(await screen.findByText('Added')).toBeInTheDocument();
    });

    it('offers a full number nobody has as a number on its own', async () => {
        api.searchCustomers.mockResolvedValue([]);
        const onAdd = vi.fn();
        renderPage(<WhitelistCustomerSearch listed={[]} onAdd={onAdd} />);
        type('0719876543');
        const offer = await screen.findByText('(not signed up yet)');
        fireEvent.click(offer);
        await waitFor(() => expect(onAdd).toHaveBeenCalledWith({ name: '0719876543', phone: '+94719876543' }));
    });
});

describe('whitelist helpers', () => {
    it('reads a number in any shape', () => {
        expect(canonicalMobile('077 123 4567')).toBe('+94771234567');
        expect(canonicalMobile('94771234567')).toBe('+94771234567');
        expect(canonicalMobile('12345')).toBeNull();
        expect(localMobile('+94771234567')).toBe('0771234567');
        expect(localMobile(null)).toBe('');
    });

    it('matches a listed customer by account or by number', () => {
        const listed = [{ name: 'A', user_id: 'u-1' }, { name: 'B', phone: '+94771111111' }];
        expect(isListed(listed, { user_id: 'u-1' })).toBe(true);
        expect(isListed(listed, { phone: '0771111111' })).toBe(true);
        expect(isListed(listed, { user_id: 'u-9', phone: '0772222222' })).toBe(false);
    });
});
