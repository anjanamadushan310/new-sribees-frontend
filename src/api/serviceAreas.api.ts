/**
 * Service Areas (/api/v1/admin/service-areas) — Super Admin only.
 *
 * Where customers may be served, as three switches:
 *   province unlocked -> district unlocked -> postal area active
 *
 * A postal area is active when a branch is mapped to it and switched on; that
 * is also what routes its orders to the branch. Locked provinces and districts
 * are shown to customers as "Coming soon".
 */
import apiClient from './client';

export interface DisplayName {
    en: string;
    si: string;
    ta: string;
}

export interface DistrictRollout {
    name: string;
    displayName: DisplayName;
    is_unlocked: boolean;
    unlocked_at: string | null;
    updated_by: string | null;
    postal_total: number;
    courier_linked: number;
    active: number;
    saved_addresses: number;
    /** What a customer actually gets: unlocked all the way up, with something active. */
    live: boolean;
}

export interface ProvinceRollout {
    name: string;
    displayName: DisplayName;
    is_unlocked: boolean;
    unlocked_at: string | null;
    updated_by: string | null;
    live: boolean;
    districts: DistrictRollout[];
}

export interface RolloutTotals {
    provinces: number;
    provinces_live: number;
    districts: number;
    districts_unlocked: number;
    districts_live: number;
    postal_total: number;
    postal_active: number;
    courier_linked: number;
}

export interface RolloutOverview {
    provinces: ProvinceRollout[];
    totals: RolloutTotals;
}

/**
 * linked      — matched to a SribeesExpress postal city; delivery can be priced.
 * not_linked  — in the national list, not yet matched (run the courier sync).
 * not_served  — SribeesExpress reported the district and left this one out.
 * unknown     — a hand-made mapping with no directory row.
 */
export type CourierState = 'linked' | 'not_linked' | 'not_served' | 'unknown';

export interface PostalArea {
    postal_city: string;
    courier: CourierState;
    branch_id: string | null;
    branch_name: string | null;
    is_active: boolean;
    saved_addresses: number;
}

export interface DistrictPostalAreas {
    district: string;
    province: string;
    is_unlocked: boolean;
    postal_areas: PostalArea[];
}

export interface ActivationResult {
    activated: string[];
    skipped: { postal_city: string; reason: string }[];
}

const base = '/admin/service-areas';

export const serviceAreasApi = {
    overview: async (): Promise<RolloutOverview> =>
        (await apiClient.get<{ data: RolloutOverview }>(base)).data.data,

    setProvince: async (name: string, isUnlocked: boolean): Promise<RolloutOverview> =>
        (
            await apiClient.patch<{ data: RolloutOverview }>(
                `${base}/provinces/${encodeURIComponent(name)}`,
                { is_unlocked: isUnlocked }
            )
        ).data.data,

    setDistrict: async (name: string, isUnlocked: boolean): Promise<RolloutOverview> =>
        (
            await apiClient.patch<{ data: RolloutOverview }>(
                `${base}/districts/${encodeURIComponent(name)}`,
                { is_unlocked: isUnlocked }
            )
        ).data.data,

    postalAreas: async (district: string): Promise<DistrictPostalAreas> =>
        (
            await apiClient.get<{ data: DistrictPostalAreas }>(
                `${base}/districts/${encodeURIComponent(district)}/postal-areas`
            )
        ).data.data,

    activate: async (
        district: string,
        postalCities: string[],
        branchId: string
    ): Promise<ActivationResult> =>
        (
            await apiClient.post<{ data: ActivationResult }>(
                `${base}/districts/${encodeURIComponent(district)}/postal-areas/activate`,
                { postal_cities: postalCities, branch_id: branchId }
            )
        ).data.data,

    deactivate: async (postalCities: string[]): Promise<number> =>
        (
            await apiClient.post<{ data: { deactivated: number } }>(
                `${base}/postal-areas/deactivate`,
                { postal_cities: postalCities }
            )
        ).data.data.deactivated,
};
