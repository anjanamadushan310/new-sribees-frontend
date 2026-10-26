/**
 * Weight options of a sold-by-weight product.
 * Targets /api/v1/admin/products/{id}/weight-options — the Super Admin sets
 * the options and their global prices; a Branch Manager (or the Super Admin,
 * naming the branch) sets that branch's own price for an option.
 *
 * What the customer pays: branch price, else the global price, less the
 * product's Quick Sale discount in that branch.
 */
import apiClient from './client';

export interface WeightOption {
    variant_id: string;
    weight_grams: number;
    /** "250g", "1kg", "2.5kg". */
    label: string;
    global_price: number;
    /** This branch's own price, or null when it uses the global one. */
    branch_price: number | null;
    /** Before any Quick Sale discount. */
    original_price: number;
    /** What the customer pays in this branch. */
    price: number;
}

export interface WeightOptions {
    product_id: string;
    sold_by_weight: boolean;
    branch_id: string | null;
    options: WeightOption[];
}

export interface WeightOptionInput {
    weight_grams: number;
    price: number;
}

/** The weights a new list starts with, as the backend's defaults. */
export const DEFAULT_WEIGHTS = [250, 500, 1000, 2000, 5000];

/** Common weights offered when adding an option. */
export const COMMON_WEIGHTS = [100, 200, 250, 400, 500, 750, 1000, 1500, 2000, 2500, 3000, 5000, 10000];

export const weightLabel = (grams: number): string =>
    grams < 1000 ? `${grams}g` : `${Number((grams / 1000).toFixed(3))}kg`;

/** Price of `grams` pro rata from a price per kg, to the cent. */
export const proRata = (pricePerKg: number, grams: number): number =>
    Math.round(pricePerKg * grams / 10) / 100;

const base = (productId: string) => `/admin/products/${productId}/weight-options`;

export const weightOptionsApi = {
    get: async (productId: string, branchId?: string): Promise<WeightOptions> => {
        const res = await apiClient.get<{ data: WeightOptions }>(base(productId), {
            params: branchId ? { branch_id: branchId } : undefined,
        });
        return res.data.data;
    },

    /** Super Admin: the whole list, matched by weight. */
    replace: async (productId: string, options: WeightOptionInput[]): Promise<WeightOptions> => {
        const res = await apiClient.put<{ data: WeightOptions }>(base(productId), { options });
        return res.data.data;
    },

    /** Branch price for one option; `null` goes back to the global price. */
    setBranchPrice: async (
        productId: string,
        variantId: string,
        price: number | null,
        branchId?: string,
    ): Promise<WeightOptions> => {
        const res = await apiClient.put<{ data: WeightOptions }>(
            `${base(productId)}/${variantId}/branch-price`,
            { price, branch_id: branchId },
        );
        return res.data.data;
    },
};
