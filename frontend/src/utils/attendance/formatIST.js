import { DateTime } from 'luxon';

const ZONE = 'Asia/Kolkata';

// Formats an ISO datetime (check_in_time / check_out_time) as IST
// wall-clock time. Matches the exact DateTime.fromJSDate(...).setZone(...)
// pattern already used throughout the JobFMS frontend (DesignerTable.jsx
// etc.) for consistency, rather than introducing a different style.
export function formatISTTime(isoString) {
  if (!isoString) return '--:--';
  return DateTime.fromJSDate(new Date(isoString)).setZone(ZONE).toFormat('hh:mm a');
}

// Formats a DATEONLY value (shift_date) for display.
export function formatISTDate(dateOnlyString) {
  if (!dateOnlyString) return '-';
  return DateTime.fromISO(dateOnlyString, { zone: ZONE }).toFormat('dd LLL yyyy');
}

// late_minutes / overtime_minutes are now plain integers (the old
// backend sent a pre-formatted string like "2h 15min" — that
// formatting responsibility moves here, client-side, now that the
// backend sends raw, reportable numbers instead.
export function formatMinutes(mins) {
  if (mins === null || mins === undefined || mins === 0) return '-';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
