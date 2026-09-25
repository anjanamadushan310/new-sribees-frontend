/**
 * Pure helpers for the AI Briefings page — reading a manager's note file,
 * turning a picked window into Sri Lanka time, and describing a briefing.
 */
import dayjs, { type Dayjs } from 'dayjs';

import type { BriefingMode, BriefingStatus } from '../api/briefings.api';
import { DISPLAY_TZ, slt } from './datetime';

export const NOTE_EXTENSIONS = ['.txt', '.md', '.markdown'];
export const UPLOAD_MAX_BYTES = 64 * 1024;

/** Why a file cannot be used, or null when it can. Mirrors the server's checks. */
export function noteFileProblem(file: Pick<File, 'name' | 'size'>): string | null {
    const name = file.name.toLowerCase();
    if (!NOTE_EXTENSIONS.some((ext) => name.endsWith(ext))) {
        return 'Upload a .txt or .md file.';
    }
    if (file.size > UPLOAD_MAX_BYTES) {
        return 'The file is larger than 64 KB. Keep the note short.';
    }
    if (file.size === 0) return 'The file is empty.';
    return null;
}

/**
 * A picker value -> the instant it means in Sri Lanka.
 *
 * Ant Design pickers hand back the wall-clock time the manager chose in the
 * browser's own zone. "10 April 09:00" means 09:00 in Colombo whatever the
 * laptop is set to, so the wall clock is re-read in Colombo before sending.
 */
export function colomboISO(value: Dayjs): string {
    return dayjs.tz(value.format('YYYY-MM-DD HH:mm'), DISPLAY_TZ).toISOString();
}

/** An API instant -> a picker value showing its Colombo wall-clock time. */
export function pickerValue(iso: string): Dayjs {
    return dayjs(slt(iso).format('YYYY-MM-DD HH:mm'));
}

/** Quick windows for the picker, starting now (server time, in Colombo). */
export function windowPresets(): { label: string; value: [Dayjs, Dayjs] }[] {
    const now = pickerValue(slt().toISOString());
    return [
        { label: 'Rest of today', value: [now, now.endOf('day')] },
        { label: 'Next 24 hours', value: [now, now.add(24, 'hour')] },
        { label: 'Next 3 days', value: [now, now.add(3, 'day')] },
        { label: 'Next 7 days', value: [now, now.add(7, 'day')] },
    ];
}

export const MODE_META: Record<BriefingMode, { label: string; help: string; color: string }> = {
    relevant: {
        label: 'When relevant',
        help: 'Mentioned only when it affects what the customer asks — e.g. a delivery disruption, when they ask about their order.',
        color: 'volcano',
    },
    announce: {
        label: 'Tell each customer once',
        help: 'Added once to each customer’s next reply, after answering what they asked — e.g. an event or an invitation.',
        color: 'purple',
    },
};

export const STATUS_META: Record<BriefingStatus, { label: string; color: string }> = {
    live: { label: 'Live', color: 'green' },
    scheduled: { label: 'Scheduled', color: 'blue' },
    ended: { label: 'Ended', color: 'default' },
    paused: { label: 'Paused', color: 'orange' },
};

/** "Sat 25 Sep, 9:00 AM → 9:00 PM" — the end drops its date when it is the same day. */
export function formatWindow(startsAt: string, endsAt: string): string {
    const start = slt(startsAt);
    const end = slt(endsAt);
    const endFormat = start.isSame(end, 'day') ? 'h:mm A' : 'ddd D MMM, h:mm A';
    return `${start.format('ddd D MMM, h:mm A')} → ${end.format(endFormat)}`;
}

/** "Told to customers 3 times" / "Not mentioned yet". */
export function mentionsLabel(mentions: number): string {
    if (mentions <= 0) return 'Not mentioned yet';
    return `Mentioned ${mentions} ${mentions === 1 ? 'time' : 'times'}`;
}
