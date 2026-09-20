import { DateTime } from 'luxon';
import models from '../../models/index.js';
import { reverseLeaveForDay } from './leaveLedgerService.js';
import { writeAuditLog } from './auditLogService.js';
import { computeLateness, computeOvertime } from './attendanceCalculations.js';
import { getAttendanceSettings } from './attendanceSettingsService.js';
import { todayISTDateOnly, toIST, ZONE } from '../../utils/attendance/istTime.js';

const { Attendance, LeaveLedger, User, sequelize } = models;

function isApprover(user) {
  return user.role === 'BOSS' || user.role === 'ADMIN' || user.department === 'HR';
}

// LEAVE deliberately excluded from what an override can set directly.
// Overriding a day TO Leave without a real LeaveRequest behind it
// would bypass every balance-safety check built into
// allocateLeave/consumeLeaveForDay — to grant leave for a specific
// day, the leave request flow (submit + approve) already handles
// retroactive dates correctly and keeps the ledger honest.
const OVERRIDABLE_STATUSES = ['PRESENT', 'LATE', 'ABSENT', 'HOLIDAY', 'WEEK_OFF'];
const TIME_BASED_STATUSES = ['PRESENT', 'LATE'];

export async function overrideAttendanceStatus({ employeeId, shiftDate, newStatus, reason, actor, checkInTime, checkOutTime }) {
  
  if (!isApprover(actor)) {
    throw Object.assign(new Error('Only BOSS, ADMIN, or HR may override attendance status.'), { statusCode: 403 });
  }
  if (!OVERRIDABLE_STATUSES.includes(newStatus)) {
    throw Object.assign(
      new Error(`Cannot override directly to "${newStatus}" — use the leave request flow to grant LEAVE for a specific day.`),
      { statusCode: 400 },
    );
  }
  if (!reason || !reason.trim()) {
    throw Object.assign(new Error('A reason is required for a manual attendance override.'), { statusCode: 400 });
  }

  // ── NEW: PRESENT/LATE require a real check-in time, and the actual status is DERIVED from it via the same computeLateness real check-ins use — never independently trusted from the dropdown. If the admin's selected status doesn't match what the time actually computes to, this rejects with a clear correction rather than silently storing a self-contradictory row (exactly what produced the LEAVE→LATE-with-no-check-in-time bug).
  let lateMinutes = 0;
  let overtimeMinutes = null;
  let finalCheckIn = null;
  let finalCheckOut = null;

  if (TIME_BASED_STATUSES.includes(newStatus)) {
    if (!checkInTime) {
      throw Object.assign(new Error(`A check-in time is required when overriding to ${newStatus}.`), { statusCode: 400 });
    }
    finalCheckIn = new Date(checkInTime);
    // ── NEW: check-in date must match the row's own shift_date ────── Prevents exactly the bug caught in testing: overriding Sept 11 with a check-in time that's actually Sept 14. The date PORTION of the entered time must equal shiftDate, regardless of what time of day it is.
    const checkInDateOnly = toIST(finalCheckIn).toISODate();
    if (checkInDateOnly !== shiftDate) {
      throw Object.assign(
        new Error(`Check-in time must fall on ${shiftDate} (the date being overridden) — you entered a time on ${checkInDateOnly}.`),
        { statusCode: 400 },
      );
    }

    // ── NEW: checkout required unless the shift day is today ──────── A day that has already elapsed must have a complete record — an admin correcting Sept 11 in mid-September has no excuse for a missing checkout, the day is long over. TODAY is the one exception: someone could genuinely still be at work right now.
    const isToday = shiftDate === todayISTDateOnly();
    if (!isToday && !checkOutTime) {
      throw Object.assign(
        new Error('A check-out time is required when overriding a day that has already ended.'),
        { statusCode: 400 },
      );
    }
    const settings = await getAttendanceSettings();
    const { isLate, lateMinutes: computedLateMinutes } = computeLateness(finalCheckIn, shiftDate, settings);
    const computedStatus = isLate ? 'LATE' : 'PRESENT';

    if (computedStatus !== newStatus) {
      throw Object.assign(
        new Error(`Based on this check-in time, the correct status is ${computedStatus}, not ${newStatus}. Select ${computedStatus}, or choose a different check-in time.`),
        { statusCode: 400 },
      );
    }
    lateMinutes = computedLateMinutes;

    if (checkOutTime) {
      finalCheckOut = new Date(checkOutTime);
      // Checkout date must equal shift_date OR shift_date+1 — the wider window (vs. check-in's exact match) is deliberate, to allow legitimate overnight MM shifts crossing midnight.
      const nextDay = DateTime.fromISO(shiftDate, { zone: ZONE }).plus({ days: 1 }).toISODate();
      const checkOutDateOnly = toIST(finalCheckOut).toISODate();
      if (checkOutDateOnly !== shiftDate && checkOutDateOnly !== nextDay) {
        throw Object.assign(
          new Error(`Check-out time must fall on ${shiftDate} or ${nextDay} (allowing an overnight shift) — you entered a time on ${checkOutDateOnly}.`),
          { statusCode: 400 },
        );
      }

      // NEW — checkout must genuinely be after check-in. Catches an admin accidentally swapping the two fields or entering backwards times, which computeOvertime would otherwise silently floor to 0 rather than flag as a real mistake.
      if (finalCheckOut <= finalCheckIn) {
        throw Object.assign(
          new Error('Check-out time must be after the check-in time.'),
          { statusCode: 400 },
        );
      }
      const { overtimeMinutes: computedOvertime } = computeOvertime(finalCheckIn, finalCheckOut, settings);
      overtimeMinutes = computedOvertime;
    }
  }


  const t = await sequelize.transaction();
  try {
    const employee = await User.findByPk(employeeId, { transaction: t });
    if (!employee) throw Object.assign(new Error('Employee not found.'), { statusCode: 404 });

    let record = await Attendance.findOne({
      where: { employee_id: employeeId, shift_date: shiftDate },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    const oldStatus = record?.status || null;

    // ── The confirmed rule: if this day is currently LEAVE (most
    // likely from auto-deduction) and is being changed AWAY from
    // LEAVE, restore the balance rather than leaving it silently
    // deducted for a day that's no longer classified as leave.
    if (oldStatus === 'LEAVE' && newStatus !== 'LEAVE') {
      const consumption = await LeaveLedger.findOne({
        where: { employee_id: employeeId, effective_date: shiftDate, transaction_type: 'CONSUMPTION' },
        transaction: t,
      });
      if (consumption) {
        await reverseLeaveForDay({
          employeeId,
          leaveTypeId: consumption.leave_type_id,
          effectiveDate: shiftDate,
          originalReferenceType: consumption.reference_type,
          originalReferenceId: consumption.reference_id,
          reason: `Admin override to ${newStatus}: ${reason}`,
          createdBy: actor.id,
          transaction: t,
        });
      }
    }

    const updatePayload = {
      status: newStatus,
      finalized_by: actor.id,
      is_manual_override: true,
      leave_request_id: newStatus === 'LEAVE' ? record?.leave_request_id : null,
    };
    if (TIME_BASED_STATUSES.includes(newStatus)) {
      updatePayload.check_in_time = finalCheckIn;
      updatePayload.check_out_time = finalCheckOut; // null if not supplied — clears any stale checkout left from a prior state
      updatePayload.late_minutes = lateMinutes;
      updatePayload.overtime_minutes = overtimeMinutes;
    }


    if (record) {
      await record.update(updatePayload, { transaction: t });
    } else {
      // No row existed at all yet for this day (no check-in, no leave
      // decision) — genuinely useful right now since the nightly
      // resolution engine doesn't exist yet; this lets BOSS/ADMIN/HR
      // manually finalize a past day in the interim.
      record = await Attendance.create({ 
        employee_id: employeeId, 
        office: employee.office, 
        shift_date: shiftDate, 
        ...updatePayload 
      }, { transaction: t });
    }

    await writeAuditLog({
      entityType: 'ATTENDANCE',
      entityId: record.id,
      action: 'MANUAL_OVERRIDE',
      performedBy: actor.id,
      oldValue: { status: oldStatus },
      newValue: { status: newStatus, checkInTime: finalCheckIn, checkOutTime: finalCheckOut },
      reason,
      transaction: t,
    });

    await t.commit();
    return record;
  } catch (err) {
    await t.rollback();
    throw err;
  }
}