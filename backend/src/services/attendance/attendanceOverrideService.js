import models from '../../models/index.js';
import { reverseLeaveForDay } from './leaveLedgerService.js';
import { writeAuditLog } from './auditLogService.js';

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

export async function overrideAttendanceStatus({ employeeId, shiftDate, newStatus, reason, actor }) {
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

    if (record) {
      await record.update({
        status: newStatus,
        finalized_by: actor.id,
        is_manual_override: true,
        leave_request_id: newStatus === 'LEAVE' ? record.leave_request_id : null,
      }, { transaction: t });
    } else {
      // No row existed at all yet for this day (no check-in, no leave
      // decision) — genuinely useful right now since the nightly
      // resolution engine doesn't exist yet; this lets BOSS/ADMIN/HR
      // manually finalize a past day in the interim.
      record = await Attendance.create({
        employee_id: employeeId,
        office: employee.office,
        shift_date: shiftDate,
        status: newStatus,
        finalized_by: actor.id,
        is_manual_override: true,
      }, { transaction: t });
    }

    await writeAuditLog({
      entityType: 'ATTENDANCE',
      entityId: record.id,
      action: 'MANUAL_OVERRIDE',
      performedBy: actor.id,
      oldValue: { status: oldStatus },
      newValue: { status: newStatus },
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