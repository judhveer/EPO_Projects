// services/jobFms/designerAssignment.service.js
//
// Single place where "assign a designer to a job" happens.
// Used by:
//   - Process Coordinator manual assign   (mode: "manual")
//   - Auto-assign on job creation         (mode: "auto")
// Later phases (untick direct-to-production, redesign, transfer) will reuse it too.
//
// Rules:
//   * DB work (assignDesignerToJob) and notifications (sendAssignmentNotifications)
//     are separate: notifications run AFTER commit and can never fail an assignment.
//   * Auto-assign is serialized with a MySQL named lock so two jobs created at the
//     same moment cannot both pick the same "least loaded" designer.

import path from "path";
import { Op, QueryTypes } from "sequelize";
import db from "../../models/index.js";
import { rankDesignersForAssignment } from "./designerAllocation.service.js";
import { calculateMaxDesignDeadline } from "../../controllers/jobFmsController/designer.controller.js";
import { advanceStage } from "../../utils/jobFms/stageTracking.js";
import {
  sendPushToUser,
  sendPushToDepartment,
} from "../../utils/pushNotification.js";
import { sendMailForFMS } from "../../email/sendMail.js";
import {
  designerAssignmentTemplate,
  crmJobStageTemplate,
} from "../../email/templates/emailTemplates.js";

const { sequelize, JobCard, JobAssignment, ActivityLog, User } = db;

const AUTO_ASSIGN_LOCK_NAME = "jobfms:auto_assign_designer";
const AUTO_ASSIGN_LOCK_TIMEOUT_SEC = 10;

/** Error with an HTTP status so controllers can map it directly. */
export class AssignmentError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = "AssignmentError";
    this.status = status;
    this.code = code;
  }
}

const formatIST = (date) =>
  new Date(date).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

// A designer must always get a usable window. If the normal maximum deadline is
// less than MIN_DESIGN_WINDOW_HOURS away (or already past), push it to
// now + MIN_DESIGN_WINDOW_HOURS, but never beyond the delivery date.
// (calculateMaxDesignDeadline itself is untouched: setEstimatedTime and the
// frontend copy of that rule keep working exactly as before.)
const MIN_DESIGN_WINDOW_HOURS = 2;

function applyMinimumWindow(rawDeadline, deliveryDate) {
  const floor = new Date(Date.now() + MIN_DESIGN_WINDOW_HOURS * 60 * 60 * 1000);
  if (rawDeadline.getTime() >= floor.getTime()) {
    return { estimated: rawDeadline, floorApplied: false };
  }
  const capped = floor.getTime() > deliveryDate.getTime() ? deliveryDate : floor;
  return { estimated: capped, floorApplied: true };
}

