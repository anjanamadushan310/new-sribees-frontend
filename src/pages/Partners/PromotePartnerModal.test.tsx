import { fireEvent, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { partnersApi, type AdminPartner } from '../../api/partners.api';
import { renderPage } from '../../test/renderPage';
import PromotePartnerModal from './PromotePartnerModal';

vi.mock('../../api/partners.api', () => ({ partnersApi: { promote: vi.fn() } }));
const api = vi.mocked(partnersApi);
const partner = { partner_id: 'partner-test-id', role: 'partner', full_name: 'Kamal Test', parent_partner_id: 'master-test-id' } as AdminPartner;

describe('Partner promotion', () => {
    beforeEach(() => { vi.clearAllMocks(); api.promote.mockResolvedValue({ ...partner, role: 'master_partner' }); });

    it('requires a reason and sends promotion for the selected existing account', async () => {
        const close = vi.fn();
        renderPage(<PromotePartnerModal partner={partner} onClose={close} />);
        fireEvent.click(screen.getByText('Approve promotion'));
        expect(await screen.findByText('Enter a reason of at least 5 characters.')).toBeInTheDocument();
        expect(api.promote).not.toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText('Reason for promotion'), { target: { value: 'Approved after review' } });
        fireEvent.click(screen.getByText('Approve promotion'));
        await waitFor(() => expect(api.promote).toHaveBeenCalledWith(partner.partner_id, { note: 'Approved after review' }));
        await waitFor(() => expect(close).toHaveBeenCalledOnce());
    });
});
