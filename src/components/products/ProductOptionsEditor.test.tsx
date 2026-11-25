import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { App as AntApp } from 'antd';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ProductOptionsEditor from './ProductOptionsEditor';
import { problem, toPayload } from './productOptionRows';
import type { OptionRow } from './productOptionRows';

const api = vi.hoisted(() => ({ get: vi.fn(), replace: vi.fn() }));
vi.mock('../../api/productOptions.api', async (orig) => ({
    ...(await orig<typeof import('../../api/productOptions.api')>()),
    productOptionsApi: api,
}));
vi.mock('../../api/products.api', () => ({ productsApi: { uploadImage: vi.fn() } }));

const row = (over: Partial<OptionRow> = {}): OptionRow => ({ key: 'k', name: 'Shade 07', is_active: true, ...over });

describe('option rules', () => {
    it('sends a blank price as the product price and keeps ids', () => {
        expect(toPayload([row({ variant_id: 'v1', name: ' Shade 07 ', price: 0 }), row({ key: 'n', name: 'Pink' })]))
            .toEqual([
                { variant_id: 'v1', name: 'Shade 07', price: null, image_url: null, is_active: true },
                { name: 'Pink', price: null, image_url: null, is_active: true },
            ]);
    });

    it('finds what the server would refuse', () => {
        expect(problem('Shade', [row(), row({ key: 'b', name: 'shade 07' })])).toMatch(/Two options/);
        expect(problem('Shade', [row({ name: ' ' })])).toMatch(/needs a name/);
        expect(problem('Shade', [row({ is_active: false })])).toMatch(/at least one/);
        expect(problem('', [row()])).toMatch(/called/);
        expect(problem('', [])).toBeNull();
        expect(problem('Colour', [row(), row({ key: 'b', name: 'Blue' })])).toBeNull();
    });
});

describe('ProductOptionsEditor', () => {
    it('loads the shades and saves the list in order', async () => {
        api.get.mockResolvedValue({
            product_id: 'p1', option_label: 'Shade', stock_mode: 'packed',
            options: [
                { variant_id: 'v1', name: 'Shade 07', price: null, image_url: null, is_active: true, sort_order: 1 },
                { variant_id: 'v2', name: 'Shade 40', price: 450, image_url: null, is_active: true, sort_order: 2 },
            ],
        });
        api.replace.mockImplementation(async (_id, label, options) => ({
            product_id: 'p1', option_label: label, stock_mode: 'packed',
            options: options.map((o: { name: string }, i: number) => ({ ...o, variant_id: `v${i + 1}`, sort_order: i + 1 })),
        }));
        render(
            <QueryClientProvider client={new QueryClient()}>
                <AntApp>
                    <ProductOptionsEditor productId="p1" productPrice={400} />
                </AntApp>
            </QueryClientProvider>,
        );
        await waitFor(() => expect(screen.getByDisplayValue('Shade 40')).toBeTruthy());
        fireEvent.click(screen.getAllByLabelText('Down')[0]);
        fireEvent.click(screen.getByText('Save options'));
        await waitFor(() => expect(api.replace).toHaveBeenCalled());
        const [, label, sent] = api.replace.mock.calls[0];
        expect(label).toBe('Shade');
        expect(sent.map((o: { name: string }) => o.name)).toEqual(['Shade 40', 'Shade 07']);
        expect(sent[0]).toMatchObject({ variant_id: 'v2', price: 450 });
        expect(sent[1]).toMatchObject({ variant_id: 'v1', price: null });
    });
});
