/**
 * Missed searches (/api/v1/admin/products/search-misses).
 *
 * Customer searches that found nothing, grouped by meaning rather than
 * spelling ("Seeni" and "සීනි" are one row). Attaching one to a product adds
 * the shopper's word to its search keywords, so the next shopper who types it
 * finds the product. No AI is involved, so nothing here costs anything.
 */
import apiClient from './client';

export type SearchMissStatus = 'open' | 'resolved' | 'ignored';

export interface SearchMiss {
    /** The folded words that group spellings together. Identifies the row. */
    query_key: string;
    /** The latest spelling a shopper actually typed. */
    sample_query: string;
    /** Distinct shoppers, counted once per day each. */
    shoppers: number;
    first_seen: string | null;
    last_seen: string | null;
    status: SearchMissStatus;
    resolved_product_id: string | null;
    resolved_product_name: string | null;
    resolved_at: string | null;
    /** Resolved, yet shoppers still come up empty (out of stock where they are?). */
    missed_since_resolved: boolean;
    /**
     * What the query matches across the whole catalogue, ignoring stock.
     * On an open row this usually means the product exists but wasn't in
     * stock at the shopper's branch.
     */
    catalog_matches: { product_id: string; name: string }[];
}

export const searchMissesApi = {
    list: async (status: SearchMissStatus, limit = 200): Promise<SearchMiss[]> => {
        const { data } = await apiClient.get('/admin/products/search-misses', {
            params: { status, limit },
        });
        return (data?.data?.items ?? []) as SearchMiss[];
    },

    attach: async (queryKey: string, productId: string): Promise<void> => {
        await apiClient.post('/admin/products/search-misses/attach', {
            query_key: queryKey,
            product_id: productId,
        });
    },

    setStatus: async (queryKey: string, status: 'open' | 'ignored'): Promise<void> => {
        await apiClient.post('/admin/products/search-misses/status', {
            query_key: queryKey,
            status,
        });
    },
};
