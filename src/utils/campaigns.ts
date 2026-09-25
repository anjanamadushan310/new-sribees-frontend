/**
 * Pure helpers for the Push Campaigns page — what the phone will show and
 * which audience languages still read English.
 */
import type { Audience, Campaign, Lang, LocalizedText } from '../api/campaigns.api';

export const LANGS: Lang[] = ['en', 'si', 'ta'];

export const LANG_LABEL: Record<Lang, string> = {
    en: 'English',
    si: 'සිංහල',
    ta: 'தமிழ்',
};

/** The push title on every device: the app's name (AndroidManifest label). */
export const BRAND_TITLE = 'Sribees Online';

export const TITLE_MAX = 65;
export const MESSAGE_MAX = 240;

/** What a device in `lang` reads: its own text, else English, per field. */
export function textFor(text: LocalizedText, lang: Lang): string {
    const own = (text[lang] ?? '').trim();
    return own || (text.en ?? '').trim();
}

/** The body under the brand title: headline, then message. */
export function pushBody(title: LocalizedText, message: LocalizedText, lang: Lang): string {
    return [textFor(title, lang), textFor(message, lang)].filter(Boolean).join('\n');
}

/**
 * Languages the audience reads that have no text of their own yet, with how
 * many devices would get English instead. Empty when every device is covered.
 */
export function missingTranslations(
    audience: Pick<Audience, 'devices_by_language'> | undefined,
    title: LocalizedText,
    message: LocalizedText,
): { lang: Lang; devices: number }[] {
    if (!audience) return [];
    return (['si', 'ta'] as Lang[])
        .filter((lang) => !(title[lang] ?? '').trim() || !(message[lang] ?? '').trim())
        .map((lang) => ({ lang, devices: audience.devices_by_language?.[lang] ?? 0 }))
        .filter((m) => m.devices > 0);
}

/** "42.5%" / "—" for a campaign nobody has received yet. */
export function formatRate(rate: number | null | undefined): string {
    if (rate === null || rate === undefined) return '—';
    const pct = rate * 100;
    return `${pct >= 10 || pct === 0 ? pct.toFixed(0) : pct.toFixed(1)}%`;
}

/** Share of devices that took the push (FCM success), or null before sending. */
export function deliveryRate(c: Pick<Campaign, 'delivered' | 'devices'>): number | null {
    return c.devices > 0 ? c.delivered / c.devices : null;
}

/** Share of the audience's devices per language, for the audience bar. */
export function languageShares(byLang: Record<Lang, number> | undefined): { lang: Lang; share: number }[] {
    const total = LANGS.reduce((sum, l) => sum + (byLang?.[l] ?? 0), 0);
    if (!total) return [];
    return LANGS.map((lang) => ({ lang, share: (byLang?.[lang] ?? 0) / total })).filter((s) => s.share > 0);
}
