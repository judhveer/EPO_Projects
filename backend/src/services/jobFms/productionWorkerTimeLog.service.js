import db from "../../models/index.js";
import { Op } from "sequelize";

/**
 * Time-log bookkeeping for production workers (JobProductionWorkerTimeLog).
 *
 * Every function takes the caller's transaction: the log changes commit or roll back
 * together with the status change of the assignment. The caller must already hold the
 * assignment row lock (lock order: assignment rows -> time-log rows).
 */

const secondsBetween = (start, end) =>
  Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));

/**
 * Opens a new run for an assignment (worker pressed START or RESUME).
 * If an open run already exists (should never happen) it is closed with 0 seconds
 * instead of guessing its end, so a bad row can never inflate the total time.
 */
export async function openWorkerLog(assignment, startTime, transaction) {
  const { JobProductionWorkerTimeLog: Log } = db;

  const stale = await Log.findAll({
    where: { assignment_id: assignment.id, end_time: null },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  for (const log of stale) {
    await log.update(
      {
        end_time: log.start_time,
        duration_seconds: 0,
        end_reason: "orphan_closed",
      },
      { transaction },
    );
  }

  return Log.create(
    {
      assignment_id: assignment.id,
      job_no: assignment.job_no,
      worker_id: assignment.worker_id,
      stage_name: assignment.stage_name,
      start_time: startTime,
    },
    { transaction },
  );
}

/**
 * Closes every open run of the given assignments.
 *   endAt  : Date, or (startTime: Date) => Date for per-run clamping
 *   reason : end_reason value
 * The end is never earlier than the run's own start (duration is never negative).
 * Returns Map<assignment_id, Date> with the end time actually written.
 */
export async function closeOpenWorkerLogs(
  assignmentIds,
  { endAt, reason, transaction },
) {
  const ended = new Map();
  if (!assignmentIds?.length) return ended;

  const { JobProductionWorkerTimeLog: Log } = db;

  const open = await Log.findAll({
    where: { assignment_id: { [Op.in]: assignmentIds }, end_time: null },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  for (const log of open) {
    const start = new Date(log.start_time);
    let end = typeof endAt === "function" ? endAt(start) : new Date(endAt);
    if (Number.isNaN(end.getTime()) || end < start) end = start;

    await log.update(
      {
        end_time: end,
        duration_seconds: secondsBetween(start, end),
        end_reason: reason,
      },
      { transaction },
    );
    ended.set(log.assignment_id, end);
  }
  return ended;
}