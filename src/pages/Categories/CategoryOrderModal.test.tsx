import { useState } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { categoriesApi, type Category } from '../../api/categories.api';
import { renderPage } from '../../test/renderPage';
import CategoryOrderModal from './CategoryOrderModal';

vi.mock('../../api/categories.api', () => ({ categoriesApi: { reorder: vi.fn() } }));
const api = vi.mocked(categoriesApi);
const categories: Category[] = [
    { category_id: 'baby', name: 'Baby & Kids', slug: 'baby', is_active: true },
    { category_id: 'beverages', name: 'Beverages', slug: 'beverages', is_active: true },
    { category_id: 'coffee', name: 'Coffee', slug: 'coffee', parent_category_id: 'beverages', is_active: true },
    { category_id: 'tea', name: 'Tea', slug: 'tea', parent_category_id: 'beverages', is_active: false },
];

describe('Category ordering', () => {
    beforeEach(() => { vi.clearAllMocks(); api.reorder.mockResolvedValue(); });

    it('drags a main category and saves its complete sibling order only after Save', async () => {
        const close = vi.fn();
        renderPage(<CategoryOrderModal categories={categories} onClose={close} />);
        const list = screen.getByRole('list', { name: 'Category display order' });
        const rows = within(list).getAllByRole('listitem');
        const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
        fireEvent.dragStart(rows[1], { dataTransfer });
        fireEvent.dragOver(rows[0], { dataTransfer });
        fireEvent.drop(rows[0], { dataTransfer });
        expect(within(list).getAllByRole('listitem')[0]).toHaveTextContent('Beverages');
        expect(api.reorder).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Save order' }));
        await waitFor(() => expect(api.reorder).toHaveBeenCalledWith({ parent_category_id: null, category_ids: ['beverages', 'baby'], expected_category_ids: ['baby', 'beverages'] }));
        await waitFor(() => expect(close).toHaveBeenCalledOnce());
    });

    it('moves Tea with the accessible controls while preserving its parent and inactive siblings', async () => {
        renderPage(<CategoryOrderModal categories={categories} onClose={vi.fn()} />);
        fireEvent.mouseDown(screen.getByRole('combobox', { name: 'Category group' }));
        fireEvent.click(await screen.findByText('Beverages — subcategories'));
        fireEvent.click(screen.getByRole('button', { name: 'Move Tea up' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save order' }));
        await waitFor(() => expect(api.reorder).toHaveBeenCalledWith({ parent_category_id: 'beverages', category_ids: ['tea', 'coffee'], expected_category_ids: ['coffee', 'tea'] }));
    });

    it('retains the original baseline when a background refetch changes category order', async () => {
        function RefetchHarness() {
            const [data, setData] = useState(categories);
            return <>
                <button onClick={() => setData([categories[1], categories[0], ...categories.slice(2)])}>Simulate refetch</button>
                <CategoryOrderModal categories={data} onClose={vi.fn()} />
            </>;
        }
        renderPage(<RefetchHarness />);
        fireEvent.click(screen.getByRole('button', { name: 'Move Beverages up' }));
        fireEvent.click(screen.getByRole('button', { name: 'Simulate refetch' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save order' }));
        await waitFor(() => expect(api.reorder).toHaveBeenCalledWith({ parent_category_id: null, category_ids: ['beverages', 'baby'], expected_category_ids: ['baby', 'beverages'] }));
    });

    it('keeps a failed save open so the administrator can retry', async () => {
        api.reorder.mockRejectedValue(new Error('Network unavailable'));
        const close = vi.fn();
        renderPage(<CategoryOrderModal categories={categories} onClose={close} />);
        fireEvent.click(screen.getByRole('button', { name: 'Move Beverages up' }));
        fireEvent.click(screen.getByRole('button', { name: 'Save order' }));
        expect(await screen.findByText('Could not save the order. Please try again.')).toBeInTheDocument();
        expect(close).not.toHaveBeenCalled();
    });
});
