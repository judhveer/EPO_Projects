import { DateTime } from 'luxon';
import { Op } from 'sequelize';
import models from '../../models/index.js';
import { ZONE, todayISTDateOnly } from '../../utils/attendance/istTime.js';
import { isEligibleToday } from './leaveEligibility.js';
import { consumeLeaveForDay, reverseLeaveForDay, InsufficientLeaveBalanceError, getLeaveBalance, lockAllocationRow } from './leaveLedgerService.js';
import { isHolidayForEmployee } from './holidayCheck.js';
import { writeAuditLog } from './auditLogService.js';
import { notifyRecipientsOfSubmission, notifyRecipientsOfCancellation, notifyEmployeeOfDecision } from './leaveNotificationService.js';

const { LeaveRequest, LeaveType, Attendance, User, LeaveLedger, sequelize } = models;

// Same approver group already established for the /attendance routing decision (BOSS, ADMIN, HR) — reused, not reinvented.

function isApprover(user){
    return user.role === 'BOSS' || user.role === 'ADMIN' || user.department === 'HR';
}

function isSundayIST(dateOnlyString){
    return DateTime.fromISO(dateOnlyString, { zone: ZONE }).weekday === 7; // Luxon: 1=Mon...7=Sun
}

function* eachDateInRange(fromStr, toStr){
    let cursor = DateTime.fromISO(fromStr, { zone: ZONE });
    const end = DateTime.fromISO(toStr, { zone: ZONE });
    while (cursor <= end) {
        yield cursor.toISODate();
        cursor = cursor.plus({ days: 1 });
    }
}


export async function estimateLeaveRequest({ employeeId, leaveTypeId, dateFrom, dateTo, excludeRequestId = null, transaction = null }) {
  let workingDays = 0;
  for (const day of eachDateInRange(dateFrom, dateTo)) {
    if (isSundayIST(day)) continue;
    if (await isHolidayForEmployee(employeeId, day)) continue;
    workingDays++;
  }

  const leaveYear = Number(dateFrom.slice(0, 4));
  const ledgerBalance = await getLeaveBalance(employeeId, leaveTypeId, leaveYear, transaction);

  // ── Subtract every OTHER pending request's own day-count ───────────
  // A PENDING request hasn't consumed the ledger yet — consumption only
  // happens at approval — but it's a real future claim on the same
  // balance. Without this, two separate pending requests could each
  // individually look affordable against the same untouched balance,
  // even though approving both together would exceed it.
  const otherPending = await LeaveRequest.findAll({
    where: {
      employee_id: employeeId,
      leave_type_id: leaveTypeId,
      status: 'PENDING',
      ...(excludeRequestId && { id: { [Op.ne]: excludeRequestId } }),
    },
    attributes: ['id', 'date_from', 'date_to'],
    transaction,
  });

  let pendingCommitted = 0;
  for (const req of otherPending) {
    for (const day of eachDateInRange(req.date_from, req.date_to)) {
      // Only counts the portion in the SAME leave year as this
      // estimate — a pending request that itself crosses years is the
      // separately-flagged, deliberately-ignored-for-now limitation,
      // not something being solved here.
      if (Number(day.slice(0, 4)) !== leaveYear) continue;
      if (isSundayIST(day)) continue;
      if (await isHolidayForEmployee(employeeId, day)) continue;
      pendingCommitted++;
    }
  }

  const effectiveAvailable = ledgerBalance - pendingCommitted;
  const sufficient = workingDays <= effectiveAvailable;

  return { workingDays, balance: ledgerBalance, pendingCommitted, effectiveAvailable, sufficient };
}





