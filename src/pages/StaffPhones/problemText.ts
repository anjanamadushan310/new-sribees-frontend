import type { PhoneProblem } from '../../api/staffPhones.api';

/** What to tell the staff member, per reason a phone stays quiet. */
export const PROBLEM_TEXT: Record<PhoneProblem, string> = {
    notifications_off: 'Notifications are blocked for the app. In the app: tap 🔕 → On.',
    channel_off: '"New orders" alerts are switched off on the phone. In the app: tap 🔕 → Open settings.',
    channel_silent: '"New orders" alerts are silent (no sound or pop-up). In the app: tap 🔕 → Open settings.',
    battery_restricted: 'Battery saving stops the app. In the app: tap 🔕 → Open settings → Battery → Unrestricted.',
    not_seen: 'Not opened for over 7 days: maybe uninstalled, signed out or switched off.',
    unknown: 'An older app version that does not report. Install the latest New Orders app.',
};
