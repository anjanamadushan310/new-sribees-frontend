/**
 * Every date and time in this admin is read in Sri Lanka time.
 *
 * The API stores and returns UTC, which is correct. Rendering it in *whatever
 * timezone the viewer's machine happens to be set to* is not: a browser on a
 * server-imaged laptop, a VM or a device with the wrong region shows UTC, and
 * an order placed at 3pm then reads "09:30" on the dashboard. Nobody reads
 * that as a display bug — they conclude the timestamp is wrong, and every
 * argument about when something happened starts from a different clock.
 *
 * It is not only about display. `dayjs().startOf('day')` is what the Orders
 * list means by "Today", and on a UTC browser that day begins at 5:30am
 * Colombo — so a report run at 9am silently omits the first five and a half
 * hours of trading.
 *
 * This is a Sri Lankan operation end to end, so the display timezone is a
 * constant, not a user preference. Asia/Colombo is UTC+5:30 and has had no
 * daylight saving since 2006, so it never shifts under us.
 *
 * Usage: wherever you would write `dayjs(...)`, write `slt(...)`. It returns
 * an ordinary Dayjs, so `.format()`, `.fromNow()`, `.startOf()` and Ant
 * Design's pickers all work exactly as before — they just answer in Colombo.
 */
import dayjs, { type Dayjs } from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

import { serverNow } from './server-clock';

dayjs.extend(utc);
dayjs.extend(timezone);
// `.fromNow()` is used on the dashboards; extending here as well as wherever
// it was already extended is harmless and stops a screen that only imports
// this helper from throwing.
dayjs.extend(relativeTime);

export const DISPLAY_TZ = 'Asia/Colombo';

/**
 * Sri Lanka time. Drop-in for `dayjs(...)` — see this module's docstring.
 *
 * `slt()` with no argument is **now according to the server**, not this
 * machine. That matters wherever "now" decides something: `slt().startOf('day')`
 * is what a report means by today, and a browser whose clock is a day out would
 * otherwise pull the wrong day's figures and give no sign of it.
 */
export function slt(value?: dayjs.ConfigType): Dayjs {
    return (value === undefined ? dayjs(serverNow()) : dayjs(value)).tz(DISPLAY_TZ);
}

/** Today in Sri Lanka as `YYYY-MM-DD`, for date filters and report ranges. */
export const todayISO = (): string => slt().format('YYYY-MM-DD');
