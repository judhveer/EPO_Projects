import models from "../../models/index.js";
import { Op, fn, col } from 'sequelize';
import { getAttendanceSettings } from "../../services/attendance/attendanceSettingsService.js";
import { computeLateness, computeOvertime } from "../../services/attendance/attendanceCalculations.js";
import { nowIST, todayISTDateOnly } from "../../utils/attendance/istTime.js";
import { parseLocationInput, buildLocationFields } from '../../services/attendance/attendanceLocationService.js';
import { findCurrentShift } from '../../services/attendance/currentShiftService.js';

const { Attendance } = models;


// ── Guard: is this account actually tracked by the attendance system? ── BOSS is explicitly excluded per business requirement. Any other user missing an office assignment is a data-setup problem (admin hasn't finished configuring their account yet) — surfaced as a clear error rather than silently failing on the Attendance table's NOT NULL `office` column.
function assertTrackable(user) {
    if (user.role === "BOSS") {
        const err = new Error('BOSS accounts are not tracked by the attendance system.');
        err.statusCode = 400;
        throw err;
    }

    if (!user.office) {
        const err = new Error('Your account has no office assigned yet. Contact an admin before marking attendance.');
        err.statusCode = 400;
        throw err;
    }
}

// ── POST /api/attendance/check-in ───────────────────────────────────
export async function checkIn(req, res) {
    try {
        assertTrackable(req.user);

        // NEW: location is mandatory. Rejected before any DB work.
        const location = parseLocationInput(req.body, 'check in');

        const employeeId = req.user.id;
        // CHANGED: one `now` drives the date, the shift lookup and the lateness maths, so they can't disagree around midnight. Still captured BEFORE the location lookup.
        const now = nowIST();
        const shiftDate = now.toISODate();
        const settings = await getAttendanceSettings();

        // NEW: block starting a new shift while an overnight one is open.
        const current = await findCurrentShift(employeeId, now);
        if (current.overnight) {
            return res.status(409).json({
                error: 'You still have an open shift from yesterday. Please check out of it first.',
                code: 'OVERNIGHT_SHIFT_OPEN',
                attendance: current.record,
            });
        }

        // NEW: an earlier shift is past its 6 AM cutoff but was never closed. Starting a new day on top of it would leave a hole in the record, so check-in is refused until the auto-closer (or HR) resolves it.
        if (current.staleOpen) {
            return res.status(409).json({
                error: `Your shift from ${current.staleOpen.shift_date} was not checked out yet. It will be closed automatically shortly. Please try again in a few minutes. If this keeps happening, contact HR.`,
                code: 'PREVIOUS_SHIFT_UNCLOSED',
                attendance: current.staleOpen,
            });
        }

        const existing = current.record;

        if (existing && existing.check_in_time) {
            if (existing.check_out_time && existing.shift_date !== shiftDate) {
                // Yesterday's overnight shift is done; still inside the 6 AM block window (chooseCurrentShift only returns it this early).
                return res.status(409).json({
                    error: 'Your overnight shift is complete. Check-in for a new day opens at 6:00 AM.',
                    code: 'OVERNIGHT_SHIFT_JUST_COMPLETED',
                    attendance: existing,
                });
            }
            return res.status(409).json({
                error: 'You have already checked in today.',
                attendance: existing,
            });
        }

        const { isLate, lateMinutes } = computeLateness(now.toJSDate(), shiftDate, settings);
        const status = isLate ? 'LATE' : 'PRESENT';

        // NEW: only reached for a check-in that will actually be saved, so duplicate/rejected requests never spend a Geoapify credit.
        const locationFields = await buildLocationFields('check_in', location, settings);

        let record;
        if (existing) {
            // Defensive path — under current design, a row for TODAY only ever exists if this employee already checked in today (the nightly finalization job only ever processes days that have already ended). Handled anyway rather than assumed impossible.
            await existing.update({
                check_in_time: now.toJSDate(),
                status,
                late_minutes: lateMinutes,
                ...locationFields,
            });
            record = existing;
        }
        else {
            try {
                record = await Attendance.create({
                    employee_id: employeeId,
                    office: req.user.office,
                    shift_date: shiftDate,
                    check_in_time: now.toJSDate(),
                    status,
                    late_minutes: lateMinutes,
                    ...locationFields,
                });

            }
            catch (err) {
                // Two simultaneous check-in requests for the same employee/day (e.g. a double-tap on a slow connection) both pass the findOne check above before either has committed an insert. The unique (employee_id, shift_date) constraint is the real safety net here — this catch turns that DB-level rejection into a clean "already checked in" response instead of a 500.
                if (err.name === 'SequelizeUniqueConstraintError') {
                    const already = await Attendance.findOne({
                        employee_id: employeeId,
                        shift_date: shiftDate,
                    });
                    return res.status(409).json({
                        error: 'You have already checked in today.',
                        attendance: already,
                    });
                }
                throw err;
            }
        }

        return res.status(201).json({
            message: isLate
                ? `Checked in — ${lateMinutes} minute(s) late.`
                : 'Checked in successfully.',
            attendance: record,
        });

    }
    catch (err) {
        console.error('[checkIn]', err);
        return res.status(err.statusCode || 500).json({
            error: err.statusCode ? err.message : 'Failed to check in.',
            ...(err.statusCode && err.code && { code: err.code }), // NEW: lets the UI recognise LOCATION_REQUIRED
        });
    }
}


