/**
 * What time it is according to the server, not according to this machine.
 *
 * A browser's clock can be wrong — a VM with drifted time, a laptop set by
 * hand, a machine imaged in another region. Every rule that turns on a time is
 * decided on the server (what "today" covers, whether a return window is still
 * open), so a dashboard that computes "now" locally can show a figure the
 * server would not agree with — and the two are never reconciled because
 * nobody suspects the clock.
 *
 * The answer is already in every reply: HTTP responses carry a `Date` header.
 * [recordServerDate] keeps the difference, [serverNow] applies it.
 *
 * The browser is still used for *elapsed* time since the last response, which
 * is what a local clock is reliable at. Only the anchor comes from the server.
 * Before the first response the skew is zero — the local clock, which is the
 * best available answer and usually right.
 */
let skewMs = 0;
let synced = false;

/** Whether a server timestamp has been seen yet. */
export const isClockSynced = (): boolean => synced;

/** How far this machine's clock is from the server's, for diagnostics. */
export const clockSkewMs = (): number => skewMs;

/**
 * Learn the offset from a response's `Date` header.
 *
 * Anything unparseable is ignored rather than guessed at: a proxy that
 * rewrites or drops the header should leave the clock as it was.
 */
export function recordServerDate(header: string | undefined | null): void {
    if (!header) return;
    const serverMs = Date.parse(header);
    if (Number.isNaN(serverMs)) return;
    skewMs = serverMs - Date.now();
    synced = true;
}

/** Now, as the server reckons it. */
export const serverNow = (): Date => new Date(Date.now() + skewMs);
