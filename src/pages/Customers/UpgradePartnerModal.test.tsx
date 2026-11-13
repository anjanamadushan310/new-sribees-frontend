import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { partnersApi } from '../../api/partners.api';
import type { Customer } from '../../api/customers.api';
import { renderPage } from '../../test/renderPage';
import UpgradePartnerModal from './UpgradePartnerModal';

vi.mock('../../api/partners.api', () => ({ partnersApi: { list: vi.fn(), upgradeCustomer: vi.fn() } }));
const api = vi.mocked(partnersApi);
const customer = { user_id: 'customer-test-id', full_name: 'Kamal Test', email: 'kamal@example.test', phone: '+94770000000' } as Customer;

describe('customer Partner upgrade', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        api.list.mockResolvedValue([]);
        api.upgradeCustomer.mockResolvedValue({ invitation_sent: true });
    });

    function fill() {
        fireEvent.change(screen.getByLabelText('Customer request / verification reference'), { target: { value: 'Verified support request' } });
    }

    it('requires identity and consent confirmation before submitting', async () => {
        renderPage(<UpgradePartnerModal customer={customer} onClose={vi.fn()} />);
        fill();
        fireEvent.click(screen.getByText('Approve Partner Upgrade'));
        expect(await screen.findByText('Confirm customer identity and consent.')).toBeInTheDocument();
        expect(api.upgradeCustomer).not.toHaveBeenCalled();
    });

    it('upgrades the selected customer and allows an unassigned Partner', async () => {
        const close = vi.fn();
        renderPage(<UpgradePartnerModal customer={customer} onClose={close} />);
        fill();
        fireEvent.click(screen.getByText('I verified this customer’s identity and their request to become a Partner.'));
        fireEvent.click(screen.getByText('Approve Partner Upgrade'));
        await waitFor(() => expect(api.upgradeCustomer).toHaveBeenCalledWith(customer.user_id, {
            invitation_channel: 'email', master_partner_id: null, customer_consent_confirmed: true, note: 'Verified support request',
        }));
        await waitFor(() => expect(close).toHaveBeenCalledOnce());
    });
    it('sends the selected SMS channel without collecting a password', async () => {
        renderPage(<UpgradePartnerModal customer={customer} onClose={vi.fn()} />);
        fill();
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Send password setup link by' }));
        fireEvent.click(await screen.findByText('SMS — +94770000000'));
        fireEvent.click(screen.getByText('I verified this customer’s identity and their request to become a Partner.'));
        fireEvent.click(screen.getByText('Approve Partner Upgrade'));
        await waitFor(() => expect(api.upgradeCustomer).toHaveBeenCalledWith(customer.user_id, {
            invitation_channel: 'sms', master_partner_id: null, customer_consent_confirmed: true, note: 'Verified support request',
        }));
        expect(screen.queryByLabelText('Partner Portal password')).not.toBeInTheDocument();
    });

});
