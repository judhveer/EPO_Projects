import { toIST, istMomentOnDate, diffInMinutes } from "../../utils/attendance/istTime.js";

/**
 * Determines lateness for a check-in against the configured shift start.
 *
 * @param {Date} checkInTime  raw DATETIME value from the DB (or a fresh
 *                            check-in moment about to be saved)
 * @param {string} shiftDate  "YYYY-MM-DD" — the logical work day this
 *                            check-in belongs to (NOT necessarily the
 *                            calendar date of checkInTime itself)
 * @param {object} settings   result of getAttendanceSettings()
 * @returns {{ isLate: boolean, lateMinutes: number }}
 */

export function computeLateness(checkInTime, shiftDate, settings){
    const checkInIST = toIST(checkInTime);

    if(!checkInIST){
        return {
            isLate: false,
            lateMinutes: 0,
        };
    }

    const rawStart = istMomentOnDate(shiftDate, settings.shift_start_hour, settings.shift_start_minute);
    const graceThreshold = rawStart.plus({ minutes: settings.grace_minutes });

    const isLate = checkInIST > graceThreshold;
    // Grace period still determines WHETHER a check-in counts as late at
    // all (arriving within the grace window is simply on time, no flag).
    // But once it IS late, the minute count is measured from the raw
    // shift start (10:00), not the grace-adjusted threshold (10:15) —
    // per confirmed requirement. So someone arriving at 10:20 is flagged
    // late (20 > 15-minute grace) and shows as 20 minutes late (from 10:00), not 5 minutes late (from 10:15).
    const lateMinutes = isLate ? diffInMinutes(checkInIST, rawStart) : 0;

    return { isLate, lateMinutes }; 
}


/**
 * Determines overtime for a completed shift (check-in AND check-out both present). Overtime is measured from ACTUAL check-in time, not a fixed clock time — confirmed per business rule: someone checking in at 1 PM only starts accruing overtime after 8 hours from 1 PM, not from a fixed 6 PM.
 * Cross-midnight shifts (confirmed as a real, if occasional, MM scenario) are handled naturally here — checkOutTime is a full DATETIME with its own date component, so Luxon's diff() correctly spans midnight without any special-casing needed. This only works because shift_date (the logical work day) is stored separately from the calendar date embedded in check_in_time/check_out_time — see the Attendance schema.
 * @returns {{ overtimeMinutes: number | null }} null = not yet determinable (no check-out recorded yet — an open shift, not zero overtime)
 */
export function computeOvertime(checkInTime, checkOutTime, settings){
    if(!checkInTime || !checkOutTime){
        return { overtimeMinutes: null };   // shift still open — genuinely unknown, not zero
    }

    const checkInIST = toIST(checkInTime);
    const checkOutIST = toIST(checkOutTime);

    const totalWorkedMinutes = diffInMinutes(checkOutIST, checkInIST);
    const overtimeMinutes = Math.max(0, totalWorkedMinutes - settings.overtime_threshold_minutes);

    return { overtimeMinutes };
}