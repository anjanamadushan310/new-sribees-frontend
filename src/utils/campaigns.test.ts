import { describe, expect, it } from 'vitest';
import {
    deliveryRate,
    formatRate,
    languageShares,
    missingTranslations,
    pushBody,
    textFor,
} from './campaigns';

describe('what each device reads', () => {
    const title = { en: 'Weekend sale', si: 'සති අන්ත අලෙවිය', ta: '' };
    const message = { en: '20% off fruit', si: '', ta: null };

    it('uses its own language, else English, field by field', () => {
        expect(textFor(title, 'si')).toBe('සති අන්ත අලෙවිය');
        expect(textFor(message, 'si')).toBe('20% off fruit');
        expect(textFor(title, 'ta')).toBe('Weekend sale');
    });

    it('puts the headline over the message', () => {
        expect(pushBody(title, message, 'en')).toBe('Weekend sale\n20% off fruit');
        expect(pushBody({ en: '' }, message, 'en')).toBe('20% off fruit');
    });
});

describe('languages still missing', () => {
    const audience = { devices_by_language: { en: 10, si: 40, ta: 5 } };

    it('lists only languages somebody in the audience reads', () => {
        const missing = missingTranslations(audience, { en: 'a', si: 'b' }, { en: 'c', si: 'd' });
        expect(missing).toEqual([{ lang: 'ta', devices: 5 }]);
    });

    it('a language needs both a title and a message', () => {
        const missing = missingTranslations(audience, { en: 'a', si: 'b', ta: 'x' }, { en: 'c', ta: 'y' });
        expect(missing).toEqual([{ lang: 'si', devices: 40 }]);
    });

    it('nobody reading Tamil means no Tamil warning', () => {
        const missing = missingTranslations(
            { devices_by_language: { en: 3, si: 0, ta: 0 } },
            { en: 'a' },
            { en: 'b' },
        );
        expect(missing).toEqual([]);
        expect(missingTranslations(undefined, { en: 'a' }, { en: 'b' })).toEqual([]);
    });
});

describe('numbers on the table', () => {
    it('formats rates', () => {
        expect(formatRate(null)).toBe('—');
        expect(formatRate(0)).toBe('0%');
        expect(formatRate(0.25)).toBe('25%');
        expect(formatRate(0.0456)).toBe('4.6%');
    });

    it('delivery is of devices, and unknown before sending', () => {
        expect(deliveryRate({ delivered: 90, devices: 100 })).toBe(0.9);
        expect(deliveryRate({ delivered: 0, devices: 0 })).toBeNull();
    });

    it('language shares skip languages nobody reads', () => {
        expect(languageShares({ en: 1, si: 3, ta: 0 })).toEqual([
            { lang: 'en', share: 0.25 },
            { lang: 'si', share: 0.75 },
        ]);
        expect(languageShares({ en: 0, si: 0, ta: 0 })).toEqual([]);
    });
});
