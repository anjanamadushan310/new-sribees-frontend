import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';
import {
    colomboISO,
    formatWindow,
    mentionsLabel,
    noteFileProblem,
    pickerValue,
    UPLOAD_MAX_BYTES,
} from './briefings';

describe('which note files are accepted', () => {
    it('takes text and markdown, in any case', () => {
        expect(noteFileProblem({ name: 'flood.md', size: 200 })).toBeNull();
        expect(noteFileProblem({ name: 'AVURUDU.TXT', size: 200 })).toBeNull();
        expect(noteFileProblem({ name: 'notes.markdown', size: 200 })).toBeNull();
    });

    it('refuses other types, empty files and anything over 64 KB', () => {
        expect(noteFileProblem({ name: 'poster.pdf', size: 200 })).toMatch(/\.txt or \.md/);
        expect(noteFileProblem({ name: 'note.txt', size: 0 })).toMatch(/empty/);
        expect(noteFileProblem({ name: 'note.txt', size: UPLOAD_MAX_BYTES + 1 })).toMatch(/64 KB/);
    });
});

describe('the window is Sri Lanka time (the suite runs in New York)', () => {
    it('reads a picked wall-clock time as Colombo time', () => {
        // 09:00 on 10 April in Colombo is 03:30 UTC.
        expect(colomboISO(dayjs('2026-04-10 09:00'))).toBe('2026-04-10T03:30:00.000Z');
    });

    it('shows a saved instant at its Colombo wall-clock time', () => {
        expect(pickerValue('2026-04-10T03:30:00Z').format('YYYY-MM-DD HH:mm')).toBe('2026-04-10 09:00');
    });

    it('round-trips', () => {
        const iso = '2026-09-25T18:45:00.000Z';
        expect(colomboISO(pickerValue(iso))).toBe(iso);
    });

    it('drops the repeated date for a same-day window', () => {
        expect(formatWindow('2026-04-10T03:30:00Z', '2026-04-10T11:30:00Z')).toBe(
            'Fri 10 Apr, 9:00 AM → 5:00 PM',
        );
        expect(formatWindow('2026-04-10T03:30:00Z', '2026-04-12T11:30:00Z')).toBe(
            'Fri 10 Apr, 9:00 AM → Sun 12 Apr, 5:00 PM',
        );
    });
});

describe('mentions', () => {
    it('says so plainly', () => {
        expect(mentionsLabel(0)).toBe('Not mentioned yet');
        expect(mentionsLabel(1)).toBe('Mentioned 1 time');
        expect(mentionsLabel(12)).toBe('Mentioned 12 times');
    });
});
