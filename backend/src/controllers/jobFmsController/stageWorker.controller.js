import db from "../../models/index.js";
import { Op } from "sequelize";

import { sendPushToDepartment } from  "../../utils/pushNotification.js";

const WORKER_DEPT = "Production Worker";

function ensureWorkerRole(req) {
  if (!req.user || req.user.department !== WORKER_DEPT) {
    const e = new Error("Not authorized. Production Worker access only.");
    e.statusCode = 403;
    throw e;
  }
}

/**
 * Auto-pauses any other in_progress assignments for this worker.
 * Called before startAssignment and resumeAssignment.
 * Returns how many were auto-paused (for response info).
 */
async function autoPauseOtherAssignments(workerId, excludeId, t) {
  const now = new Date();

  const others = await db.JobProductionStageWorker.findAll({
    where: {
      worker_id: workerId,
      status: "in_progress",
      id: { [Op.ne]: excludeId },
    },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  for (const a of others) {
    await a.update(
      {
        status: "paused",
        paused_at: now,
      },
      { transaction: t }
    );
  }

  return others.length;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/fms/worker/assignments
 * Returns all active assignments for the logged-in worker.
 * Active = assigned, in_progress, paused.
 * Completed/cancelled assignments are excluded — they vanish from dashboard.
 */
export const getMyAssignments = async (req, res) => {
  try {
    ensureWorkerRole(req);

    const assignments = await db.JobProductionStageWorker.findAll({
      where: {
        worker_id: req.user.id,
        status: { [Op.in]: ["assigned", "in_progress", "paused"] },
      },
      include: [
        {
          model: db.JobCard,
          as: "jobCard",
          attributes: [
            "job_no",
            "client_name",
            "delivery_date",
            "task_priority",
          ],
        },
      ],
      order: [
        // in_progress first (active work), then paused, then assigned (not started)
        [
          db.sequelize.literal(
            "FIELD(JobProductionStageWorker.status, 'in_progress', 'paused', 'assigned')"
          ),
          "ASC",
        ],
        ["created_at", "ASC"],
      ],
    });

    return res.json(assignments);
  } catch (err) {
    return res
      .status(err.statusCode || 500)
      .json({ message: err.message || "Failed to fetch assignments." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/fms/worker/assignments/:id/start
 * Allowed from: assigned
 * Transitions to: in_progress
 * Side effect: auto-pauses any other in_progress assignment for this worker
 */
export const startAssignment = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    ensureWorkerRole(req);

    const assignment = await db.JobProductionStageWorker.findOne({
      where: { 
        id: req.params.id, 
        worker_id: req.user.id 
      },
        transaction: t,
        lock: t.LOCK.UPDATE,
    });

    if (!assignment) {
      throw Object.assign(new Error("Assignment not found."), {
        statusCode: 404,
      });
    }
    if (assignment.status !== "assigned") {
      throw Object.assign(
        new Error(
          `Cannot start — current status is '${assignment.status}'. Only 'assigned' jobs can be started.`
        ),
        { statusCode: 400 }
      );
    }

    // Auto-pause any currently in_progress assignment before starting this one
    const autoPausedCount = await autoPauseOtherAssignments(
      req.user.id,
      assignment.id,
      t
    );

    await assignment.update(
      {
        status: "in_progress",
        started_at: new Date(),
      },
      { transaction: t }
    );

    await t.commit();
    return res.json({
      message: "Assignment started.",
      auto_paused_count: autoPausedCount,
      assignment,
    });
  } catch (err) {
    await t.rollback().catch(() => {});
    return res
      .status(err.statusCode || 500)
      .json({ message: err.message || "Failed to start assignment." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/fms/worker/assignments/:id/pause
 * Allowed from: in_progress
 * Transitions to: paused
 * Records paused_at timestamp. Pause duration will be accumulated on resume.
 */
export const pauseAssignment = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    ensureWorkerRole(req);

    const assignment = await db.JobProductionStageWorker.findOne({
      where: { 
        id: req.params.id, 
        worker_id: req.user.id 
      },
        transaction: t,
        lock: t.LOCK.UPDATE,
    });

    if (!assignment) {
      throw Object.assign(new Error("Assignment not found."), {
        statusCode: 404,
      });
    }
    if (assignment.status !== "in_progress") {
      throw Object.assign(
        new Error(
          `Cannot pause — current status is '${assignment.status}'. Only 'in_progress' assignments can be paused.`
        ),
        { statusCode: 400 }
      );
    }

    await assignment.update(
      {
        status: "paused",
        paused_at: new Date(),
      },
      { transaction: t }
    );

    await t.commit();
    return res.json({
      message: "Assignment paused.",
      assignment,
    });
  } catch (err) {
    await t.rollback().catch(() => {});
    return res
      .status(err.statusCode || 500)
      .json({ message: err.message || "Failed to pause assignment." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/fms/worker/assignments/:id/resume
 * Allowed from: paused
 * Transitions to: in_progress
 * Accumulates the current pause duration into total_pause_duration_seconds.
 * Side effect: auto-pauses any other in_progress assignment for this worker.
 */
export const resumeAssignment = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    ensureWorkerRole(req);

    const assignment = await db.JobProductionStageWorker.findOne({
      where: { 
        id: req.params.id, 
        worker_id: req.user.id 
    },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!assignment) {
      throw Object.assign(new Error("Assignment not found."), {
        statusCode: 404,
      });
    }
    if (assignment.status !== "paused") {
      throw Object.assign(
        new Error(
          `Cannot resume — current status is '${assignment.status}'. Only 'paused' assignments can be resumed.`
        ),
        { statusCode: 400 }
      );
    }

    const now = new Date();

    // Accumulate the duration of this pause cycle
    let additionalPauseSecs = 0;
    if (assignment.paused_at) {
      additionalPauseSecs = Math.floor(
        (now.getTime() - new Date(assignment.paused_at).getTime()) / 1000
      );
    }

    // Auto-pause any currently in_progress assignment before resuming this one
    const autoPausedCount = await autoPauseOtherAssignments(
      req.user.id,
      assignment.id,
      t
    );

    await assignment.update(
      {
        status: "in_progress",
        paused_at: null,
        total_pause_duration_seconds:
          assignment.total_pause_duration_seconds + additionalPauseSecs,
      },
      { transaction: t }
    );

    await t.commit();
    return res.json({
      message: "Assignment resumed.",
      auto_paused_count: autoPausedCount,
      assignment,
    });
  } catch (err) {
    await t.rollback().catch(() => {});
    return res
      .status(err.statusCode || 500)
      .json({ message: err.message || "Failed to resume assignment." });
  }
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * POST /api/fms/worker/assignments/:id/done
 * Allowed from: in_progress OR paused (worker can mark done directly from paused)
 * Transitions to: completed
 *
 * Time logic:
 *   in_progress → completed_at = NOW()
 *   paused      → completed_at = paused_at
 *                 (work effectively stopped when they last paused)
 */
export const completeAssignment = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    ensureWorkerRole(req);

    const assignment = await db.JobProductionStageWorker.findOne({
      where: { id: req.params.id, worker_id: req.user.id },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!assignment) {
      throw Object.assign(new Error("Assignment not found."), {
        statusCode: 404,
      });
    }
    if (!["in_progress", "paused"].includes(assignment.status)) {
      throw Object.assign(
        new Error(
          `Cannot complete — current status is '${assignment.status}'. Must be 'in_progress' or 'paused'.`
        ),
        { statusCode: 400 }
      );
    }

    // If paused: work stopped when they last paused — use that as end time
    // If in_progress: work is ending now
    const completedAt =
      assignment.status === "paused" && assignment.paused_at
        ? new Date(assignment.paused_at)
        : new Date();

    await assignment.update(
      {
        status: "completed",
        completed_at: completedAt,
        paused_at: null, // clear paused_at since work is now done
      },
      { transaction: t }
    );

    await t.commit();

    // Check if all workers for this stage are now done
    // If yes, notify coordinators so they can advance the stage
    const remainingCount = await db.JobProductionStageWorker.count({
      where: {
        job_no: assignment.job_no,
        stage_name: assignment.stage_name,
        status: {
          [Op.in]: ["assigned", "in_progress", "paused"],
        }
      },
    });

    if(remainingCount === 0){
      // All workers done — notify Production Coordinators
      const stageLabel = { printing: "Printing", binding: "Binding", quality_check: "Quality Check", packaging: "Packaging"} [assignment.stage_name] || assignment.stage_name;

      sendPushToDepartment("Production Coordinator", {
        title: "Stage Complete ✓",
        body: `Job #${assignment.job_no} — All workers finished ${stageLabel}`,
        icon: "/favicon.png",
        vibrate: [1000, 200, 1000, 200, 1000],
        requireInteraction: true,
        data: { url: "/job-fms/production" },
      }).catch(() => {
        console.error("Failed to send push notification to coordinators about stage completion.");
      });
    }


    return res.json({
      message: "Assignment marked as done. Well done!",
      assignment,
    });
  } catch (err) {
    await t.rollback().catch(() => {});
    return res
      .status(err.statusCode || 500)
      .json({ message: err.message || "Failed to complete assignment." });
  }
};