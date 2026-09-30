import { Op } from 'sequelize';
import models from '../../models/index.js';
import { nowIST, istMomentOnDate } from '../../utils/attendance/istTime.js';

const { Attendance } = models;

// FIXED by decision, deliberately not a setting: the latest time on the
// morning after a shift day that an overnight shift can still be checked
// out manually. After this the auto-closer takes over.
export const OVERNIGHT_CUTOFF_HOUR = 6;



/**
 * The most recent shift date whose window has fully closed, meaning
 * (that date + 1 day) at the cutoff has already passed. Any shift on or
 * before it that is still open belongs to the auto-closer. This is the
 * exact complement of the overnight window, so the two never overlap
 * and never leave a gap.
 */
export function latestExpiredShiftDate(now) {
  const cutoffToday = istMomentOnDate(now.toISODate(), OVERNIGHT_CUTOFF_HOUR, 0);
  return now >= cutoffToday
    ? now.minus({ days: 1 }).toISODate()
    : now.minus({ days: 2 }).toISODate();
}


/**
 * Pure decision, no database.
 *
 *  1. Today's row, if it holds a real check-in.
 *  2. Otherwise, yesterday's row, OPEN or just-CLOSED, while it's still
 *     before today's cutoff. This is what keeps "Day complete" showing
 *     right after an overnight checkout instead of flipping back to a
 *     Check In button, and, via the check-in endpoint, is what keeps
 *     Check In hidden until 6 AM even once that shift is done.
 *     `overnight` is true only while still open (Check Out is offered);
 *     false once completed (Day complete is shown).
 *  3. Otherwise today's row if there is one, else null. `staleOpen` is
 *     then the most recent EARLIER shift left open past its cutoff.
 */

// export function chooseCurrentShift({ todayRow, yesterdayRow, olderOpenRow, now }) {
//   if (todayRow?.check_in_time) return { record: todayRow, overnight: false, staleOpen: null };

//   const cutoff = istMomentOnDate(now.toISODate(), OVERNIGHT_CUTOFF_HOUR, 0);
//   const yesterdayIsOpen = !!yesterdayRow?.check_in_time && !yesterdayRow.check_out_time;
//   if (yesterdayIsOpen && now < cutoff) {
//     return { record: yesterdayRow, overnight: true, staleOpen: null };
//   }

//   return { record: todayRow || null, overnight: false, staleOpen: olderOpenRow || null };
// }

export function chooseCurrentShift({ todayRow, yesterdayRow, olderOpenRow, now }) {
  if (todayRow?.check_in_time) {
    return { 
      record: todayRow, 
      overnight: false, 
      staleOpen: null 
    };
  }

  const cutoff = istMomentOnDate(now.toISODate(), OVERNIGHT_CUTOFF_HOUR, 0);

  const yesterdayHasCheckIn = !!yesterdayRow?.check_in_time;

  if (yesterdayHasCheckIn && now < cutoff) {
    return { 
      record: yesterdayRow, 
      overnight: !yesterdayRow.check_out_time, 
      staleOpen: null 
    };
  }

  return { 
    record: todayRow || null, 
    overnight: false, 
    staleOpen: olderOpenRow || null 
  };
}

/**
 * @param {string} employeeId
 * @param {DateTime} [now]  injectable so behaviour at any clock time can
 *                          be verified without waiting for it
 */
export async function findCurrentShift(employeeId, now = nowIST()) {
  const today = now.toISODate();
  const yesterday = now.minus({ days: 1 }).toISODate();

  const [rows, olderOpenRow] = await Promise.all([
    Attendance.findAll({
      where: { employee_id: employeeId, shift_date: { [Op.in]: [today, yesterday] } },
    }),
    Attendance.findOne({
      where: {
        employee_id: employeeId,
        shift_date: { [Op.lt]: today },
        check_in_time: { [Op.ne]: null },
        check_out_time: null,
      },
      order: [['shift_date', 'DESC']],
    }),
  ]);

  const todayRow = rows.find((r) => r.shift_date === today) || null;
  const yesterdayRow = rows.find((r) => r.shift_date === yesterday) || null;
  return chooseCurrentShift({ todayRow, yesterdayRow, olderOpenRow, now });
}