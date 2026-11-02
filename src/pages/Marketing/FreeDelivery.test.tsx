import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { App } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import FreeDelivery from './FreeDelivery';
import { freeDeliveryApi } from '../../api/freeDelivery.api';

vi.mock('../../api/freeDelivery.api', () => ({
    freeDeliveryApi: {
        branches: vi.fn(),
        grants: vi.fn(),
        saveBranch: vi.fn(),
        createGrants: vi.fn(),
        revokeGrant: vi.fn(),
    },
}));

const OFF = {
    branch_id: 'b1',
    branch_name: 'Matugama',
    enabled: false,
    months: 3,
    min_order: 0,
    enabled_at: null,
    ends_at: null,
    expired: false,
};

function show() {
    vi.mocked(freeDeliveryApi.branches).mockResolvedValue([OFF]);
    vi.mocked(freeDeliveryApi.grants).mockResolvedValue([]);
    vi.mocked(freeDeliveryApi.saveBranch).mockResolvedValue({ ...OFF, enabled: true });
    render(
        <QueryClientProvider client={new QueryClient()}>
            <App>
                <FreeDelivery />
            </App>
        </QueryClientProvider>,
    );
}

describe('FreeDelivery', () => {
    it('lists each branch with its switch', async () => {
        show();
        expect(await screen.findByText('Matugama')).toBeInTheDocument();
        expect(screen.getByRole('switch', { name: 'Free delivery in Matugama' })).not.toBeChecked();
    });

    it('asks before switching a branch on, then saves', async () => {
        show();
        fireEvent.click(await screen.findByRole('switch', { name: 'Free delivery in Matugama' }));
        expect(freeDeliveryApi.saveBranch).not.toHaveBeenCalled();
        expect(await screen.findByText(/for 3 months from now/)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'OK' }));
        await waitFor(() =>
            expect(freeDeliveryApi.saveBranch).toHaveBeenCalledWith('b1', { enabled: true, months: 3, min_order: 0 }),
        );
    });
});
