import { Op } from 'sequelize';
import { DateTime } from 'luxon';
import models from '../../models/index.js';
import { ZONE } from '../../utils/attendance/istTime.js';
import { resolveAttendanceForDay } from './resolutionEngine.js';

const { User, sequelize } = models;

// How many past days this job self-heals if it hasn't run for a
// while (a weekend outage, a deploy hiccup). Deliberately bounded — a
// gap longer than this needs a manual admin override for those
// specific days, not an unbounded automatic backfill. This is a
// practical operational choice, not an attempt to define how far
// back this system's history "should" reach.
const CATCHUP_WINDOW_DAYS = 7; // 7

export async function runAttendanceResolutionJob() {
  const today = DateTime.now().setZone(ZONE).startOf('day');
  const results = { resolved: 0, skippedExisting: 0, errors: [] };

  const employees = await User.findAll({
    where: { role: { [Op.ne]: 'BOSS' }, office: { [Op.ne]: null }, isActive: true },
    attributes: ['id', 'office', 'join_date'],
  });

  for (let i = 1; i <= CATCHUP_WINDOW_DAYS; i++) {
    const targetDateStr = today.minus({ days: i }).toISODate();

    for (const employee of employees) {
      // Never resolve attendance before employee joined.
      if ( employee.join_date && targetDateStr < employee.join_date) {
        continue;
      }

      const t = await sequelize.transaction();
      try {
        const created = await resolveAttendanceForDay(employee, targetDateStr, t);
        await t.commit();

        if (created) {
          results.resolved++;
        } else {
          results.skippedExisting++;
        }
      } catch (err) {
        await t.rollback();
        console.error(`[attendanceResolutionJob] Failed for employee ${employee.id}, date ${targetDateStr}:`, err.message);
        results.errors.push({ employeeId: employee.id, date: targetDateStr, error: err.message });
        // Continue — one bad employee-day must never block everyone
        // else's correct resolution, same principle as every other
        // batch job built in this system.
      }
    }
  }

  console.log(
    `[attendanceResolutionJob] Run complete. Newly resolved: ${results.resolved}, ` +
    `already resolved (skipped): ${results.skippedExisting}, errors: ${results.errors.length}.`
  );
  return results;
}