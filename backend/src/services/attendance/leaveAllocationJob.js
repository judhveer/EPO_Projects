import models from "../../models/index.js";
import { Op } from 'sequelize';
import { todayISTDateOnly } from '../../utils/attendance/istTime.js';
import { computeAllocationForYear } from './leaveEligibility.js';
import { allocateLeave } from './leaveLedgerService.js';

const { User, LeaveType, LeavePolicy, sequelize } = models;

/**
 * Ensures every trackable, eligible employee has a LeaveAllocation for
 * the CURRENT leave year, for every actively-policy-governed leave type.
 *
 * Deliberately designed to run DAILY, not just once on Jan 1 — one job
 * naturally covers three cases without separate triggers:
 *   1. Jan 1 rollover — every continuing employee gets their fresh
 *      annual allocation the first time this runs on/after Jan 1.
 *   2. New employees crossing their 6-month mark mid-year — the day
 *      they become eligible, the next run creates their pro-rated
 *      allocation for the current year.
 *   3. Catch-up after downtime — if the job didn't run for a stretch
 *      of days, the next run backfills whatever's still missing for
 *      the CURRENT year only. Deliberately never backfills PAST years
 *      — this system has no leave history before it existed, so
 *      there's nothing genuine to retroactively create.
 *
 * Idempotent at every level: allocateLeave() no-ops if an allocation
 * already exists, and every employee×type pair is its own transaction
 * — one failure never rolls back, or blocks, anyone else.
 */
export async function runLeaveAllocationJob(){
    const todayStr = todayISTDateOnly();
    const currentYear = Number(todayStr.slice(0, 4));

    const results = { allocated: [], alreadyAllocated: 0, skippedIneligible: 0, errors: [] };

    // ── Active leave types with an active policy. No policy = no defined entitlement amount = nothing to auto-allocate for it (a type with no active policy is expected to be manual-grant-only).
    const activeTypesWithPolicy = await LeaveType.findAll({
        where: { 
            active: true 
        },
        attributes: ["id", "name"],
        include: [{ 
            model: LeavePolicy, 
            as: 'policies', 
            attributes: ["annual_entitlement"],
            where: { 
                active: true 
            }, 
            required: true 
        }],
    });

    if(activeTypesWithPolicy.length === 0){
        console.log('[leaveAllocationJob] No active leave types with an active policy — nothing to allocate.');
        return results;
    }

    // ── Trackable employees — MUST match assertTrackable's exact definition (role != BOSS, office assigned, active). Any drift between these two definitions anywhere in the codebase would create a confusing state: someone who can check in but never gets leave allocated, or the reverse.

    const employees = await User.findAll({
        where: {
            role: { [Op.ne]: 'BOSS' },
            office: { [Op.ne]: null },
            isActive: true,
            join_date: { [Op.ne]: null }, // defensive — should always be set for non-BOSS per the model hook, but a job touching money-adjacent data shouldn't blindly trust that
        },
        attributes: ["id", "username", "join_date"],
    });

    for(const employee of employees){
        for (const leaveType of activeTypesWithPolicy){
            // Your system expects one active policy per leave type.
            const policy = leaveType.policies[0];
            if (!policy) {
                continue;
            }

            const calc = computeAllocationForYear(employee.join_date, currentYear, policy.annual_entitlement);
            // Employee has not reached eligibility yet
            if(!calc.eligible){
                results.skippedIneligible++;
                continue;
            }

            const t = await sequelize.transaction();
            try{
                const { allocation, created } = await allocateLeave({
                    employeeId: employee.id,
                    leaveTypeId: leaveType.id,
                    leaveYear: currentYear,
                    amount: calc.allocatedAmount,
                    source: 'POLICY',
                    createdBy: null, // system-generated, not an admin action
                    transaction: t,
                });
                await t.commit();
                if (created){
                    results.allocated.push({
                        employeeId: employee.id,
                        employeeName: employee.username,
                        leaveTypeId: leaveType.id,
                        leaveTypeName: leaveType.name,
                        amount: calc.allocatedAmount,
                        isProRated: calc.isProRated,
                        allocationId: allocation.id,
                    });
                }
                else{
                    results.alreadyAllocated++;
                }

            }
            catch(err){
                await t.rollback();
                console.error(`[leaveAllocationJob] Failed for employee ${employee.id}, type ${leaveType.id}:`, err.message);
                results.errors.push({
                    employeeId: employee.id,
                    employeeName: employee.username,
                    leaveTypeId: leaveType.id,
                    leaveTypeName: leaveType.name,
                    error: err.message,
                });
                // Deliberately continue rather than abort the whole run — one bad row must never block everyone else's correctly-eligible allocation.
            }

        }
    }

    console.log(
        `[leaveAllocationJob] Run complete for ${currentYear}. ` +
        `New allocations: ${results.allocated.length}, not yet eligible: ${results.skippedIneligible}, errors: ${results.errors.length}.`
    );

    return results;
}
