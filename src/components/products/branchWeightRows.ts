/**
 * Pricing of a sold-by-weight product's weights in one branch, shared by the
 * "Add Product to Branch" modal and the quick-edit drawer (see
 * BranchWeightRows). The branch price is the branch's price per kg; a
 * weight's price is that, pro rata, times the weight's markup (the global
 * one, or one the manager set by hand). The server applies the same rule.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { weightOptionsApi, type WeightOption } from '../../api/weightOptions.api';

export const KILO = 1000;

const cents = (n: number) => Math.round(n * 100) / 100;

export interface BranchWeightRow extends WeightOption {
    /** What this branch charges for the weight, at the branch price being typed. */
    shown: number;
    /** Changed by hand here, so it is saved as the branch's own price. */
    edited: boolean;
}

/**
 * The weight rows of *productId* priced at *perKg* (the branch price being
 * typed, or the global price when it is empty).
 *
 * *savedPerKg* is the branch price the saved branch overrides were set
 * against (the inventory row's branch price, or the global price).
 */
export function useBranchWeightRows(
    productId: string | undefined,
    branchId: string | undefined,
    perKg: number,
    globalPerKg: number,
    savedPerKg: number = globalPerKg,
) {
    const { data } = useQuery({
        queryKey: ['admin', 'weight-options', productId, branchId],
        queryFn: () => weightOptionsApi.get(productId!, branchId),
        enabled: !!productId,
    });
    // Markups the manager set by hand, per product so a new pick starts clean.
    const [hand, setHand] = useState<{ productId?: string; marks: Record<string, number> }>({ marks: {} });
    const marks = hand.productId === productId ? hand.marks : {};

    const plain = (o: WeightOption, kg: number) => (kg * o.weight_grams) / KILO;
    const savedMark = (o: WeightOption) => {
        const base = o.branch_price ?? o.global_price;
        const against = o.branch_price !== null ? savedPerKg : globalPerKg;
        const p = plain(o, against);
        return p > 0 ? base / p : 1;
    };

    const options = data?.sold_by_weight ? data.options : [];
    const rows: BranchWeightRow[] = options.map((o) => {
        const edited = o.variant_id in marks && o.weight_grams !== KILO;
        const mark = o.weight_grams === KILO ? 1 : edited ? marks[o.variant_id] : savedMark(o);
        return { ...o, shown: cents(plain(o, perKg) * mark), edited };
    });

    /** The manager typed *price* for one (non-1 kg) weight. */
    const setPrice = (variantId: string, price: number | null) => {
        const o = options.find((x) => x.variant_id === variantId);
        if (!o || price === null || perKg <= 0) return;
        setHand({ productId, marks: { ...marks, [variantId]: price / plain(o, perKg) } });
    };

    return { rows, setPrice };
}

/**
 * Save the weights changed by hand as the branch's own prices. Weights left
 * alone follow the branch price on the server, and 1 kg is the branch price,
 * so neither is sent. Returns how many were saved.
 */
export async function saveBranchWeightPrices(
    productId: string,
    branchId: string | undefined,
    rows: BranchWeightRow[],
): Promise<number> {
    const edited = rows.filter((r) => r.edited);
    for (const r of edited) {
        await weightOptionsApi.setBranchPrice(productId, r.variant_id, r.shown, branchId);
    }
    return edited.length;
}
