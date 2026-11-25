/**
 * Shades / colours of a product (backend migration 123).
 * Targets /api/v1/admin/products/{id}/options — Super Admin only.
 *
 * The customer must pick one option. An option costs the product's price
 * unless it has a price of its own; the product's Quick Sale discount applies
 * either way. Each option has its own photo (empty = the product's) and its
 * own stock per branch (Inventory → Shades). Leaving an option out retires it;
 * it is never deleted, because past orders point at it.
 */
import apiClient from './client';

export interface ProductOption {
    variant_id: string;
    name: string;
    /** null = the product's own price. */
    price: number | null;
    image_url: string | null;
    is_active: boolean;
    sort_order: number;
}

export interface ProductOptions {
    product_id: string;
    /** "Shade", "Colour" … null = a plain product. */
    option_label: string | null;
    stock_mode: string;
    options: ProductOption[];
}

export interface ProductOptionInput {
    variant_id?: string;
    name: string;
    price?: number | null;
    image_url?: string | null;
    is_active: boolean;
}

export const OPTION_LABELS = ['Shade', 'Colour', 'Size', 'Flavour', 'Scent'];

const base = (productId: string) => `/admin/products/${productId}/options`;

export const productOptionsApi = {
    get: async (productId: string): Promise<ProductOptions> => {
        const res = await apiClient.get<{ data: ProductOptions }>(base(productId));
        return res.data.data;
    },

    /** The whole list in order; a label of null makes it a plain product again. */
    replace: async (
        productId: string,
        optionLabel: string | null,
        options: ProductOptionInput[],
    ): Promise<ProductOptions> => {
        const res = await apiClient.put<{ data: ProductOptions }>(base(productId), {
            option_label: optionLabel,
            options,
        });
        return res.data.data;
    },
};