// ── SUBMIT ───────────────────────────────────────────────────────────
export async function submitLeaveRequest({ employeeId, leaveTypeId, dateFrom, dateTo, reason }){
    const employee = await User.findByPk(employeeId);
    if (!employee) {
        throw Object.assign(new Error('Employee not found.'), { statusCode: 404 });
    }

    // Structurally blocked, per confirmed requirement — not just discouraged, an actual hard rejection before any DB write.
    if(!isEligibleToday(employee.join_date)){
        throw Object.assign(
            new Error('You are not yet eligible for leave. Eligibility begins 6 months after your join date.'),
            { statusCode: 403 },
        );
    }

    const leaveType = await LeaveType.findByPk(leaveTypeId);

    if (!leaveType || !leaveType.active) {
        throw Object.assign(new Error('Selected leave type is not available.'), { statusCode: 400 });
    }

    if (dateTo < dateFrom) {
        throw Object.assign(new Error('End date cannot be before start date.'), { statusCode: 400 });
    }

    if (dateFrom < todayISTDateOnly()) {
        throw Object.assign(new Error('Leave cannot be requested for a past date.'), { statusCode: 400 });
    }

    // ── From here on: one transaction, holding a lock on this
    // employee's LeaveAllocation row for this type/year — the same
    // mutex already used by consumeLeaveForDay/reverseLeaveForDay. A
    // second concurrent submission for the same employee+type+year now
    // genuinely blocks until this one fully commits or rolls back,
    // rather than both racing against a stale read.
    const leaveYear = Number(dateFrom.slice(0, 4));
    const t = await sequelize.transaction();

    try {
        let allocation;
        try {
            allocation = await lockAllocationRow(employeeId, leaveTypeId, leaveYear, t);
        } catch (err) {
            // No LeaveAllocation row exists yet — real, legitimate state
            // (eligible employee, allocation job just hasn't run for them
            // yet). Translated into the same clean 400 as "insufficient
            // balance" rather than surfacing lockAllocationRow's raw error.
            throw Object.assign(
                new Error(`No ${leaveType.name} balance has been allocated to you yet for ${leaveYear}. Contact an admin if this seems wrong.`),
                { statusCode: 400 },
            );
        }

        // Overlap check — now inside the same lock, can't race a
        // concurrent submission for the same dates either.
        const overlapping = await LeaveRequest.findOne({
            where: {
                employee_id: employeeId,
                status: { [Op.in]: ['PENDING', 'APPROVED'] },
                date_from: { [Op.lte]: dateTo },
                date_to: { [Op.gte]: dateFrom },
            },
            transaction: t,
        });

        if (overlapping) {
            throw Object.assign(
                new Error(`You already have a ${overlapping.status.toLowerCase()} request overlapping these dates.`),
                { statusCode: 409 },
            );
        }
        
        // ── NEW: real balance check, before the request is ever created ────
        // Covers both cases: a type already at 0, and a range that exceeds whatever partial balance remains — same check, since a 0-balance type is just the special case where any range fails it.
        const { workingDays: estimatedDays, effectiveAvailable, sufficient } = await estimateLeaveRequest({
            employeeId, leaveTypeId, dateFrom, dateTo, transaction: t,
        });

        if (!sufficient) {
            throw Object.assign(
                new Error(`This request needs ${estimatedDays} working day(s), but you only have ${effectiveAvailable} ${leaveType.name} day(s) actually available (some may already be committed to another pending request).`),
                { statusCode: 400 },
            );
        }

        const request = await LeaveRequest.create({
            employee_id: employeeId,
            leave_type_id: leaveTypeId,
            date_from: dateFrom,
            date_to: dateTo,
            reason: reason || null,
            status: 'PENDING',
        }, { transaction: t });

        await t.commit();

        const leaveTypeObj = await LeaveType.findByPk(leaveTypeId, { attributes: ['name'] });
        notifyRecipientsOfSubmission(request, employee, leaveTypeObj?.name || 'Leave').catch((err) =>
            console.error('[leaveNotificationService] submission notification failed:', err.message)
        );

        return { request, estimatedWorkingDays: estimatedDays };
    } catch (err) {
        await t.rollback();
        throw err;
    }
}

