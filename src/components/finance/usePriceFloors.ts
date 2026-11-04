import { useQuery } from '@tanstack/react-query';
import { inventoryApi, type PriceFloor } from '../../api/inventory.api';

/**
 * Sribees Finance's minimum prices for the given rows, keyed `${branch_id}:${product_id}`
 * (the product itself; a pack size's floor is keyed with its variant id). One request
 * per branch on the page. Missing = Finance has no floor for it yet.
 */
export function usePriceFloors(rows: { product_id: string; branch_id: string }[]) {
    const byBranch = new Map<string, Set<string>>();
    rows.forEach((r) => {
        if (!byBranch.has(r.branch_id)) byBranch.set(r.branch_id, new Set());
        byBranch.get(r.branch_id)!.add(r.product_id);
    });
    const key = [...byBranch.entries()].map(([b, ids]) => `${b}:${[...ids].sort().join(',')}`).sort();
    const { data } = useQuery({
        queryKey: ['price-floors', key],
        enabled: rows.length > 0,
        staleTime: 5 * 60_000,
        queryFn: async () => {
            const out: Record<string, PriceFloor> = {};
            await Promise.all(
                [...byBranch.entries()].map(async ([branchId, ids]) => {
                    const floors = await inventoryApi.priceFloors([...ids], branchId).catch(() => ({}));
                    Object.entries(floors).forEach(([pid, list]) =>
                        list.forEach((f) => {
                            out[`${branchId}:${f.variant_id ?? pid}`] = f;
                        }),
                    );
                }),
            );
            return out;
        },
    });
    return data ?? {};
}