// Same labels setEstimatedTime() writes to the activity log.
function describeDeadlineRule(deliveryDate, createdAt, priority) {
  const totalDays = (deliveryDate - createdAt) / (1000 * 60 * 60 * 24);
  if (priority === "Urgent" || totalDays < 1) return "urgent_or_same_day_4h";
  if (totalDays <= 2) return "next_day_1930";
  return "fifty_percent";
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. DB work: create the assignment and move the job forward
// ─────────────────────────────────────────────────────────────────────────────
/**
 * @param {object}  p
 * @param {number|string} p.jobNo
 * @param {string}  p.designerId
 * @param {string}  p.assignedById   User id stored in assigned_by_id (NOT NULL)
 * @param {"manual"|"auto"} p.mode
 * @param {object}  [p.scoreSnapshot] ranking row of the chosen designer (auto only, for the log)
 * @param {string}  [p.trigger]       what caused an auto-assign: "creation" | "untick" | "sweep" (for the log)
 * @param {object}  [p.transaction]   use caller's transaction; otherwise one is created + committed here
 * @returns {{assignment, job, designer, estimated_completion_time: Date}}
 */
export async function assignDesignerToJob({
  jobNo,
  designerId,
  assignedById,
  mode,
  scoreSnapshot = null,
  trigger = null,
  transaction = null,
}) {
  if (!assignedById) {
    throw new AssignmentError(400, "ASSIGNER_REQUIRED", "assigned_by user is required");
  }

  const ownTx = !transaction;
  const t = transaction ?? (await sequelize.transaction());

  try {
    const designer = await User.findByPk(designerId, { transaction: t });
    if (!designer || designer.department !== "Designer") {
      throw new AssignmentError(400, "INVALID_DESIGNER", "Invalid designer_id");
    }
    if (!designer.isActive) {
      throw new AssignmentError(400, "DESIGNER_INACTIVE", "This designer account is inactive");
    }

    // Row lock: two requests assigning the same job serialize here.
    const job = await JobCard.findByPk(jobNo, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!job) {
      throw new AssignmentError(404, "JOB_NOT_FOUND", "Job not found");
    }
    if (job.status !== "coordinator_review" || job.is_direct_to_production) {
      throw new AssignmentError(
        409,
        "JOB_NOT_ASSIGNABLE",
        `Job #${jobNo} is not waiting for a designer (current status: ${job.status})`,
      );
    }

    const activeCount = await JobAssignment.count({
      where: {
        job_no: jobNo,
        status: { [Op.in]: ["assigned", "in_progress"] },
      },
      transaction: t,
    });
    if (activeCount > 0) {
      throw new AssignmentError(409, "ALREADY_ASSIGNED", `Job #${jobNo} already has an active assignment`);
    }

    // Estimated completion = the maximum allowed design time (first assignment => instance 1).
    const deliveryDate = new Date(job.delivery_date);
    const createdAt = new Date(job.get("createdAt"));
    const rawMaxDeadline = calculateMaxDesignDeadline(
      deliveryDate,
      createdAt,
      job.task_priority,
      1,
      null,
    );
    const { estimated, floorApplied } = applyMinimumWindow(rawMaxDeadline, deliveryDate);
    const estimateAlreadyPast = estimated.getTime() <= Date.now();

    const assignment = await JobAssignment.create(
      {
        job_no: jobNo,
        designer_id: designerId,
        assigned_by_id: assignedById,
        status: "assigned",
        estimated_completion_time: estimated,
        remarks: mode === "auto" ? "Auto-assigned (workload based)" : null,
      },
      { transaction: t },
    );

    job.status = "assigned_to_designer";
    job.current_stage = "assigned_to_designer";
    job.assigned_designer = designer.username;
    await job.save({ transaction: t });

    // advanceStage swallows its own errors, so check the result explicitly.
    const stageResult = await advanceStage({
      job_no: jobNo,
      new_stage: "assigned_to_designer",
      performed_by_id: assignedById,
      remarks:
        mode === "auto"
          ? "(System -> Designer) Job auto-assigned to designer (least workload)"
          : "(Process Coordinator -> Designer) Job assigned to designer",
      transaction: t,
    });
    if (!stageResult?.success) {
      throw new Error(`Stage tracking failed: ${stageResult?.error || "unknown error"}`);
    }

    await ActivityLog.create(
      {
        job_no: jobNo,
        performed_by_id: assignedById,
        action: mode === "auto" ? "Auto-Assigned Designer" : "Assigned Designer",
        meta: {
          designer_id: designerId,
          designer_name: designer.username,
          mode,
          estimated_completion_time: estimated.toISOString(),
          raw_max_deadline: rawMaxDeadline.toISOString(),
          min_window_floor_applied: floorApplied,
          deadline_rule: describeDeadlineRule(deliveryDate, createdAt, job.task_priority),
          estimate_already_past: estimateAlreadyPast,
          ...(trigger ? { trigger } : {}),
          ...(scoreSnapshot ? { ranking_snapshot: scoreSnapshot } : {}),
        },
      },
      { transaction: t },
    );

    if (ownTx) await t.commit();

    return { assignment, job, designer, estimated_completion_time: estimated };
  } catch (err) {
    if (ownTx && !t.finished) await t.rollback();
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Auto-assign (called after a job is created / returned to coordinator_review)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Never throws. Always resolves to:
 *   { assigned: true,  assignment, job, designer, estimated_completion_time }
 *   { assigned: false, reason, excluded?, error? }
 * reason: "job_not_eligible" | "no_designer_available" | "auto_assign_busy" | "error"
 */
export async function autoAssignJob({
  jobNo,
  fallbackAssignedById = null,
  trigger = "creation",
}) {
  // The named lock belongs to a DB connection, so it gets its own dedicated
  // transaction/connection. The actual assignment runs in a separate transaction
  // and is committed BEFORE the lock is released, so the next waiting job always
  // ranks designers with this job already counted.
  const lockTx = await sequelize.transaction();
  let gotLock = false;

  try {
    const [row] = await sequelize.query("SELECT GET_LOCK(:name, :timeout) AS got", {
      replacements: { name: AUTO_ASSIGN_LOCK_NAME, timeout: AUTO_ASSIGN_LOCK_TIMEOUT_SEC },
      type: QueryTypes.SELECT,
      transaction: lockTx,
    });
    gotLock = Number(row?.got) === 1;
    if (!gotLock) {
      return { assigned: false, reason: "auto_assign_busy" };
    }

    const job = await JobCard.findByPk(jobNo);
    if (!job || job.status !== "coordinator_review" || job.is_direct_to_production) {
      return { assigned: false, reason: "job_not_eligible" };
    }

    const { ranked, excluded } = await rankDesignersForAssignment();
    if (!ranked.length) {
      return { assigned: false, reason: "no_designer_available", excluded };
    }
    const top = ranked[0];

    // assigned_by_id: the CRM handling the job (same user as order_handled_by),
    // falling back to whoever created the job.
    const crm = await User.findOne({
      where: { username: job.order_handled_by },
      attributes: ["id"],
    });
    let assignedById = crm?.id ?? fallbackAssignedById;
    if (!assignedById) {
      // The sweep has no request user: use whoever created the job.
      const created = await ActivityLog.findOne({
        where: { job_no: jobNo, action: "JobCard Created" },
        attributes: ["performed_by_id"],
        order: [["created_at", "ASC"]],
      });
      assignedById = created?.performed_by_id ?? null;
    }

    const result = await assignDesignerToJob({
      jobNo,
      designerId: top.designer_id,
      assignedById,
      mode: "auto",
      scoreSnapshot: top,
      trigger,
    });

    return { assigned: true, ...result };
  } catch (err) {
    console.error(`[autoAssignJob] job ${jobNo} failed:`, err);
    return { assigned: false, reason: "error", error: err.message };
  } finally {
    try {
      if (gotLock) {
        await sequelize.query("SELECT RELEASE_LOCK(:name)", {
          replacements: { name: AUTO_ASSIGN_LOCK_NAME },
          type: QueryTypes.SELECT,
          transaction: lockTx,
        });
      }
      await lockTx.commit();
    } catch (e) {
      console.error("[autoAssignJob] lock cleanup failed:", e.message);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Notifications (run AFTER commit; every channel isolated, nothing throws)
// ─────────────────────────────────────────────────────────────────────────────
const logoAttachment = () => [
  {
    filename: "epo-logo.jpg",
    path: path.resolve("assets/epo-logo.jpg"),
    cid: "epo-logo",
  },
];

export async function sendAssignmentNotifications({
  job,
  designer,
  mode,
  estimatedCompletionTime = null,
}) {
  const job_no = job.job_no;

  let crmUser = null;
  try {
    crmUser = await User.findOne({ where: { username: job.order_handled_by } });
  } catch (e) {
    console.warn(`CRM lookup failed for job ${job_no}:`, e.message);
  }

  const deadlineText = estimatedCompletionTime
    ? ` Complete by ${formatIST(estimatedCompletionTime)}.`
    : "";

  // Push: designer
  sendPushToUser(designer.id, {
    title: "New Job Assigned",
    body: `Job #${job_no} has been ${mode === "auto" ? "auto-" : ""}assigned to you.${deadlineText}`,
    icon: "/favicon.png",
    vibrate: [1000, 200, 1000, 200, 1000],
    requireInteraction: true,
    data: { url: "/job-fms/designer", tag: `job-${job_no}` },
  }).catch((err) =>
    console.warn(`Push failed for designer ${designer.username} on job ${job_no}:`, err.message),
  );

  // Push: CRM
  if (crmUser?.id) {
    sendPushToUser(crmUser.id, {
      title: "Designer Assigned",
      body: `Job #${job_no} assigned to ${designer.username}.`,
      icon: "/favicon.png",
      vibrate: [1000, 200, 1000, 200, 1000],
      requireInteraction: true,
      data: { url: "/job-fms/common", tag: `job-${job_no}` },
    }).catch((err) =>
      console.warn(`Push failed for CRM ${crmUser.username} on job ${job_no}:`, err.message),
    );
  }

  // Email: designer
  if (designer.email) {
    try {
      await sendMailForFMS({
        to: designer.email,
        subject: `New Job Assigned - Job #${job_no}`,
        html: designerAssignmentTemplate({
          designerName: designer.username,
          jobNo: job_no,
          dashboardUrl: `${process.env.LEADS_URL}/job-fms/designer`,
        }),
        attachments: logoAttachment(),
      });
    } catch (e) {
      console.error(`Designer assignment email failed for job ${job_no}:`, e.message);
    }
  }

  // Email: CRM
  if (crmUser?.email) {
    try {
      await sendMailForFMS({
        to: crmUser.email,
        subject: `Job #${job_no} Assigned to Designer`,
        html: crmJobStageTemplate({
          crmName: crmUser.username,
          jobNo: job_no,
          designerName: designer.username,
          assignedAt: new Date(),
          dashboardUrl: `${process.env.LEADS_URL}/job-fms/crm`,
        }),
        attachments: logoAttachment(),
      });
    } catch (e) {
      console.error(`CRM assignment email failed for job ${job_no}:`, e.message);
    }
  }
}

/**
 * Auto-assign did not place the job: log it and tell the Process Coordinators
 * to assign manually. Never throws.
 */
export async function notifyAutoAssignSkipped({ job, reason, excluded = [] }) {
  const job_no = job.job_no;

  try {
    await ActivityLog.create({
      job_no,
      performed_by_id: null,
      action: "Auto-Assign Skipped",
      meta: { reason, excluded },
    });
  } catch (e) {
    console.warn(`Could not log auto-assign skip for job ${job_no}:`, e.message);
  }

  const why =
    reason === "no_designer_available"
      ? "No designer is available right now (not checked in / on leave)."
      : "Auto-assignment could not complete.";

  try {
    await sendPushToDepartment("Process Coordinator", {
      title: "Assign Designer Manually",
      body: `Job #${job_no} · ${job.client_name}. ${why}`,
      icon: "/favicon.png",
      vibrate: [1000, 200, 1000, 200, 1000],
      requireInteraction: true,
      data: { url: "/job-fms/coordinator", tag: `job-${job_no}` },
    });
  } catch (e) {
    console.warn(`Push to Process Coordinators failed for job ${job_no}:`, e.message);
  }
}

/**
 * Tell the Process Coordinators a job was assigned automatically
 * (so they don't miss the earlier "assign manually" push getting resolved).
 * Never throws.
 */
export async function notifyCoordinatorsAutoAssigned({
  job,
  designer,
  estimatedCompletionTime = null,
  trigger = "sweep",
}) {
  const why =
    trigger === "sweep"
      ? "a designer became available"
      : trigger === "untick"
        ? "Direct to Production was unticked"
        : "job created";
  const by = estimatedCompletionTime ? ` Deadline ${formatIST(estimatedCompletionTime)}.` : "";
  try {
    await sendPushToDepartment("Process Coordinator", {
      title: "Job Auto-Assigned",
      body: `Job #${job.job_no} · ${job.client_name} → ${designer.username} (${why}).${by}`,
      icon: "/favicon.png",
      vibrate: [500, 100, 500],
      requireInteraction: true,
      data: { url: "/job-fms/coordinator", tag: `job-${job.job_no}` },
    });
  } catch (e) {
    console.warn(`Push to Process Coordinators failed for job ${job.job_no}:`, e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Sweep: jobs left waiting in coordinator_review (no designer was available)
// ─────────────────────────────────────────────────────────────────────────────
const SWEEP_MAX_JOBS_PER_RUN = 50;
let sweepRunning = false; // stops a slow run from overlapping with the next tick

/**
 * Assign waiting jobs (Urgent first, then oldest first) to the least-loaded
 * eligible designer, one job at a time (designers are re-ranked after each one).
 * Stops as soon as no designer is available. Never throws.
 * @returns {{ checked: number, assigned: number, stopped: string|null }}
 */
export async function sweepWaitingJobs() {
  const summary = { checked: 0, assigned: 0, stopped: null };
  if (sweepRunning) {
    summary.stopped = "previous_run_still_active";
    return summary;
  }
  sweepRunning = true;

  try {
    const waiting = await JobCard.findAll({
      where: { status: "coordinator_review", is_direct_to_production: false },
      attributes: ["job_no"],
      order: [
        [sequelize.literal("`JobCard`.`task_priority` = 'Urgent'"), "DESC"],
        ["created_at", "ASC"],
      ],
      limit: SWEEP_MAX_JOBS_PER_RUN,
    });

    for (const row of waiting) {
      summary.checked += 1;
      const result = await autoAssignJob({ jobNo: row.job_no, trigger: "sweep" });

      if (result.assigned) {
        summary.assigned += 1;
        const { job, designer, estimated_completion_time } = result;
        // Fire-and-forget: slow SMTP must not delay assigning the next waiting job.
        sendAssignmentNotifications({
          job,
          designer,
          mode: "auto",
          estimatedCompletionTime: estimated_completion_time,
        }).catch(() => {});
        notifyCoordinatorsAutoAssigned({
          job,
          designer,
          estimatedCompletionTime: estimated_completion_time,
          trigger: "sweep",
        }).catch(() => {});
        continue;
      }

      if (result.reason === "no_designer_available" || result.reason === "auto_assign_busy") {
        summary.stopped = result.reason; // nothing more can be placed right now
        break;
      }
      // job_not_eligible (someone else got it first) or a per-job error: try the next job.
    }
  } catch (err) {
    console.error("[sweepWaitingJobs] failed:", err);
    summary.stopped = "error";
  } finally {
    sweepRunning = false;
  }
  return summary;
}