// ── APPROVE ──────────────────────────────────────────────────────────
export async function approveLeaveRequest({ requestId, approver, decisionReason }){
    if (!isApprover(approver)) {
        throw Object.assign(new Error('Only BOSS, ADMIN, or HR may approve leave requests.'), { statusCode: 403 });
    }

    const t = await sequelize.transaction();

    try{
        const request = await LeaveRequest.findByPk(requestId, { transaction: t, lock: t.LOCK.UPDATE });

        if(!request){
            throw Object.assign(new Error('Leave request not found.'), { statusCode: 404 });
        }

        if(request.status !== 'PENDING'){
            throw Object.assign(new Error(`Cannot approve — request is already ${request.status}.`), { statusCode: 409 });
        }

        const employee = await User.findByPk(request.employee_id, { transaction: t });
        if (!employee) {
            throw Object.assign(new Error('Employee no longer exists.'), { statusCode: 404 });
        }

        const consumedDays = [];
        const skippedDays = [];

        for(const day of eachDateInRange(request.date_from, request.date_to)){
            if (isSundayIST(day)) continue; // no leave unit consumed — confirmed rule
            if (await isHolidayForEmployee(employee.id, day)) continue; // stubbed false today

            const existing = await Attendance.findOne({
                where: { 
                    employee_id: employee.id, 
                    shift_date: day 
                },
                transaction: t,
                lock: t.LOCK.UPDATE,
            });

            if (existing?.check_in_time) {
                // Employee actually worked this day — Present wins over an
                // approved leave for the same date, per the resolution
                // precedence. Never overwritten, never consumed.
                skippedDays.push({ day, reason: 'already PRESENT/LATE — employee worked this day' });
                continue;
            }

            if (existing?.status === 'LEAVE') {
                // Already resolved as leave via a different path (most likely
                // an earlier auto-deduction). Not double-consuming — surfaced
                // to the approver rather than silently guessed at.
                skippedDays.push({ day, reason: 'already marked LEAVE via another path' });
                continue;
            }

            if (existing?.status === 'HOLIDAY' || existing?.status === 'WEEK_OFF') {
                skippedDays.push({ day, reason: `already ${existing.status} — non-working day` });
                continue;
            }

            // Eligible to consume: either no row yet (a future date), or an existing ABSENT/UNRESOLVED row with no check-in — this is the retroactive-correction path, approving leave for a day already marked Absent.
            await consumeLeaveForDay({
                employeeId: employee.id,
                leaveTypeId: request.leave_type_id,
                effectiveDate: day,
                referenceType: 'LEAVE_REQUEST',
                referenceId: request.id,
                createdBy: approver.id,
                reason: `Approved leave request ${request.id}`,
                transaction: t,
            });

            if (existing) {
                await existing.update({ status: 'LEAVE', leave_request_id: request.id }, { transaction: t });
            } else {
                await Attendance.create({
                employee_id: employee.id,
                office: employee.office,
                shift_date: day,
                status: 'LEAVE',
                leave_request_id: request.id,
                }, { transaction: t });
            }

            consumedDays.push(day);
        }
        request.status = 'APPROVED';
        request.decided_by = approver.id;
        request.decided_at = new Date();
        request.decision_reason = decisionReason || null;
        await request.save({ transaction: t });

        await writeAuditLog({
            entityType: 'LEAVE_REQUEST',
            entityId: request.id,
            action: 'APPROVED',
            performedBy: approver.id,
            oldValue: { status: 'PENDING' },
            newValue: { status: 'APPROVED', consumedDays, skippedDays },
            reason: decisionReason,
            transaction: t,
        });

        await t.commit();

        const leaveTypeObj = await LeaveType.findByPk(request.leave_type_id, 
            { attributes: ['name'] }
        );

        notifyEmployeeOfDecision({
            request, employee, leaveTypeName: leaveTypeObj?.name || 'Leave',
            decision: 'APPROVED', decidedByName: approver.username, decisionReason,
        }).catch((err) => console.error('[leaveNotificationService] approval notification failed:', err.message))
        .finally( () => console.log("notifyEmployeeOfDecision successful for approve Leave Request."));


        return { request, consumedDays, skippedDays };
    }
    catch(err){
        await t.rollback(); // ← whole approval undone — nothing partially applied
        if (err instanceof InsufficientLeaveBalanceError) {
            throw Object.assign(
                new Error(`Cannot approve — insufficient leave balance partway through the requested range (available: ${err.available}).`),
                { statusCode: 409 },
            );
        }
        throw err;
    }
}

// ── REJECT ───────────────────────────────────────────────────────────
export async function rejectLeaveRequest({ requestId, approver, decisionReason }){
    if (!isApprover(approver)) {
        throw Object.assign(new Error('Only BOSS, ADMIN, or HR may reject leave requests.'), { statusCode: 403 });
    }

    if (!decisionReason || !decisionReason.trim()) {
        throw Object.assign(new Error('A reason is required when rejecting a leave request.'), { statusCode: 400 });
    }

    const t = await sequelize.transaction();

    try{
         const request = await LeaveRequest.findByPk(requestId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!request) {
            throw Object.assign(new Error('Leave request not found.'), { statusCode: 404 });
        }

        if (request.status !== 'PENDING') {
            throw Object.assign(new Error(`Cannot reject — request is already ${request.status}.`), { statusCode: 409 });
        }

        const revertedDays = await reverseAllConsumptionsForRequest(
            request, approver, `Leave request ${request.id} rejected: ${decisionReason}`, t
        );

        request.status = 'REJECTED';
        request.decided_by = approver.id;
        request.decided_at = new Date();
        request.decision_reason = decisionReason;
        await request.save({ transaction: t });

        await writeAuditLog({
            entityType: 'LEAVE_REQUEST',
            entityId: request.id,
            action: 'REJECTED',
            performedBy: approver.id,
            oldValue: { status: 'PENDING' },
            newValue: { status: 'REJECTED', revertedDays },
            reason: decisionReason,
            transaction: t,
        });

        await t.commit();

        const rejectedEmployee = await User.findByPk(request.employee_id);

        const leaveTypeObj = await LeaveType.findByPk(request.leave_type_id, { attributes: ['name'] });
        notifyEmployeeOfDecision({
            request, employee: rejectedEmployee, leaveTypeName: leaveTypeObj?.name || 'Leave',
            decision: 'REJECTED', decidedByName: approver.username, decisionReason,
        }).catch((err) => console.error('[leaveNotificationService] rejection notification failed:', err.message))
        .finally( () => console.log("notifyEmployeeOfDecision successful reject leave request."));

        return { request, revertedDays };
    }
    catch(err){
        await t.rollback();
        throw err;
    }
}


