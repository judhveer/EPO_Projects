import { DateTime } from 'luxon';
import { ZONE } from '../../utils/attendance/istTime.js';

// 6 months, confirmed — named constant rather than a magic number scattered through this file.
const ELIGIBILITY_MONTHS = 6;

// Rounds to 2 decimal places (matches the DECIMAL(5,2) columns on LeavePolicy/LeaveAllocation). Standard rounding, not floor/ceil — this is a genuine, unspecified financial choice, flagged explicitly below rather than silently baked in.
function round2(n){
    return Math.round(n * 100) / 100;
}

/**
 * join_date + 6 CALENDAR months, using Luxon's .plus() — not
 * "join_date + 180 days". The two differ (February, 31-day months),
 * and "6 months" was the confirmed rule, not a day count.
 */

export function getEligibilityDate(joinDate){
    return DateTime.fromISO(joinDate, { zone: ZONE }).plus({ months: ELIGIBILITY_MONTHS });
}

/** Eligible for ANY leave in this calendar year at all (even if pro-rated)? */
export function isEligibleForYear(joinDate, leaveYear){
    const eligibilityDate = getEligibilityDate(joinDate);
    const yearEnd = DateTime.fromObject({ year: leaveYear, month: 12, day: 31 }, { zone: ZONE });
    return eligibilityDate <= yearEnd;
}

/**
 * Eligible as of RIGHT NOW (IST). Used by leave-request submission to
 * reject requests outright before the 6-month mark — per confirmed
 * requirement that requests are structurally blocked, not just
 * silently doomed to fail later at the ledger layer.
 */
export function isEligibleToday(joinDate){
    return getEligibilityDate(joinDate) <= DateTime.now().setZone(ZONE);
}

/**
 * The core calculation. For a given join_date and a given calendar
 * leave_year, how much of `annualEntitlement` should actually be
 * allocated for THAT year.
 * Pro-ration granularity note (Case C): whichever calendar month
 * eligibility falls in counts as a FULL remaining month, regardless
 * of the day within that month — e.g. eligible Sept 1 and eligible
 * Sept 30 both count "Sept, Oct, Nov, Dec" = 4 months. This matches
 * your confirmed "months remaining" phrasing rather than introducing
 * day-level fractional precision that exists nowhere else in this
 * system. If you actually want day-level precision instead, this is
 * the one function that would need to change — flagging it here
 * rather than assuming silently.
 *
 * @returns {{ eligible, allocatedAmount, isProRated, monthsCounted, eligibilityDate }}
 */
export function computeAllocationForYear(joinDate, leaveYear, annualEntitlement){
    const eligibilityDate = getEligibilityDate(joinDate);
    const yearStart = DateTime.fromObject({ year: leaveYear, month: 1, day: 1 }, { zone: ZONE });
    const yearEnd   = DateTime.fromObject({ year: leaveYear, month: 12, day: 31 }, { zone: ZONE });

    // Case A — 6-month mark hasn't arrived by the end of this year.
    if(eligibilityDate > yearEnd){
        return {
            eligible: false, allocatedAmount: 0, isProRated: false,
            monthsCounted: 0, eligibilityDate: eligibilityDate.toISODate(),
        };
    }

    // Case B — already eligible before this year began. Full year.
    if(eligibilityDate < yearStart){
        return {
            eligible: true, allocatedAmount: round2(Number(annualEntitlement)), isProRated: false,
            monthsCounted: 12, eligibilityDate: eligibilityDate.toISODate(),
        };
    }

    // Case C — crosses the 6-month mark mid-year. Pro-rate.
    const monthsRemaining = 13 - eligibilityDate.month;     // eligible in Sept (month 9) → 4 (Sept–Dec)
    const proRatedAmount = round2((Number(annualEntitlement) / 12) * monthsRemaining);


    return {
        eligible: true, allocatedAmount: proRatedAmount, isProRated: true,
        monthsCounted: monthsRemaining, eligibilityDate: eligibilityDate.toISODate(),
    };
}