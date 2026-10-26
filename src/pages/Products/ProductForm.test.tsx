import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderPage } from '../../test/renderPage';
import { signIn, signOut } from '../../test/users';
import { AdminRole } from '../../types/admin.types';
import ProductForm from './ProductForm';

vi.mock('../../api/categories.api', () => ({ categoriesApi: { list: vi.fn().mockResolvedValue([]) } }));
vi.mock('../../api/products.api', async (importOriginal) => {
    const real = await importOriginal<typeof import('../../api/products.api')>();
    return { ...real, productsApi: { getById: vi.fn(), create: vi.fn(), update: vi.fn() } };
});

describe('ProductForm sold by weight', () => {
    afterEach(signOut);

    it('puts the switch above the base price and opens the weight options on a new product', async () => {
        signIn(AdminRole.SUPER_ADMIN);
        renderPage(<ProductForm />, { path: '/products/new', route: '/products/new' });

        const tile = await screen.findByText('Sold by Weight');
        const price = screen.getByText('Base Price (LKR)');
        // The switch sits right above the price it turns into a price per kg.
        expect(tile.compareDocumentPosition(price) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.queryByText('Weight options')).toBeNull();

        fireEvent.click(tile);
        await waitFor(() => expect(screen.getByText('Weight options')).toBeTruthy());
        expect(screen.getByText('Price per 1 kg. Each weight below has its own price.')).toBeTruthy();
    }, 30000);
});
