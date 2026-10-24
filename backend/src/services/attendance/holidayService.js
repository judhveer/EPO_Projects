import { Op, UniqueConstraintError } from 'sequelize';
import models from '../../models/index.js';
import { OFFICES, DEPARTMENTS } from '../../models/salesPipelineModels/User.model.js';
import { HOLIDAY_SCOPE_TYPES } from '../../models/attendanceModels/holidayApplicability.model.js';
import { reverseLeaveForDay } from './leaveLedgerService.js';
import { writeAuditLog } from './auditLogService.js';
import { yearRangeIST } from '../../utils/attendance/istTime.js';

const { User, Holiday, HolidayApplicability, Attendance, LeaveLedger, sequelize } = models;

const badRequest = (message) => Object.assign(new Error(message), { statusCode: 400 });

// Given a set of applicability rows about to be attached to a new
// Holiday, finds every trackable employee they'd actually cover —
// the inverse of isHolidayForEmployee (that answers "does this holiday
// apply to THIS one person"; this answers "who does this holiday apply
// to, across everyone").
async function findAffectedEmployeeIds(applicabilityRows, transaction) {
  if (applicabilityRows.some((a) => a.scope_type === 'ALL')) {
    const all = await User.findAll({
      where: { role: { [Op.ne]: 'BOSS' }, office: { [Op.ne]: null }, isActive: true },
      attributes: ['id'], transaction,
    });
    return new Set(all.map((u) => u.id));
  }

  const officeValues = applicabilityRows.filter((a) => a.scope_type === 'OFFICE').map((a) => a.scope_ref_id);
  const deptValues   = applicabilityRows.filter((a) => a.scope_type === 'DEPARTMENT').map((a) => a.scope_ref_id);
  const individualIds = applicabilityRows.filter((a) => a.scope_type === 'INDIVIDUAL').map((a) => a.scope_ref_id);

  const orConditions = [];
  if (officeValues.length) orConditions.push({ office: { [Op.in]: officeValues } });
  if (deptValues.length) orConditions.push({ department: { [Op.in]: deptValues } });
  if (individualIds.length) orConditions.push({ id: { [Op.in]: individualIds } });
  if (orConditions.length === 0) return new Set();

  const matched = await User.findAll({
    where: { [Op.or]: orConditions, role: { [Op.ne]: 'BOSS' }, isActive: true },
    attributes: ['id'], transaction,
  });
  return new Set(matched.map((u) => u.id));
}

// Validates the shape of every scope row and returns a de-duplicated copy
// (same scope added twice => stored once). INDIVIDUAL ids are checked
// against the User table: each must be an existing, active, non-BOSS user
// with an office — exactly the people the attendance system tracks, and
// exactly the set the Holiday Master user picker offers. Without this a
// mistyped / stale / BOSS / inactive id would save "successfully" and
// then apply to nobody.

