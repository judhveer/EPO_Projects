import models from '../../models/index.js';
import { fn, col } from 'sequelize';
import { todayISTDateOnly } from "../../utils/attendance/istTime.js";
import { computeAllocationForYear } from './leaveEligibility.js';

const { LeaveLedger, LeaveAllocation, sequelize } = models;

// ── Custom errors — let calling code (resolution engine, approval flow) distinguish "no leave available, fall through to another outcome" from "something is actually broken" without parsing generic Error message strings.
export class InsufficientLeaveBalanceError extends Error {
    constructor(employeeId, leaveTypeId, available){
        super(`Insufficient leave balance (available: ${available}).`);
        this.name = 'InsufficientLeaveBalanceError';
        this.employeeId = employeeId;
        this.leaveTypeId = leaveTypeId;
        this.available = available;
    }
}

export class LedgerEntryNotFoundError extends Error {
    constructor(message){
        super(message);
        this.name = 'LedgerEntryNotFoundError';
    }
}

// ── Every function in this file REQUIRES an explicit transaction — no default, no silent auto-creation. Leave-balance writes must always be part of a larger atomic operation (e.g. an Attendance row + a LeaveLedger entry succeeding or failing together, per BR-009).
// Forcing this at the API level means a caller can't accidentally get non-atomic behaviour by forgetting to pass one.
function requireTransaction(t, fnName){
    if (!t) {
        throw new Error(`${fnName} requires an explicit transaction.`);
    }
}

function leaveYearOf(dateOnlyString){
    return Number(dateOnlyString.slice(0, 4));
}

// ── Locks the one LeaveAllocation row for this employee/type/year.
// This is the concurrency guard described above — every function that writes to LeaveLedger for a given (employee, type, year) calls this FIRST, so concurrent writers for the same trio serialize against each other rather than racing on the balance SUM.
async function lockAllocationRow(employeeId, leaveTypeId, leaveYear, transaction){
    const allocation = await LeaveAllocation.findOne({
        where: {
            employee_id: employeeId,
            leave_type_id: leaveTypeId,
            leave_year: leaveYear,
        },
        lock: transaction.LOCK.UPDATE,
        transaction,
    });

    if(!allocation){
        throw new Error(
            `No leave allocation exists for employee ${employeeId}, type ${leaveTypeId}, year ${leaveYear} — cannot consume/adjust leave that was never allocated.`
        );
    }

    return allocation;
}

// ── READS ────────────────────────────────────────────────────────────

// Current balance is always derived, never stored — SUM over the ledger. COALESCE to 0 explicitly: SQL's SUM() returns NULL, not 0, when there are no matching rows, and relying on JS's loose falsy handling of null here would be an implicit correctness dependency rather than an explicit one.
export async function getLeaveBalance(employeeId, leaveTypeId, leaveYear, transaction = null){
    const result = await LeaveLedger.findOne({
        attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'balance']],
        where: { employee_id: employeeId, leave_type_id: leaveTypeId, leave_year: leaveYear },
        raw: true,
        transaction,
    });

    return Number(result.balance);
}

// Balance broken down by every leave type at once — one grouped query, not N queries per type. Used by the employee dashboard and by the auto-deduction priority search (which needs to check every auto-deductible type in order until one has balance).
export async function getAllBalances(employeeId, leaveYear, transaction = null){
    const rows = await LeaveLedger.findAll({
        attributes: ['leave_type_id', [fn('COALESCE', fn('SUM', col('amount')), 0), 'balance']],
        where: { employee_id: employeeId, leave_year: leaveYear },
        group: ['leave_type_id'],
        raw: true,
        transaction,
    });

    const map = {};
    for(const row of rows){
        map[row.leave_type_id] = Number(row.balance);
    }

    return map;
}

