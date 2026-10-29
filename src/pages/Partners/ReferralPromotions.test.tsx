import { fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderPage } from '../../test/renderPage';
import api from '../../api/client';
import ReferralPromotions from './ReferralPromotions';

vi.mock('../../api/client', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
describe('Referral promotion configuration', () => {
    it('saves a paused configurable offer without issuing benefits or performing payments', async () => {
        const get = vi.mocked(api.get), post = vi.mocked(api.post);
        get.mockResolvedValue({ data: { data: [], enabled: false } } as Awaited<ReturnType<typeof api.get>>);
        post.mockResolvedValue({ data: { success: true } } as Awaited<ReturnType<typeof api.post>>);
        renderPage(<ReferralPromotions partners={[]} />);
        expect(get).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Manage campaigns' }));
        await screen.findByText(/Execution is disabled/);
        fireEvent.click(screen.getByRole('button', { name: 'New referral campaign' }));
        fireEvent.change(await screen.findByLabelText('Customer-facing campaign title'), { target: { value: 'First order delivery' } });
        fireEvent.click(screen.getByLabelText('Include free delivery'));
        fireEvent.change(screen.getByLabelText('Total delivery campaign budget (LKR)'), { target: { value: '5000' } });
        fireEvent.click(screen.getByRole('button', { name: 'OK' }));
        await waitFor(() => expect(post).toHaveBeenCalledWith('/admin/referral-promotions', expect.objectContaining({ name: 'First order delivery', active: false, scope: 'all', partner_id: null,
            rules: expect.objectContaining({ free_delivery: true, valid_days: 30, delivery_uses: 1 }) })));
    });
});
