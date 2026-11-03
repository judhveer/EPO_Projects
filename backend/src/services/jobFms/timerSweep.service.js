import { Op, fn, col } from "sequelize";
import db from "../../models/index.js";
import { getCheckedInIds } from "../../utils/jobFms/workerAttendance.js";
import { pauseRunningTimersForUser } from "./timerPause.service.js";

const {
  JobAssignment,
  JobProductionStageWorker,
  JobProductionWorkerTimeLog,
  Attendance,
} = db;

/**
 * Safety net for the check-out auto-pause.
 *
 * Finds users whose design / production timer is still running although they are not
 * checked in, and pauses it with the same code path as a check-out:
 *   pause moment = the user's latest recorded check_out_time (never before the timer's own
 *   start). A user who never checked out/in gets the timer's own start = 0 seconds.
 *
 * Users who still have an OPEN shift row are skipped on purpose: either they are in a shift
 * the attendance module treats as stale (the auto-closer is about to close it and will pause
 * with the correct derived check-out), or HR changed the status of an open shift. Neither is
 * the sweep's call to make. Once the auto-closer has closed the shift, a later sweep run
 * picks up any timer that is still running.
 *
 * Also closes worker time-log runs left open on assignments that are no longer in_progress.
 * That should never happen; if it does it is logged so it gets noticed.
 */
export async function runTimerSweep() {
  const summary = {
    candidates: 0,
    swept: 0,
    skippedOpenShift: 0,
    failed: 0,
    orphanLogsClosed: 0,
  };

  // 1. Everyone with a running timer
  const [designerRows, workerRows] = await Promise.all([
    JobAssignment.findAll({
      attributes: ["designer_id"],
      where: { status: "in_progress", is_paused: false },
      group: ["designer_id"],
      raw: true,
    }),
    JobProductionStageWorker.findAll({
      attributes: ["worker_id"],
      where: { status: "in_progress" },
      group: ["worker_id"],
      raw: true,
    }),
  ]);

  const userIds = new Set();
  for (const r of designerRows) if (r.designer_id) userIds.add(r.designer_id);
  for (const r of workerRows) if (r.worker_id) userIds.add(r.worker_id);
  summary.candidates = userIds.size;

  if (userIds.size > 0) {
    // 2. Of those, who is NOT checked in right now (same rule as the assignment guard)
    const checkedIn = await getCheckedInIds([...userIds]);
    const notCheckedIn = [...userIds].filter((id) => !checkedIn.has(id));

    if (notCheckedIn.length > 0) {
      // 3. Leave users with an open shift row to the auto-closer / HR
      const openShiftRows = await Attendance.unscoped().findAll({
        attributes: ["employee_id"],
        where: {
          employee_id: { [Op.in]: notCheckedIn },
          check_in_time: { [Op.ne]: null },
          check_out_time: null,
        },
        group: ["employee_id"],
        raw: true,
      });
      const hasOpenShift = new Set(openShiftRows.map((r) => r.employee_id));
      const toSweep = notCheckedIn.filter((id) => !hasOpenShift.has(id));
      summary.skippedOpenShift = notCheckedIn.length - toSweep.length;

      // 4. Latest check-out per user
      const lastOutRows = toSweep.length
        ? await Attendance.unscoped().findAll({
            attributes: ["employee_id", [fn("MAX", col("check_out_time")), "last_out"]],
            where: {
              employee_id: { [Op.in]: toSweep },
              check_out_time: { [Op.ne]: null },
            },
            group: ["employee_id"],
            raw: true,
          })
        : [];
      const lastOut = new Map(lastOutRows.map((r) => [r.employee_id, r.last_out]));

      // 5. Pause. pauseRunningTimersForUser never throws; `failed` is reported.
      for (const userId of toSweep) {
        const last = lastOut.get(userId);
        // new Date(0) = "never checked out" -> clamped up to the timer's own start (0 seconds)
        const pauseAt = last ? new Date(last) : new Date(0);
        const r = await pauseRunningTimersForUser(userId, { pauseAt, trigger: "sweep" });
        if (r.failed) summary.failed += 1;
        if (r.designer || r.worker) summary.swept += 1;
      }
    }
  }

  // 6. Orphan worker time-log runs (open run, but the assignment is not in_progress)
  try {
    const openLogs = await JobProductionWorkerTimeLog.findAll({
      attributes: ["id", "assignment_id", "start_time"],
      where: { end_time: null },
      raw: true,
    });
    if (openLogs.length > 0) {
      const assignmentIds = [...new Set(openLogs.map((l) => l.assignment_id))];
      const running = await JobProductionStageWorker.findAll({
        attributes: ["id"],
        where: { id: { [Op.in]: assignmentIds }, status: "in_progress" },
        raw: true,
      });
      const runningIds = new Set(running.map((a) => a.id));

      for (const log of openLogs) {
        if (runningIds.has(log.assignment_id)) continue;
        await JobProductionWorkerTimeLog.update(
          { end_time: log.start_time, duration_seconds: 0, end_reason: "orphan_closed" },
          { where: { id: log.id, end_time: null } },
        );
        summary.orphanLogsClosed += 1;
      }
    }
  } catch (err) {
    console.error("[timerSweep] orphan log cleanup failed:", err.message);
  }

  return summary;
}