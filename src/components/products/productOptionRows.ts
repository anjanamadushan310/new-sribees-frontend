/** Rows of the shades editor and the rules the server applies to them. */
import type { ProductOptionInput } from '../../api/productOptions.api';

export interface OptionRow extends ProductOptionInput {
    /** Stable row key, also for rows not saved yet. */
    key: string;
}

let seq = 0;
export const newKey = () => `new-${++seq}`;

/** Rows as sent to the server: names trimmed, blank prices as "the product's". */
export const toPayload = (rows: OptionRow[]): ProductOptionInput[] =>
    rows.map((r) => ({
        ...(r.variant_id ? { variant_id: r.variant_id } : {}),
        name: r.name.trim(),
        price: r.price ? r.price : null,
        image_url: r.image_url || null,
        is_active: r.is_active,
    }));

/** A message for the first problem the server would refuse, or null. */
export const problem = (label: string, rows: OptionRow[]): string | null => {
    if (!label.trim()) return rows.some((r) => r.is_active) ? 'Choose what the options are called (Shade, Colour …).' : null;
    if (!rows.some((r) => r.is_active)) return 'Add at least one option, or clear the label.';
    const seen = new Set<string>();
    for (const r of rows) {
        const name = r.name.trim();
        if (!name) return 'Every option needs a name.';
        if (seen.has(name.toLowerCase())) return `Two options are called ${name}.`;
        seen.add(name.toLowerCase());
    }
    return null;
};

