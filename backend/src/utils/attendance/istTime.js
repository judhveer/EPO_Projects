import { DateTime } from "luxon";

// ── Single source of truth for "what time is it, in India" ─────────
// Every attendance/leave file must go through these functions instead
// of calling DateTime.now() or `new Date()` directly. This exists
// because process.env.TZ is only reliably set to Asia/Kolkata as a
// side effect of one unrelated report file loading — not guaranteed
// at every entry point (routes, cron jobs, one-off scripts). Luxon's
// explicit .setZone() call sidesteps that fragility entirely; it
// doesn't depend on the ambient process timezone at all.

export const ZONE = 'Asia/Kolkata';

// Current instant, anchored to IST. Use this instead of `new Date()` or bare `DateTime.now()` anywhere attendance/leave logic needs "right now."

export function nowIST(){
    return DateTime.now().setZone(ZONE);
}

// Today's calendar date in IST, as "YYYY-MM-DD" — matches the string
// format Sequelize expects/returns for DATEONLY columns (shift_date,
// join_date). Deliberately NOT derived from a UTC "today," because
// near midnight IST (which is 18:30 UTC the previous day) a UTC-based
// "today" would silently be off by one calendar day.
export function todayISTDateOnly(){
    return nowIST().toISODate();        // "2026-08-27"
}

// Converts any stored value (JS Date from a DATETIME column, or an
// ISO string) into an IST-anchored Luxon DateTime for display or
// boundary comparisons. Use this instead of `new Date(value)`
// anywhere the value needs to be reasoned about in wall-clock IST
// terms (e.g. "was this check-in after 10 AM").
export function toIST(value){
    if(!value) return;

    const dt = value instanceof Date ? DateTime.fromJSDate(value) : DateTime.fromISO(value);
    return dt.setZone(ZONE);
}

// Builds a specific IST wall-clock moment on a given date — e.g.
// "10:00 AM IST on 2026-08-27." Used for the shift-start threshold,
// the absent-evaluation cutoff, etc. `dateOnly` accepts either a
// "YYYY-MM-DD" string or a Luxon DateTime.
export function istMomentOnDate(dateOnly, hour, minute = 0){
    const base = typeof dateOnly === 'string' ? DateTime.fromISO(dateOnly, { zone: ZONE }) : dateOnly.setZone(ZONE);
    return base.set({ hour, minute, second: 0, millisecond: 0 });
}

// Minutes between two IST-anchored Luxon DateTimes, floored — used
// for both late_minutes and overtime_minutes calculations so the two
// features never accidentally use different rounding behaviour.
export function diffInMinutes(laterDt, earlierDt){
    if(!laterDt || !earlierDt) return 0;

    const diff = laterDt.diff(earlierDt, 'minutes').minutes;
    return Math.max(0, Math.floor(diff));
}


// Proper date-range helpers for filtering DATEONLY columns — replaces
// unsafe Op.like string-pattern matching (e.g. "2026-09-%"), which
// Sequelize tries to validate as an actual date against a typed
// DATEONLY column and fails on, producing the moment.js deprecation
// warning/fallback.
export function monthRangeIST(monthStr) {
  // monthStr: "YYYY-MM"
  const start = DateTime.fromISO(`${monthStr}-01`, { zone: ZONE });
  return { start: start.toISODate(), end: start.endOf('month').toISODate() };
}

export function yearRangeIST(yearNum) {
  return { start: `${yearNum}-01-01`, end: `${yearNum}-12-31` };
}