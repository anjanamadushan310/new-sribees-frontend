import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Banner } from '../../api/banners.api';
import { bannersApi } from '../../api/banners.api';
import { renderPage } from '../../test/renderPage';
import { signIn, signOut } from '../../test/users';
import { AdminRole } from '../../types/admin.types';
import BannerList from './BannerList';

vi.mock('../../api/banners.api', () => ({
    bannersApi: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), uploadImage: vi.fn() },
}));
vi.mock('../../api/categories.api', () => ({ categoriesApi: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../api/marketing.api', () => ({
    marketingApi: { listProducts: vi.fn().mockResolvedValue({ products: [] }) },
}));
vi.mock('../../api/branches.api', () => ({ branchesApi: { list: vi.fn().mockResolvedValue([]) } }));
const api = vi.mocked(bannersApi);

function banner(over: Partial<Banner>): Banner {
    return {
        banner_id: 'bn-1', title: 'Avurudu Sale', subtitle: null, image_url: null, link_type: null,
        target_id: null, branch_id: 'b-1', is_platform_wide: false, sort_order: 1, is_active: true,
        starts_at: null, ends_at: null, is_always_active: true, status: 'live', impressions: 0,
        clicks: 0, ctr: null, performance_window_days: 7, created_at: '2026-09-01T00:00:00Z', ...over,
    };
}

async function confirmDelete() {
    const confirm = await waitFor(() => {
        const pop = document.querySelector('.ant-popconfirm');
        expect(pop).not.toBeNull();
        return pop as HTMLElement;
    });
    fireEvent.click(within(confirm).getByText('Delete').closest('button')!);
}

describe('BannerList', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        signIn(AdminRole.MARKETING_MANAGER, { branch_id: 'b-1' });
        api.list.mockResolvedValue({
            banners: [
                banner({}),
                banner({ banner_id: 'bn-2', title: 'Network Deal', branch_id: null, is_platform_wide: true }),
            ],
            scope: { is_super_admin: false, branch_id: 'b-1' },
        });
        api.remove.mockResolvedValue(undefined);
    });
    afterEach(signOut);

    it('deletes a banner from its row, after confirming', async () => {
        renderPage(<BannerList />);
        const row = (await screen.findByText('Avurudu Sale')).closest('tr')!;
        fireEvent.click(within(row).getByText('Delete').closest('button')!);
        await confirmDelete();
        await waitFor(() => expect(api.remove).toHaveBeenCalledWith('bn-1'));
    });

    it('also deletes from the edit dialog', async () => {
        renderPage(<BannerList />);
        const row = (await screen.findByText('Avurudu Sale')).closest('tr')!;
        fireEvent.click(within(row).getByText('Edit').closest('button')!);
        fireEvent.click((await screen.findByText('Delete banner')).closest('button')!);
        await confirmDelete();
        await waitFor(() => expect(api.remove).toHaveBeenCalledWith('bn-1'));
    });

    it('a Marketing Manager cannot delete a platform-wide banner', async () => {
        renderPage(<BannerList />);
        const row = (await screen.findByText('Network Deal')).closest('tr')!;
        expect(within(row).getByText('Delete').closest('button')!.disabled).toBe(true);
    });
});