async function validateAndNormalizeApplicability(applicability) {
  if (!Array.isArray(applicability) || applicability.length === 0) {
    throw badRequest('At least one applicability scope is required — a holiday with no scope would apply to nobody.');
  }

  const seen = new Set();
  const normalized = [];

  for (const a of applicability) {
    if (!a || typeof a !== 'object') {
      throw badRequest('Invalid applicability entry.');
    }
    if (!HOLIDAY_SCOPE_TYPES.includes(a.scope_type)) {
      throw badRequest(`Invalid scope_type: ${a.scope_type}`);
    }
    if (a.scope_type === 'OFFICE' && !OFFICES.includes(a.scope_ref_id)) {
      throw badRequest(`Invalid office: ${a.scope_ref_id}`);
    }
    if (a.scope_type === 'DEPARTMENT' && !DEPARTMENTS.includes(a.scope_ref_id)) {
      throw badRequest(`Invalid department: ${a.scope_ref_id}`);
    }
    if (a.scope_type === 'INDIVIDUAL' && (typeof a.scope_ref_id !== 'string' || !a.scope_ref_id.trim())) {
      throw badRequest('INDIVIDUAL scope requires a user id.');
    }

    const ref = a.scope_type === 'ALL' ? null : a.scope_ref_id;
    const key = `${a.scope_type}:${ref ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push({ scope_type: a.scope_type, scope_ref_id: ref });
  }

  const individualIds = normalized.filter((a) => a.scope_type === 'INDIVIDUAL').map((a) => a.scope_ref_id);
  if (individualIds.length > 0) {
    const found = await User.findAll({
      where: {
        id: { [Op.in]: individualIds },
        role: { [Op.ne]: 'BOSS' },
        office: { [Op.ne]: null },
        isActive: true,
      },
      attributes: ['id'],
    });
    const foundIds = new Set(found.map((u) => u.id));
    const invalid = individualIds.filter((id) => !foundIds.has(id));
    if (invalid.length > 0) {
      throw badRequest(
        `Cannot apply holiday to ${invalid.length} user(s) that do not exist or are not eligible (inactive, BOSS, or no office assigned): ${invalid.join(', ')}`,
      );
    }
  }

  return normalized;
}

// ── CREATE — validates, creates the holiday + its scope rows, and
// performs the BR-003 collision check (approved LEAVE -> HOLIDAY, and
// no-check-in ABSENT -> HOLIDAY) in the SAME transaction so the
// holiday can never exist in a state where colliding leave hasn't yet
// been reversed, even for a moment.
export async function createHoliday({ name, date, holidayType, notes, applicability, createdBy }) {
  const scopes = await validateAndNormalizeApplicability(applicability);

  const t = await sequelize.transaction();
  try {
    const holiday = await Holiday.create({
      name, date, holiday_type: holidayType || 'MANDATORY', notes: notes || null, created_by: createdBy,
    }, { transaction: t });

    const applicabilityRows = await HolidayApplicability.bulkCreate(
      scopes.map((a) => ({ holiday_id: holiday.id, scope_type: a.scope_type, scope_ref_id: a.scope_ref_id })),
      { transaction: t },
    );

    // ── BR-003: retroactive collision check ─────────────────────────
    const affectedEmployeeIds = await findAffectedEmployeeIds(applicabilityRows, t);
    const reversedFor = [];
    // Days the nightly job (or an earlier moment) already wrote as ABSENT
    // because this holiday did not exist yet — typically an employee with
    // no leave balance left. They are reclassified to HOLIDAY here, in the
    // same transaction. Recorded with the old status in the audit entry.
    const absentConvertedFor = [];
    // ABSENT rows HR corrected by hand (is_manual_override) are a human
    // decision — left alone, but reported so nothing is silent.
    const skippedManualOverride = [];

    for (const employeeId of affectedEmployeeIds) {
      const attendanceRow = await Attendance.findOne({
        where: { employee_id: employeeId, shift_date: date, status: { [Op.in]: ['LEAVE', 'ABSENT'] } },
        transaction: t, lock: t.LOCK.UPDATE,
      });
      // No row => nothing to correct (a row is never invented here).
      // A row WITH a check-in means the person actually worked: never
      // touched, whatever its status says.
      if (!attendanceRow || attendanceRow.check_in_time) continue;

      if (attendanceRow.status === 'ABSENT') {
        if (attendanceRow.is_manual_override) {
          skippedManualOverride.push(employeeId);
          continue;
        }
        await attendanceRow.update({ status: 'HOLIDAY' }, { transaction: t });
        absentConvertedFor.push({ employeeId, from: 'ABSENT' });
        continue;
      }

      // status === 'LEAVE' — BR-003 path, unchanged.
      const consumption = await LeaveLedger.findOne({
        where: { employee_id: employeeId, effective_date: date, transaction_type: 'CONSUMPTION' },
        transaction: t,
      });
      // LEAVE status with no matching consumption entry is an
      // inconsistent state this function didn't create — skip rather
      // than guess at fixing something it doesn't understand.
      if (!consumption) continue;

      await reverseLeaveForDay({
        employeeId,
        leaveTypeId: consumption.leave_type_id,
        effectiveDate: date,
        originalReferenceType: consumption.reference_type,
        originalReferenceId: consumption.reference_id,
        reason: `Holiday "${name}" added for this date — leave consumption auto-reversed per BR-003.`,
        createdBy,
        transaction: t,
      });

      await attendanceRow.update({ status: 'HOLIDAY' }, { transaction: t });
      // Deliberately KEEPING leave_request_id here, unlike reject/cancel
      // (which clear it). Reject/cancel undo a mistaken or withdrawn
      // request — the link should disappear. This reversal undoes
      // nothing wrong; the leave was legitimately approved and is being
      // correctly reclassified because a holiday now exists on the same
      // date. Keeping the link preserves that "this day was originally
      // approved leave" history for audit rather than erasing it.
      reversedFor.push(employeeId);
    }

    await writeAuditLog({
      entityType: 'HOLIDAY',
      entityId: holiday.id,
      action: 'CREATED',
      performedBy: createdBy,
      oldValue: null,
      newValue: { name, date, holiday_type: holiday.holiday_type, applicability: scopes, reversedFor, absentConvertedFor, skippedManualOverride },
      reason: notes || null,
      transaction: t,
    });

    await t.commit();
    return { holiday, applicability: applicabilityRows, reversedFor, absentConvertedFor, skippedManualOverride };
  } catch (err) {
    await t.rollback();

    if (err instanceof UniqueConstraintError) {
      throw Object.assign(
        new Error(`Holiday "${name}" already exists on ${date}.`),
        { statusCode: 409 }
      );
    }

    throw err;
  }
}


export async function listHolidays({ activeOnly = true, year = null } = {}) {
  const where = {};
  if (activeOnly) where.active = true;
  if (year) {
    const { start, end } = yearRangeIST(year);
    where.date = { [Op.between]: [start, end] }; // ← was Op.like
  }
  return Holiday.findAll({
    where,
    include: [{
      model: HolidayApplicability,
      as: 'applicability'
    }],
    order: [['date', 'ASC']],
  });
}

// Deactivation only — no "edit applicability" operation. Changing
// scope after creation would need to re-run collision logic in both
// directions (newly-covered employees AND no-longer-covered ones,
// who might need their reversal un-done), which is meaningfully more
// complex than it's worth. To change scope: deactivate, create a new
// one. Simpler, and never leaves a half-migrated collision state.
export async function deactivateHoliday(holidayId, actorId = null) {
  const holiday = await Holiday.findByPk(holidayId);
  if (!holiday) throw Object.assign(new Error('Holiday not found.'), { statusCode: 404 });
  holiday.active = false;
  await holiday.save();

  await writeAuditLog({
    entityType: 'HOLIDAY',
    entityId: holiday.id,
    action: 'DEACTIVATED',
    performedBy: actorId,
    oldValue: { active: true },
    newValue: { active: false },
    transaction: null, // no other write happening alongside this one — a standalone audit entry is fine outside a transaction here
  });


  return holiday;
  // Deliberately not reverting anything already caused by this holiday
  // while it was active — deactivating going forward must never
  // rewrite what already, correctly, happened on past dates.
}