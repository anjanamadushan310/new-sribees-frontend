/**
 * Admin Postal City Directory API (/api/v1/admin/locations) — Super Admin only.
 *
 * The master "Delivery Zones" catalog: every Postal City tagged with its
 * District and Province. Powers the Branch form's coverage picker and the
 * Delivery Zones settings tab. Wire format is snake_case.
 */
import apiClient from './client';

export interface PostalCity {
    id: string;
    postal_city: string;
    district: string;
    province: string;
    is_active: boolean;
    /** Switched on in Settings > Service Areas; only these are offered to a branch. */
    is_launched?: boolean;
    created_at?: string | null;
    updated_at?: string | null;
}

export interface PostalCityPayload {
    postal_city: string;
    district: string;
    province: string;
    is_active?: boolean;
}

export interface LocationFilter {
    province?: string;
    district?: string;
    active_only?: boolean;
    /** Only postal areas switched on in Service Areas. */
    launched_only?: boolean;
}

interface ListWire {
    success: boolean;
    data: { postal_cities: PostalCity[] };
    total: number;
}

interface MutationWire {
    success: boolean;
    data: PostalCity;
    message: string;
}

export const locationsApi = {
    list: async (filter: LocationFilter = {}): Promise<PostalCity[]> => {
        const res = await apiClient.get<ListWire>('/admin/locations', { params: filter });
        return res.data.data.postal_cities;
    },

    create: async (payload: PostalCityPayload): Promise<PostalCity> => {
        const res = await apiClient.post<MutationWire>('/admin/locations', payload);
        return res.data.data;
    },

    update: async (id: string, payload: Partial<PostalCityPayload>): Promise<PostalCity> => {
        const res = await apiClient.put<MutationWire>(`/admin/locations/${id}`, payload);
        return res.data.data;
    },

    remove: async (id: string): Promise<void> => {
        await apiClient.delete(`/admin/locations/${id}`);
    },
};