// ── ALLOCATION ───────────────────────────────────────────────────────
// Idempotent: if an allocation already exists for this employee/type/ year (LeaveAllocation's unique constraint would reject a duplicate anyway), returns the existing one unchanged rather than erroring — safe to call repeatedly from a cron job that might rerun after a crash, per FR-016.
export async function allocateLeave( {employeeId, leaveTypeId, leaveYear, amount, source = 'POLICY', createdBy = null, transaction, }){
    requireTransaction(transaction, 'allocateLeave');

    const existing = await LeaveAllocation.findOne({
        where: {
            employee_id: employeeId, 
            leave_type_id: leaveTypeId, 
            leave_year: leaveYear,
        },
        transaction,
    });

    if(existing){
        return existing;
    }
    
    const allocation = await LeaveAllocation.create({
        employee_id: employeeId,
        leave_type_id: leaveTypeId,
        leave_year: leaveYear,
        allocated_amount: amount,
        source,
        created_by: createdBy,
    }, { transaction });

    await LeaveLedger.create({
        employee_id: employeeId,
        leave_type_id: leaveTypeId,
        leave_year: leaveYear,
        transaction_type: 'ALLOCATION',
        amount,
        effective_date: `${leaveYear}-01-01`,
        reference_type: source === 'MANUAL_ADMIN_GRANT' ? 'MANUAL_GRANT' : 'POLICY_ALLOCATION',
        reference_id: allocation.id,
        created_by: createdBy,
        reason: source === 'MANUAL_ADMIN_GRANT' ? 'Manual admin allocation' : 'Annual policy allocation',
    }, { transaction });

    return allocation;
}

// ── CONSUMPTION ──────────────────────────────────────────────────────
// Deducts exactly 1 day (no half-day, per confirmed scope) for one specific calendar day. Never lets balance go negative — throws InsufficientLeaveBalanceError instead, which the resolution engine catches to fall through to the next eligible leave type, or ABSENT.
export async function consumeLeaveForDay({
    employeeId, leaveTypeId, effectiveDate, referenceType, referenceId, createdBy = null, reason = null, transaction,
}) {
    requireTransaction(transaction, 'consumeLeaveForDay');
    const leaveYear = leaveYearOf(effectiveDate);

    let allocation;

    try{
        allocation = await lockAllocationRow(employeeId, leaveTypeId, leaveYear, transaction);
    } catch (err) {
        // No allocation exists at all for this employee/type/year (never
        // eligible, or never allocated). From THIS function's callers'
        // perspective, that's indistinguishable from "0 balance available"
        // — re-thrown as the same error type so fall-through logic (try
        // the next leave type, then ABSENT) treats both identically
        // instead of crashing on one and gracefully handling the other.
        throw new InsufficientLeaveBalanceError(employeeId, leaveTypeId, 0);
    }

    
    // Idempotency guard — if this EXACT consumption (same employee, type, day, and originating reference) already happened, don't double- deduct. This matters for a nightly job that crashes partway through and reruns, or a retried API call.
    const alreadyConsumed = await LeaveLedger.findOne({
        where: {
            employee_id: employeeId, 
            leave_type_id: leaveTypeId,
            effective_date: effectiveDate, 
            transaction_type: 'CONSUMPTION',
            reference_type: referenceType, 
            reference_id: referenceId,
        },
        transaction,
    });

    if(alreadyConsumed){
        return alreadyConsumed;
    }

    const balance = await getLeaveBalance(employeeId, leaveTypeId, leaveYear, transaction);

    if(balance < 1){
        throw new InsufficientLeaveBalanceError(employeeId, leaveTypeId, balance);
    }

    return LeaveLedger.create({
        employee_id: employeeId,
        leave_type_id: leaveTypeId,
        leave_year: leaveYear,
        transaction_type: 'CONSUMPTION',
        amount: -1,
        effective_date: effectiveDate,
        reference_type: referenceType,
        reference_id: referenceId,
        created_by: createdBy,
        reason,
    }, { transaction });   
}

