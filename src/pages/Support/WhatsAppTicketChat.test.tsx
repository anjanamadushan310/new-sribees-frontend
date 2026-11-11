import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { whatsAppSupportApi } from '../../api/support.api';
import type { WhatsAppHistory } from '../../api/support.api';
import { renderPage } from '../../test/renderPage';
import { signIn, signOut } from '../../test/users';
import { AdminRole } from '../../types/admin.types';
import { WhatsAppTicketChat } from './WhatsAppTicketChat';

vi.mock('../../api/support.api', () => ({ whatsAppSupportApi: {
    history: vi.fn(), claim: vi.fn(), release: vi.fn(), send: vi.fn(), attachment: vi.fn(),
} }));
const history = vi.mocked(whatsAppSupportApi.history);
const send = vi.mocked(whatsAppSupportApi.send);

function conversation(overrides: Partial<WhatsAppHistory> = {}): WhatsAppHistory {
    return {
        available: true, active: true, staff_active: true, enabled: true,
        assigned_admin_id: 'id-super_admin', reply_until: new Date(Date.now() + 3600000).toISOString(),
        messages: [], next_before: null, ...overrides,
    };
}

describe('WhatsApp staff chat', () => {
    it('downloads attachments through the authenticated ticket API', async () => {
        signIn(AdminRole.SUPER_ADMIN);
        history.mockResolvedValue(conversation({ messages: [{
            id: 'message-1', incoming: null, incoming_type: 'image', has_attachment: true,
            received_at: new Date().toISOString(), outgoing: null, is_staff: false,
            status: 'ignored', error_code: null, created_at: new Date().toISOString(),
        }] }));
        vi.mocked(whatsAppSupportApi.attachment).mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
        const originalCreate = URL.createObjectURL;
        const originalRevoke = URL.revokeObjectURL;
        URL.createObjectURL = vi.fn(() => 'blob:test-image');
        URL.revokeObjectURL = vi.fn();
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        renderPage(<WhatsAppTicketChat ticketId="ticket-1" />);
        fireEvent.click(await screen.findByRole('button', { name: 'Download attachment' }));
        await waitFor(() => expect(whatsAppSupportApi.attachment).toHaveBeenCalledWith('ticket-1', 'message-1'));
        await waitFor(() => expect(click).toHaveBeenCalled());
        click.mockRestore();
        URL.createObjectURL = originalCreate;
        // The component revokes object URLs after the browser starts downloading.
        window.setTimeout(() => { URL.revokeObjectURL = originalRevoke; }, 1100);
    });

    beforeEach(() => {
        vi.clearAllMocks();
        signIn(AdminRole.SUPER_ADMIN);
        history.mockResolvedValue(conversation());
    });
    afterEach(signOut);

    it('keeps the same request ID when a network error leaves delivery unconfirmed', async () => {
        send.mockRejectedValue(new Error('network interruption'));
        renderPage(<WhatsAppTicketChat ticketId="ticket-1" />);
        const input = await screen.findByRole('textbox', { name: 'WhatsApp reply' });
        fireEvent.change(input, { target: { value: 'We are checking your order.' } });
        fireEvent.click(screen.getByRole('button', { name: /send whatsapp reply/i }));
        await waitFor(() => expect(send).toHaveBeenCalledTimes(1));
        await screen.findByText('The request could not be confirmed. Retry with the same message to avoid duplicates.');
        await waitFor(() => expect(input).toBeEnabled());
        fireEvent.click(screen.getByRole('button', { name: /send whatsapp reply/i }));
        await waitFor(() => expect(send).toHaveBeenCalledTimes(2));
        expect(send.mock.calls[1]).toEqual(send.mock.calls[0]);
    });

    it('blocks free-form replies outside the service window', async () => {
        history.mockResolvedValue(conversation({ reply_until: new Date(Date.now() - 1000).toISOString() }));
        renderPage(<WhatsAppTicketChat ticketId="ticket-1" />);
        expect(await screen.findByText('The 24-hour reply window has ended')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /send whatsapp reply/i })).toBeDisabled();
        expect(screen.getByRole('textbox', { name: 'WhatsApp reply' })).toBeDisabled();
        expect(send).not.toHaveBeenCalled();
    });

    it('requires staff takeover before enabling the composer', async () => {
        history.mockResolvedValue(conversation({ staff_active: false, assigned_admin_id: null }));
        vi.mocked(whatsAppSupportApi.claim).mockResolvedValue({} as Awaited<ReturnType<typeof whatsAppSupportApi.claim>>);
        renderPage(<WhatsAppTicketChat ticketId="ticket-1" />);
        const claim = await screen.findByRole('button', { name: 'Take over chat' });
        expect(screen.getByRole('textbox', { name: 'WhatsApp reply' })).toBeDisabled();
        fireEvent.click(claim);
        await waitFor(() => expect(whatsAppSupportApi.claim).toHaveBeenCalledWith('ticket-1'));
    });
});
