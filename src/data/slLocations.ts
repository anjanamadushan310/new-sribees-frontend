/**
 * Sri Lanka administrative geography — canonical 9 Provinces and 25 Districts.
 *
 * Source-of-truth for the Province → District cascading dropdowns in the Branch
 * form and the Delivery Zones settings tab. Postal Cities are NOT hardcoded here;
 * they come from the master directory API (/admin/locations), filtered by the
 * selected district.
 *
 * Province names are stored WITHOUT the "Province" suffix (e.g. "Western") to
 * match the branches table convention and the backend's title-cased
 * normalization.
 */

export const SL_PROVINCE_DISTRICTS: Record<string, string[]> = {
    Western: ['Colombo', 'Gampaha', 'Kalutara'],
    Central: ['Kandy', 'Matale', 'Nuwara Eliya'],
    Southern: ['Galle', 'Matara', 'Hambantota'],
    Northern: ['Jaffna', 'Kilinochchi', 'Mannar', 'Vavuniya', 'Mullaitivu'],
    Eastern: ['Batticaloa', 'Ampara', 'Trincomalee'],
    'North Western': ['Kurunegala', 'Puttalam'],
    'North Central': ['Anuradhapura', 'Polonnaruwa'],
    Uva: ['Badulla', 'Monaragala'],
    Sabaragamuwa: ['Ratnapura', 'Kegalle'],
};

/** All 9 provinces, in a stable display order. */
export const SL_PROVINCES: string[] = Object.keys(SL_PROVINCE_DISTRICTS);

/** Districts for a province (empty array if the province is unknown/blank). */
export const districtsForProvince = (province?: string | null): string[] =>
    (province && SL_PROVINCE_DISTRICTS[province]) || [];

/** Resolve the province that contains a given district (or undefined). */
export const provinceForDistrict = (district?: string | null): string | undefined => {
    if (!district) return undefined;
    return SL_PROVINCES.find((p) => SL_PROVINCE_DISTRICTS[p].includes(district));
};
