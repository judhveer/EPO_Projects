import { Op } from 'sequelize';
import { DateTime } from 'luxon';
import models from '../../models/index.js';
import { ZONE } from '../../utils/attendance/istTime.js';
import { isHolidayForEmployee } from './holidayCheck.js';
import { consumeLeaveForDay, InsufficientLeaveBalanceError } from './leaveLedgerService.js';


const { Attendance, LeaveRequest, LeaveType } = models;

function isSundayIST(dateOnlyString){
    return DateTime.fromISO(dateOnlyString, { zone: ZONE }).weekday === 7;
}

/**
 * Resolves attendance for exactly ONE employee, ONE past day, inside
 * the caller's transaction. Returns the created row, or null if a row
 * already existed (idempotent no-op) — this function only ever FILLS
 * A GAP, it never overwrites an existing PRESENT/LATE/LEAVE/manually-
 * overridden row. Overwriting is deliberately the admin override
 * endpoint's job, not this engine's.
 *
 * Implements the confirmed decision order:
 *   1. Row already exists?              → skip
 *   2. Sunday?                          → WEEK_OFF
 *   3. Holiday for this employee?       → HOLIDAY
 *   4. Pending leave request covers it? → consume that type; if it
 *                                          has no balance, fall
 *                                          through to step 5 instead
 *                                          of giving up
 *   5. Any auto-deductible type with
 *      balance, in priority order?      → consume it, LEAVE
 *   6. Otherwise                        → ABSENT
 */

export async function resolveAttendanceForDay(employee, shiftDate, transaction){
    const existing = await Attendance.findOne({
        where: { employee_id: employee.id, shift_date: shiftDate },
        transaction,
        lock: transaction.LOCK.UPDATE,
    });

    if(existing){
        return null;
    }

    // ── Step 2: Sunday ──────────────────────────────────────────────
    if (isSundayIST(shiftDate)) {
        return Attendance.create({
            employee_id: employee.id, 
            office: employee.office, 
            shift_date: shiftDate, 
            status: 'WEEK_OFF',
        }, { transaction });
    }

    // ── Step 3: Holiday ─────────────────────────────────────────────
    if (await isHolidayForEmployee(employee.id, shiftDate)) {
        return Attendance.create({
            employee_id: employee.id, 
            office: employee.office, 
            shift_date: shiftDate, 
            status: 'HOLIDAY',
        }, { transaction });
    }

    // ── Step 4: pending leave request covering this date ────────────
    const pendingRequest = await LeaveRequest.findOne({
        where: {
            employee_id: employee.id, 
            status: 'PENDING',
            date_from: { [Op.lte]: shiftDate }, 
            date_to: { [Op.gte]: shiftDate },
        },
        transaction,
    });

    if (pendingRequest) {
        try {
            await consumeLeaveForDay({
                employeeId: employee.id,
                leaveTypeId: pendingRequest.leave_type_id,
                effectiveDate: shiftDate,
                referenceType: 'LEAVE_REQUEST',
                referenceId: pendingRequest.id,
                reason: `Pending leave request ${pendingRequest.id} auto-consumed for no-show day`,
                transaction,
            });
            return Attendance.create({
                employee_id: employee.id, 
                office: employee.office, 
                shift_date: shiftDate,
                status: 'LEAVE', 
                leave_request_id: pendingRequest.id,
            }, { transaction });
        } catch (err) {
            if (!(err instanceof InsufficientLeaveBalanceError)) throw err;
            // The SPECIFIC type they requested has no balance — falls
            // through to try priority auto-deduction below rather than
            // going straight to ABSENT. This is my interpretation, not a
            // word-for-word rule you confirmed: someone who filed a request
            // clearly intended to be on leave, so trying a different
            // eligible type before landing on ABSENT reads as more coherent
            // than refusing to try at all. Flag it if you'd rather this go
            // straight to ABSENT instead when the requested type specifically
            // has no balance.
        }
    }

    // ── Step 5: priority-ordered auto-deduction ─────────────────────
    const autoDeductibleTypes = await LeaveType.findAll({
        where: { 
            active: true, 
            auto_deductible: true 
        },
        order: [['auto_deduct_priority', 'ASC']],
        transaction,
    });

    for (const leaveType of autoDeductibleTypes) {
        try {
            await consumeLeaveForDay({
                employeeId: employee.id,
                leaveTypeId: leaveType.id,
                effectiveDate: shiftDate,
                referenceType: 'AUTO_DEDUCTION',
                referenceId: null,
                reason: 'No-show — automatically deducted per configured priority order',
                transaction,
            });
            return Attendance.create({
                employee_id: employee.id, 
                office: employee.office, 
                shift_date: shiftDate,
                status: 'LEAVE', 
                leave_request_id: null,
            }, { transaction });
        } catch (err) {
            if (!(err instanceof InsufficientLeaveBalanceError)) throw err;
            continue; // next type in priority order
        }
    }

    // ── Step 6: nothing available ─────────────────────────────────────
    return Attendance.create({
        employee_id: employee.id,
        office: employee.office, 
        shift_date: shiftDate, 
        status: 'ABSENT',
    }, { transaction });

}