// ── POST /api/attendance/check-out ──────────────────────────────────
export async function checkOut(req, res) {
    try {
        assertTrackable(req.user);

        // NEW: location is mandatory for check-out too.
        const location = parseLocationInput(req.body, 'check out');

        const employeeId = req.user.id;
        const now = nowIST();
        const settings = await getAttendanceSettings();

        // CHANGED: this used to look up TODAY's date only, which made check-out impossible after midnight for an overnight shift. `existing` may now be yesterday's still-open shift (before 6 AM). Its shift_date stays yesterday's; overtime is a diff of two full timestamps, so crossing midnight is handled correctly.
        const { record: existing } = await findCurrentShift(employeeId, now);

        if (!existing || !existing.check_in_time) {
            return res.status(400).json({
                error: 'You have not checked in today — cannot check out.',
            });
        }

        if (existing.check_out_time) {
            return res.status(400).json({
                error: 'You have already checked out today.',
                attendance: existing,
            });
        }

        // No special handling needed for MM's occasional cross-midnight finish — `now` is a full IST DateTime with its own date component, and computeOvertime diffs two full DATETIMEs, so a 9 PM check-in with a 1 AM check-out is handled correctly without any date-boundary logic here. This only works because shift_date (set at check-in) stays fixed regardless of what calendar date the check-out timestamp actually falls on.
        const { overtimeMinutes } = computeOvertime(
            existing.check_in_time,
            now.toJSDate(),
            settings
        );

        // NEW: after the validations above, so rejected requests spend no credit.
        const locationFields = await buildLocationFields('check_out', location, settings);

        await existing.update({
            check_out_time: now.toJSDate(),
            overtime_minutes: overtimeMinutes,
            ...locationFields,
        });

        return res.json({
            message: overtimeMinutes > 0
                ? `Checked out — ${overtimeMinutes} minute(s) overtime recorded.`
                : 'Checked out successfully.',
            attendance: existing,
        });
    }
    catch (err) {
        console.error('[checkOut]', err);
        return res.status(err.statusCode || 500).json({
            error: err.statusCode ? err.message : 'Failed to check out.',
            ...(err.statusCode && err.code && { code: err.code }),
        });
    }
};

// ── GET /api/attendance/me/today ────────────────────────────────────
// Lets the frontend know whether to render "Check In" or "Check Out", and show current status, without guessing client-side.
// CHANGED: returns the CURRENT shift (which may be yesterday's open overnight shift) so the screen shows Check Out at 1 AM, not Check In.
export async function getMyTodayStatus(req, res) {
    try {
        assertTrackable(req.user);

        const now = nowIST();

        const { record, overnight, staleOpen } = await findCurrentShift(req.user.id, now);

        return res.json({
            shift_date: now.toISODate(),
            attendance: record || null,
            overnight,
            // Set while an earlier shift is unclosed; the screen hides Check In.
            blockedBy: staleOpen
                ? { shift_date: staleOpen.shift_date, check_in_time: staleOpen.check_in_time }
                : null,
        });
    }
    catch (err) {
        console.error('[getMyTodayStatus]', err);
        return res.status(err.statusCode || 500).json({
            error: err.statusCode ? err.message : "Failed to fetch today's status.",
        });
    }
}



// ── GET /api/attendance/me/summary ──────────────────────────────────
export async function getMySummary(req, res) {
    try {
        assertTrackable(req.user);

        const currentYear = Number(todayISTDateOnly().slice(0, 4));
        const yearStart = `${currentYear}-01-01`;
        const yearEnd = `${currentYear}-12-31`;

        const rows = await Attendance.unscoped().findAll({
            attributes: ['status', [fn('COUNT', col('id')), 'count']],
            where: { employee_id: req.user.id, shift_date: { [Op.between]: [yearStart, yearEnd] } },
            group: ['status'],
            raw: true,
        });

        const counts = { PRESENT: 0, LATE: 0, ABSENT: 0, HOLIDAY: 0, WEEK_OFF: 0, LEAVE: 0 };
        rows.forEach((r) => { counts[r.status] = Number(r.count); });

        const pendingLeaveCount = await models.LeaveRequest.count({
            where: { employee_id: req.user.id, status: 'PENDING' },
        });

        res.json({
            year: currentYear,
            presentDays: counts.PRESENT + counts.LATE,
            absentDays: counts.ABSENT,
            leaveDaysTaken: counts.LEAVE,
            pendingLeaveRequests: pendingLeaveCount,
        });
    } catch (err) {
        console.error('[getMySummary]', err);
        res.status(err.statusCode || 500).json({ error: err.statusCode ? err.message : 'Failed to load summary.' });
    }
}


export default { checkIn, checkOut, getMyTodayStatus, getMySummary };