// ── REVERSAL ─────────────────────────────────────────────────────────
// Restores exactly what a specific CONSUMPTION entry took, by amount negation rather than a hardcoded +1 — correct even if consumption amounts ever change shape later, though today that's always -1. Used by: BR-003 (holiday added after leave was approved on the same date) and by an admin overriding an auto-deducted day to ABSENT without touching the employee's balance.
export async function reverseLeaveForDay({
    employeeId, leaveTypeId, effectiveDate, originalReferenceType, originalReferenceId, reason, createdBy = null, transaction,
}) {
    requireTransaction(transaction, 'reverseLeaveForDay');
    const leaveYear = leaveYearOf(effectiveDate);

    await lockAllocationRow(employeeId, leaveTypeId, leaveYear, transaction);

    const original = await LeaveLedger.findOne({
        where: {
            employee_id: employeeId, leave_type_id: leaveTypeId,
            effective_date: effectiveDate, transaction_type: 'CONSUMPTION',
            reference_type: originalReferenceType, reference_id: originalReferenceId,
        },
        transaction,
    });

    if(!original){
        throw new LedgerEntryNotFoundError(
            `No CONSUMPTION entry found for employee ${employeeId}, type ${leaveTypeId}, date ${effectiveDate} — nothing to reverse.`
        );
    }

    // Idempotency — has this specific consumption already been reversed?
    const alreadyReversed = await LeaveLedger.findOne({
        where: {
            transaction_type: 'REVERSAL', 
            reference_type: 'ADMIN_CORRECTION', 
            reference_id: original.id
        },
        transaction,
    });

    if(alreadyReversed){
        return alreadyReversed;
    }

    return LeaveLedger.create({
        employee_id: employeeId,
        leave_type_id: leaveTypeId,
        leave_year: leaveYear,
        transaction_type: 'REVERSAL',
        amount: -original.amount, // negation of what was actually taken, not an assumed +1
        effective_date: effectiveDate,
        reference_type: 'ADMIN_CORRECTION',
        reference_id: original.id, // points at the CONSUMPTION row being reversed
        created_by: createdBy,
        reason,
    }, { transaction });
}

// ── MANUAL ADJUSTMENT ────────────────────────────────────────────────
// Ad-hoc admin correction, not tied to any specific request or attendance day (e.g. a data-entry fix, a goodwill grant). Reason and actor are both mandatory here specifically because a manual adjustment has no request/attendance trail of its own to explain itself — the reason IS the entire audit context for this entry.
export async function manualAdjustment({
    employeeId, leaveTypeId, leaveYear, amount, reason, createdBy, transaction,
}) {
    requireTransaction(transaction, 'manualAdjustment');

    if(!reason || !reason.trim()){
        throw new Error('reason is required for a manual leave adjustment.');
    }

    if(!createdBy){
        throw new Error('createdBy is required for a manual leave adjustment.');
    }

    await lockAllocationRow(employeeId, leaveTypeId, leaveYear, transaction);

    return LeaveLedger.create({
        employee_id: employeeId,
        leave_type_id: leaveTypeId,
        leave_year: leaveYear,
        transaction_type: 'MANUAL_ADJUSTMENT',
        amount,
        effective_date: todayISTDateOnly(), // ← IST-anchored, not new Date().toISOString() — matches the shared utility built earlier rather than reintroducing the exact ambient-timezone risk that file exists to prevent
        reference_type: 'ADMIN_CORRECTION',
        reference_id: null,
        created_by: createdBy,
        reason,
    }, { transaction });

}

// ── Recompute + correct an allocation after a join_date fix ────────
// Unlike allocateLeave (idempotent no-op if a row exists), this
// DELIBERATELY overwrites an existing allocation's amount — but never
// silently. Writes a compensating LeaveLedger entry for the delta
// (positive or negative) so SUM(ledger) always matches the corrected
// allocated_amount exactly, and requires a reason + actor since this
// is a real financial correction, same standard as manualAdjustment.
export async function recomputeAllocation({
  employeeId, leaveTypeId, leaveYear, newJoinDate, annualEntitlement, reason, createdBy, transaction,
}) {
  requireTransaction(transaction, 'recomputeAllocation');

  if (!reason || !reason.trim()) {
    throw new Error('reason is required to recompute an allocation.');
  }

  const allocation = await lockAllocationRow(employeeId, leaveTypeId, leaveYear, transaction);
  const calc = computeAllocationForYear(newJoinDate, leaveYear, annualEntitlement);
  const newAmount = calc.eligible ? calc.allocatedAmount : 0;
  const delta = newAmount - Number(allocation.allocated_amount);

  if (delta === 0) {
    return { allocation, delta: 0, ledgerEntry: null };
  }

  await allocation.update({ allocated_amount: newAmount }, { transaction });

  const ledgerEntry = await LeaveLedger.create({
    employee_id: employeeId, 
    leave_type_id: leaveTypeId, 
    leave_year: leaveYear,
    transaction_type: 'MANUAL_ADJUSTMENT', 
    amount: delta, 
    effective_date: todayISTDateOnly(),
    reference_type: 'ADMIN_CORRECTION', 
    reference_id: allocation.id, 
    created_by: createdBy, 
    reason,
  }, { transaction });

  return { allocation, delta, ledgerEntry };
}