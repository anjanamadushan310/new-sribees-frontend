import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderPage } from '../../test/renderPage';
import api from '../../api/client';
import PartnerWalletAdmin from './PartnerWalletAdmin';

vi.mock('../../api/client', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const get = vi.mocked(api.get);
const post = vi.mocked(api.post);
function prepare() {
    get.mockImplementation(async (path) => ({ data: { data: path === '/admin/partners/applications'
        ? [{ id: 'app-1', userId: 'u-1', name: 'Kamal', email: 'test@example.test', status: 'pending' }]
        : [{ id: 'wd-1', partnerId: 'p-1', amount: '250.00', status: 'pending', bankName: 'Test Bank', branchName: 'Test', accountName: 'Kamal', accountNumber: '123456' }] } }) as Awaited<ReturnType<typeof api.get>>);
    post.mockResolvedValue({ data: { success: true } } as Awaited<ReturnType<typeof api.post>>);
    renderPage(<PartnerWalletAdmin partners={[]} />);
}

describe('Partner Wallet approvals', () => {
    it('approves the authenticated customer application rather than creating an unrelated account', async () => {
        prepare();
        fireEvent.click(screen.getByText('Open approvals'));
        await screen.findByText('Kamal');
        fireEvent.click(screen.getByRole('button', { name: 'Approve' }));
        expect(await screen.findByText(/Existing Sribees Wallet credit is not converted/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'OK' }));
        await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/partners/applications/app-1/decision', { decision: 'approve' }));
    });
    it('requires a bank reference and records payment without executing a bank transfer', async () => {
        post.mockClear();
        prepare();
        fireEvent.click(screen.getByText('Open approvals'));
        await screen.findByText('test@example.test');
        fireEvent.click(screen.getByRole('tab', { name: 'Bank withdrawals' }));
        fireEvent.click(await screen.findByRole('button', { name: 'Mark paid' }, { timeout: 10000 }));
        expect(await screen.findByText(/This does not send a bank transfer/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'OK' }));
        await screen.findByText(/Please enter Bank payment reference/);
        expect(post).not.toHaveBeenCalled();
        fireEvent.change(screen.getByLabelText('Bank payment reference'), { target: { value: 'TEST-REF' } });
        fireEvent.click(screen.getByRole('button', { name: 'OK' }));
        await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/partners/withdrawals/wd-1/decision', { decision: 'paid', payment_reference: 'TEST-REF' }));
    });
});
