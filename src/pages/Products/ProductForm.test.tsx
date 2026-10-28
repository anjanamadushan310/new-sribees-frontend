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
        expect(screen.getByText('Price per 1 kg. The weights below follow it; each can still be changed.')).toBeTruthy();

        // Typing the base price reprices every weight as it is typed.
        const base = screen.getByPlaceholderText('0.00');
        fireEvent.change(base, { target: { value: '1' } });
        await waitFor(() =>
            expect((screen.getByLabelText('Price for 250g') as HTMLInputElement).value).toBe('0.25')
        );
        fireEvent.change(base, { target: { value: '1050' } });
        await waitFor(() =>
            expect((screen.getByLabelText('Price for 1kg') as HTMLInputElement).value).toBe('1050.00')
        );
        expect((screen.getByLabelText('Price for 250g') as HTMLInputElement).value).toBe('262.50');

        // A weight changed by hand keeps its markup when the base moves again.
        fireEvent.change(screen.getByLabelText('Price for 250g'), { target: { value: '300' } });
        fireEvent.change(base, { target: { value: '2100' } });
        await waitFor(() =>
            expect((screen.getByLabelText('Price for 250g') as HTMLInputElement).value).toBe('600.00')
        );
    }, 30000);
});


describe('customer-facing size preview', () => {
    afterEach(signOut);

    it('uses only display size and unit, updates immediately, and hides when cleared', async () => {
        signIn(AdminRole.SUPER_ADMIN);
        renderPage(<ProductForm />, { path: '/products/new', route: '/products/new' });
        const size = await screen.findByLabelText('Weight / Size value');
        const unit = screen.getByLabelText('Display unit (optional)');
        expect(screen.queryByTestId('customer-preview-size')).toBeNull();

        fireEvent.change(size, { target: { value: '425' } });
        await waitFor(() => expect(screen.getByTestId('customer-preview-size')).toHaveTextContent('425'));
        fireEvent.change(unit, { target: { value: 'g' } });
        await waitFor(() => expect(screen.getByTestId('customer-preview-size')).toHaveTextContent('425 g'));

        // Courier weight must not change the retail size shown to customers.
        fireEvent.change(screen.getByLabelText('Weight / Size'), { target: { value: '400' } });
        expect(screen.getByTestId('customer-preview-size')).toHaveTextContent('425 g');
        fireEvent.change(unit, { target: { value: '' } });
        fireEvent.change(size, { target: { value: 'XL' } });
        await waitFor(() => expect(screen.getByTestId('customer-preview-size').textContent).toBe('XL'));
        fireEvent.change(size, { target: { value: '   ' } });
        await waitFor(() => expect(screen.queryByTestId('customer-preview-size')).toBeNull());
    }, 30000);
});
