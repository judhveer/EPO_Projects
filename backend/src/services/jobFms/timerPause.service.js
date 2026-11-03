import db from "../../models/index.js";
import { closeOpenWorkerLogs } from "./productionWorkerTimeLog.service.js";

const { JobAssignment, JobDesignTime, JobProductionStageWorker, ActivityLog } = db;

const REMARK = "Auto-paused at check-out";

// trigger -> label written in the designer ActivityLog
const DESIGNER_ACTION = {
  check_out: "Designer Auto-Pause (Check-out)",
  auto_checkout: "Designer Auto-Pause (Auto Check-out)",
  sweep: "Designer Auto-Pause (Safety Sweep)",
};

// trigger -> end_reason written in the production worker time log
const WORKER_END_REASON = {
  check_out: "auto_paused_checkout",
  auto_checkout: "auto_paused_auto_checkout",
  sweep: "auto_paused_sweep",
};

/**
 * Decides the moment a running timer is stopped.
 *   - pauseAt given  -> that moment (e.g. check-out time written in attendance)
 *   - never later than "now"
 *   - never earlier than the moment the current run started (so duration is never negative;
 *     a timer that started AFTER the check-out time is stopped at its own start = 0 seconds)
 */
function resolvePauseTime(pauseAt, runStart, now) {
  let t = pauseAt ? new Date(pauseAt) : now;
  if (Number.isNaN(t.getTime()) || t > now) t = now;
  if (runStart && t < runStart) t = runStart;
  return t;
}

// ── Designer: running = JobAssignment in_progress and not paused ───────────────
// Same bookkeeping as designerPauseTask: close the open JobDesignTime log, add its
// seconds to designer_duration_seconds, set is_paused. Lock order: assignment -> time log.
async function pauseDesignerTimers(userId, pauseAt, trigger) {
  const where = { designer_id: userId, status: "in_progress", is_paused: false };

  // Cheap pre-check outside a transaction: most users have nothing running.
  if ((await JobAssignment.count({ where })) === 0) return [];

  const t = await db.sequelize.transaction();
  try {
    const now = new Date();
    const running = await JobAssignment.findAll({
      where,
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    const pausedJobs = [];
    for (const assignment of running) {
      const openLogs = await JobDesignTime.findAll({
        where: { assignment_id: assignment.id, end_time: null },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      let addedSeconds = 0;
      let pausedAt = now;
      for (const log of openLogs) {
        const start = new Date(log.start_time);
        const end = resolvePauseTime(pauseAt, start, now);
        const secs = Math.max(0, Math.round((end - start) / 1000));
        log.end_time = end;
        log.duration_seconds = secs;
        await log.save({ transaction: t });
        addedSeconds += secs;
        pausedAt = end;
      }

      assignment.designer_duration_seconds =
        (assignment.designer_duration_seconds || 0) + addedSeconds;
      assignment.is_paused = true;
      await assignment.save({ transaction: t });

      await ActivityLog.create(
        {
          job_no: assignment.job_no,
          performed_by_id: userId,
          action: DESIGNER_ACTION[trigger] || DESIGNER_ACTION.check_out,
          meta: {
            trigger,
            remark: REMARK,
            paused_at: pausedAt.toISOString(),
            seconds_counted: addedSeconds,
          },
        },
        { transaction: t },
      );

      pausedJobs.push(assignment.job_no);
    }

    await t.commit();
    return pausedJobs;
  } catch (err) {
    if (!t.finished) await t.rollback().catch(() => {});
    throw err;
  }
}

// ── Production worker: running = JobProductionStageWorker in_progress ──────────
// Same bookkeeping as pauseAssignment: status -> paused, paused_at set, and the open
// time-log run is closed at that same moment. The pause duration is added to
// total_pause_duration_seconds later, on resume.
// Exact run start = start_time of the open time-log. Rows that were already running
// before the time-log table existed have no open log; for them the later of
// started_at / updated_at is the best approximation of the run start.
async function pauseWorkerTimers(userId, pauseAt, trigger) {
  const where = { worker_id: userId, status: "in_progress" };

  if ((await JobProductionStageWorker.count({ where })) === 0) return [];

  const t = await db.sequelize.transaction();
  try {
    const now = new Date();
    const running = await JobProductionStageWorker.findAll({
      where,
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    // Close every open run at the clamped pause moment (never before the run's own start).
    const endedByAssignment = await closeOpenWorkerLogs(
      running.map((a) => a.id),
      {
        endAt: (runStart) => resolvePauseTime(pauseAt, runStart, now),
        reason: WORKER_END_REASON[trigger] || WORKER_END_REASON.check_out,
        transaction: t,
      },
    );

    const pausedJobs = [];
    for (const assignment of running) {
      let pausedAt = endedByAssignment.get(assignment.id);

      if (!pausedAt) {
        // Legacy row: no open log -> approximate the run start.
        const candidates = [assignment.started_at, assignment.updatedAt]
          .filter(Boolean)
          .map((d) => new Date(d));
        const runStart = candidates.length
          ? new Date(Math.max(...candidates.map((d) => d.getTime())))
          : null;
        pausedAt = resolvePauseTime(pauseAt, runStart, now);
      }

      await assignment.update(
        { status: "paused", paused_at: pausedAt },
        { transaction: t },
      );
      pausedJobs.push(assignment.job_no);
    }

    await t.commit();
    return pausedJobs;
  } catch (err) {
    if (!t.finished) await t.rollback().catch(() => {});
    throw err;
  }
}

/**
 * Pauses every running design / production timer of one user.
 * NEVER throws: a failure here must never block a check-out. Errors are logged and
 * reported through `failed: true`.
 *
 * @param {string} userId
 * @param {{ pauseAt?: Date|null, trigger?: "check_out"|"auto_checkout"|"sweep" }} options
 *        pauseAt  moment to stop the timers (default: now)
 * @returns {Promise<{designer:number, worker:number, failed:boolean}>}
 */
export async function pauseRunningTimersForUser( userId, { pauseAt = null, trigger = "check_out" } = {}, ) {
  const result = { designer: 0, worker: 0, failed: false };
  if (!userId) return result;

  try {
    result.designer = (await pauseDesignerTimers(userId, pauseAt, trigger)).length;
  } catch (err) {
    result.failed = true;
    console.error(`[timerPause] designer pause failed for ${userId}:`, err.message);
  }

  try {
    result.worker = (await pauseWorkerTimers(userId, pauseAt, trigger)).length;
  } catch (err) {
    result.failed = true;
    console.error(`[timerPause] worker pause failed for ${userId}:`, err.message);
  }

  if (result.designer || result.worker) {
    console.log(
      `[timerPause] ${trigger}: paused ${result.designer} design job(s), ${result.worker} production assignment(s) for ${userId}`,
    );
  }
  return result;
}