// Shared reversal helper ---
// Reject and cancel both need to undo the exact same thing: every CONSUMPTION ledger entry tied to this request, plus the Attendace rows it touched. Extracted once so these two paths can never silently drift apart from each other over time.
async function reverseAllConsumptionsForRequest(request, actor, reason, transaction){
    const priorConsumptions = await LeaveLedger.findAll({
        where: { transaction_type: 'CONSUMPTION', reference_type: 'LEAVE_REQUEST', reference_id: request.id },
        transaction,
    });

    const revertedDays = [];
    for (const entry of priorConsumptions) {
        await reverseLeaveForDay({
            employeeId: entry.employee_id,
            leaveTypeId: entry.leave_type_id,
            effectiveDate: entry.effective_date,
            originalReferenceType: 'LEAVE_REQUEST',
            originalReferenceId: request.id,
            reason,
            createdBy: actor.id,
            transaction,
        });

        // Simplified fallback, same flagged caveat as before — reverts
        // straight to ABSENT rather than full re-resolution, which
        // properly belongs to the resolution engine (not yet built).
        const attendanceRow = await Attendance.findOne({
            where: { employee_id: entry.employee_id, shift_date: entry.effective_date },
            transaction,
        });
        if (attendanceRow && !attendanceRow.check_in_time) {
            await attendanceRow.update({ status: 'ABSENT', leave_request_id: null }, { transaction });
        }
        revertedDays.push(entry.effective_date);
    }
  return revertedDays;
}

// ── rejectLeaveRequest — now calls the shared helper instead of an
// inline duplicate loop. Replace the old inline block with this line:
//   const revertedDays = await reverseAllConsumptionsForRequest(
//     request, approver, `Leave request ${request.id} rejected: ${decisionReason}`, t
//   );




// ── CANCEL ───────────────────────────────────────────────────────────
// Either the request's own owner, or an approver acting on their behalf, can cancel — both a PENDING request (no ledger impact, since nothing has been consumed against it yet under the current, pre-resolution-engine system) and an APPROVED one (reverses whatever was consumed at approval time).
export async function cancelLeaveRequest({ requestId, actor, reason }){
    const t = await sequelize.transaction();
    try{
        const request = await LeaveRequest.findByPk(requestId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!request) {
            throw Object.assign(new Error('Leave request not found.'), { statusCode: 404 });
        }

        const isOwner = request.employee_id === actor.id;
        if (!isOwner && !isApprover(actor)) {
            throw Object.assign(new Error('You can only cancel your own leave requests.'), { statusCode: 403 });
        }
        if (!['PENDING', 'APPROVED'].includes(request.status)) {
            throw Object.assign(new Error(`Cannot cancel — request is already ${request.status}.`), { statusCode: 409 });
        }

        // NEW: an approved leave whose entire range has already elapsed can't be cancelled — the days already happened. A no-op check for PENDING requests, since those can never have a past date_from in the first place (blocked at submission).
        if (request.status === 'APPROVED' && request.date_to < todayISTDateOnly()) {
            throw Object.assign(
                new Error('Cannot cancel — this leave period has already ended.'),
                { statusCode: 409 },
            );
        }



        const oldStatus = request.status; // captured BEFORE mutation, for an accurate audit record

        const revertedDays = oldStatus === 'APPROVED'
            ? await reverseAllConsumptionsForRequest(
                request, actor, reason ? `Cancelled: ${reason}` : 'Leave request cancelled', t,
                )
            : [];

        request.status = 'CANCELLED';
        request.decided_by = actor.id;
        request.decided_at = new Date();
        request.decision_reason = reason || (isOwner ? 'Cancelled by employee' : 'Cancelled by admin');
        await request.save({ transaction: t });

        await writeAuditLog({
            entityType: 'LEAVE_REQUEST',
            entityId: request.id,
            action: 'CANCELLED',
            performedBy: actor.id,
            oldValue: { status: oldStatus },
            newValue: { status: 'CANCELLED', revertedDays },
            reason,
            transaction: t,
        });
        
        await t.commit();

        const cancelledByEmployee = await User.findByPk(request.employee_id);
        const leaveTypeObj = await LeaveType.findByPk(request.leave_type_id, { attributes: ['name'] });
        notifyRecipientsOfCancellation(
            request, cancelledByEmployee, leaveTypeObj?.name || 'Leave', oldStatus === 'APPROVED',
        ).catch((err) => console.error('[leaveNotificationService] cancellation notification failed:', err.message))
        .finally( () => console.log("notifyRecipientsOfCancellation successful."));;

        return { request, revertedDays };
    }
    catch(err){
        await t.rollback();
        throw err;
    }
}

