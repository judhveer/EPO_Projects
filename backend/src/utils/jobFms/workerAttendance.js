import { Op } from "sequelize";
import models from "../../models/index.js";
import { nowIST } from "../attendance/istTime.js";
import { chooseCurrentShift } from "../../services/attendance/currentShiftService.js";

const { Attendance } = models;

// Only these two statuses mean "physically at work". UNRESOLVED / ABSENT /
// LEAVE / HOLIDAY / WEEK_OFF are all "not available for assignment".
const WORKING_STATUSES = new Set(["PRESENT", "LATE"]);

/**
 * Of the given employee ids, returns the Set of those who are checked in
 * RIGHT NOW (checked in, not yet checked out).
 *
 * Reuses chooseCurrentShift() from the attendance module — the same pure
 * decision the attendance screens use — so overnight MM shifts (check-in
 * yesterday, still open before the 6 AM cutoff) are handled exactly the
 * way the rest of the app already handles them. No second definition of
 * "present" is introduced here.
 *
 * One query for all ids (not one per worker). No caching on purpose —
 * attendance changes minute to minute.
 */
export async function getCheckedInIds(employeeIds, transaction) {
  if (!employeeIds || employeeIds.length === 0) return new Set();

  const now = nowIST();
  const today = now.toISODate();
  const yesterday = now.minus({ days: 1 }).toISODate();

  const rows = await Attendance.findAll({
    where: {
      employee_id: { [Op.in]: employeeIds },
      shift_date: { [Op.in]: [today, yesterday] },
    },
    attributes: ["employee_id", "shift_date", "status", "check_in_time", "check_out_time"],
    transaction,
    raw: true,
  });

  const byEmployee = new Map();
  for (const r of rows) {
    const entry = byEmployee.get(r.employee_id) || { todayRow: null, yesterdayRow: null };
    if (r.shift_date === today) entry.todayRow = r;
    else if (r.shift_date === yesterday) entry.yesterdayRow = r;
    byEmployee.set(r.employee_id, entry);
  }

  const checkedIn = new Set();
  for (const [employeeId, { todayRow, yesterdayRow }] of byEmployee) {
    const { record } = chooseCurrentShift({ todayRow, yesterdayRow, olderOpenRow: null, now });
    if (
      record &&
      record.check_in_time &&
      !record.check_out_time &&
      WORKING_STATUSES.has(record.status)
    ) {
      checkedIn.add(employeeId);
    }
  }
  return checkedIn;
}

/**
 * Backend enforcement for NEW assignments. Throws a 400 naming everyone
 * who is not checked in. Existing assignments are never touched.
 * `workers` = User instances/rows with at least { id, username }.
 */
export async function assertWorkersCheckedIn(workers, transaction) {
  if (!workers || workers.length === 0) return;

  const checkedIn = await getCheckedInIds(workers.map((w) => w.id), transaction);
  const absent = workers.filter((w) => !checkedIn.has(w.id));

  if (absent.length > 0) {
    throw Object.assign(
      new Error(
        `Not checked in: ${absent.map((w) => w.username).join(", ")}. Only checked-in workers can be assigned.`
      ),
      { statusCode: 400 }
    );
  }
}