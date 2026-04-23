import { Op, where } from "sequelize";
import jwt from "jsonwebtoken";
import db from "../../models/index.js";
const {
  JobCard,
  JobAssignment,
  ActivityLog,
  User,
  JobDesignTime,
  ClientApproval,
} = db;
import { advanceStage } from "../../utils/jobFms/stageTracking.js";
import path from "path";

import { sendMailForFMS } from "../../email/sendMail.js";
import {
  processCoordinatorDesignCompletedTemplate,
  crmDesignCompletedTemplate,
  processCoordinatorDesignStartedTemplate,
  crmDesignStartedTemplate,
} from "../../email/templates/emailTemplates.js";

// Get all jobs for Designers
export const getAllJobsForDesginer = async (req, res) => {
  console.log("getAllJobsForDesginer called:");
  try {
    const total = await JobCard.count({
      where: {
        status: [
          "assigned_to_designer",
          "design_in_progress",
          "client_changes",
        ],
        assigned_designer: req.user?.username,
      },
    });

    const jobCards = await JobCard.findAll({
      where: {
        status: [
          "assigned_to_designer",
          "design_in_progress",
          "client_changes",
        ],
        assigned_designer: req.user?.username,
      },
      // For items count
      attributes: {
        include: [
          [
            db.sequelize.literal(`(
                          SELECT COUNT(*)
                          FROM jobfms_job_items ji
                          WHERE ji.job_no = JobCard.job_no
                        )`),
            "item_count",
          ],
        ],
      },
      include: [
        {
          model: JobAssignment,
          as: "assignments",
          where: { status: { [Op.in]: ["assigned", "in_progress"] } },
          required: false,
        },
        {
          model: ClientApproval,
          as: "clientApprovals",
          separate: true,
          limit: 1,
          order: [["instance", "DESC"]],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    if (!jobCards) {
      return res.status(404).json({
        total: 0,
        data: [],
        message: "No jobs found for the designer.",
      });
    }

    return res.status(200).json({
      total,
      data: jobCards,
    });
  } catch (error) {
    console.error("Error fetching jobs for Process Coordinator:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ── Pure helper — same logic runs on frontend too ──────────────────────────
// deliveryDate, jobCreatedAt: JS Date objects
// priority: "Urgent" | "High" | "Medium" | "Low"
export function calculateMaxDesignDeadline(deliveryDate, jobCreatedAt, priority) {
  
  const now         = new Date();
  const totalMs     = deliveryDate.getTime() - jobCreatedAt.getTime();
  const totalDays   = totalMs / (1000 * 60 * 60 * 24);

  let deadline;

  // ── Rule 1: Urgent OR same-day delivery → 4 hours from now ─────────────
  if (priority === "Urgent" || totalDays < 1) {
    deadline = new Date(now.getTime() + 4 * 60 * 60 * 1000);
  }

  // ── Rule 2: Next-day delivery → day before delivery at 19:30 IST ───────
  else if (totalDays <= 2) {
    // Work with IST (UTC+5:30)
    const d = new Date(deliveryDate);
    d.setUTCDate(d.getUTCDate() - 1);
    d.setUTCHours(14, 0, 0, 0);
    deadline = d;
  }
  else{
    // ── Rule 3: Any longer delivery → 50% of total duration ────────────────
    deadline = new Date(jobCreatedAt.getTime() + totalMs * 0.50);
  }

  // ── HARD CAP ──────────────────────────────────────────────────────
  return deadline > deliveryDate ? deliveryDate : deadline;
}

export const setEstimatedTime = async (req, res) => {
  console.log("setEstimatedTime called:");
  try {
    const { job_no, estimated_completion_time } = req.body;

    if (!estimated_completion_time) {
      return res.status(400).json({
        error: "estimated_completion_time is required",
      });
    }
    const assignment = await JobAssignment.findOne({
      where: {
        job_no,
        status: { [Op.in]: ["assigned", "in_progress"] },
      },
      order: [["created_at", "DESC"]],
      include: [{
        model:      JobCard,
        as:         "jobCard",
        attributes: ["delivery_date", "created_at", "task_priority"],
      }],
    });

    if (!assignment) {
      return res.status(404).json({
        error: "No active assignment found",
      });
    }

    const estimatedTime = new Date(estimated_completion_time);
    const now = new Date();

    // ── Guard 1: no past dates ──────────────────────────────────────────
    if (estimatedTime <= now) {
      return res.status(400).json({
        error: "Estimated completion time cannot be in the past.",
      });
    }

    // ── Guard 2: enforce deadline rule ──────────────────────────────────
    const deliveryDate  = new Date(assignment.jobCard.delivery_date);
    const jobCreatedAt  = new Date(assignment.jobCard.created_at);
    const priority      = assignment.jobCard.task_priority;
    const maxAllowed    = calculateMaxDesignDeadline(deliveryDate, jobCreatedAt, priority);

    if (estimatedTime > maxAllowed) {
      // Format in IST for the error message
      const maxStr = maxAllowed.toLocaleString("en-IN", {
        timeZone:    "Asia/Kolkata",
        day:         "2-digit",
        month:       "short",
        year:        "numeric",
        hour:        "2-digit",
        minute:      "2-digit",
        hour12:      true,
      });
      return res.status(400).json({
        error: `Estimated completion time cannot exceed ${maxStr} based on the delivery schedule.`,
        max_allowed_iso: maxAllowed.toISOString(),   // frontend uses this to clamp the picker
      });
    }

    assignment.estimated_completion_time = estimated_completion_time;
    await assignment.save();

    // Log Action
    await ActivityLog.create({
      job_no,
      performed_by_id: req.user?.id,
      action: "Set Estimated Time",
      meta: {
        estimated_completion_time,
        max_allowed: maxAllowed.toISOString(),
        rule_applied: priority === "Urgent" ? "urgent_4h"
          : (deliveryDate - jobCreatedAt) / 86400000 <= 2 ? "next_day_1930"
          : "thirty_percent",
      },
    });

    res.json({
      message: "Estimated time set successfully",
      assignment,
      max_allowed_iso: maxAllowed.toISOString(),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to set estimated time",
    });
  }
};


// ── Shared helper: pause any currently running job for this designer ──────────
// Called before start and resume to enforce the single-active-job rule.
// Returns the job_no that was paused (or null if nothing was running).
//
// Why JOIN through JobCard?
//   JobAssignment has no direct designer FK — the designer is tracked on
//   JobCard.assigned_designer. We find all in-progress, unpaused assignments
//   whose parent job belongs to this designer, excluding the current job.
const autoPauseActiveJob = async (designerUsername, currentJobNo, t) => {
  // Find any in-progress, unpaused assignment for this designer (excluding current job)
  const activeAssignment = await JobAssignment.findOne({
    where: {
      status: "in_progress",
      is_paused: false,
    },
    include: [
      {
        model: JobCard,
        as: "jobCard",
        where: {
          assigned_designer: designerUsername,
          job_no: { [Op.ne]: currentJobNo }, // exclude the job being started/resumed
        },
        attributes: ["job_no"],
      },
    ],
    transaction: t,
    lock: t.LOCK.UPDATE,    // row-level lock on JobAssignment
    skipLocked: false,       // wait if locked — don't skip silently
  });

  if (!activeAssignment) return null;

  const pausedJobNo = activeAssignment.jobCard.job_no;

  // Run the same pause logic as designerPauseTask
  const jobDesignTimeLog = await JobDesignTime.findOne({
    where: {
      assignment_id: activeAssignment.id,
      end_time: null,
    },
    order: [["start_time", "DESC"]],
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  const now = new Date();

  if (jobDesignTimeLog) {
    jobDesignTimeLog.end_time = now;
    jobDesignTimeLog.duration_seconds = Math.round(
      (now - new Date(jobDesignTimeLog.start_time)) / 1000,
    );
    activeAssignment.designer_duration_seconds =
      (activeAssignment.designer_duration_seconds || 0) +
      jobDesignTimeLog.duration_seconds;
    await jobDesignTimeLog.save({ transaction: t });
  }

  activeAssignment.is_paused = true;
  await activeAssignment.save({ transaction: t });

  return pausedJobNo;
};


// Designer's API to START TASK
export const designerStartTask = async (req, res) => {
  const t = await db.sequelize.transaction();

  try {
    const { job_no } = req.params;

    const assignment = await JobAssignment.findOne({
      where: { job_no, status: "assigned" },
      transaction: t,
      lock: t.LOCK.UPDATE, 
    });

    if (!assignment) {
      await t.rollback();
      return res.status(404).json({ error: "No assignment found to start" });
    }

    if (!assignment.estimated_completion_time) {
      await t.rollback();
      return res.status(400).json({
        error: "Please set estimated completion time before starting.",
      });
    }

    // ── Auto-pause any currently running job for this designer ────────────
    const autoPausedJobNo = await autoPauseActiveJob(
      req.user.username,  // designer identifier — matches JobCard.assigned_designer
      job_no,
      t,
    );

    const startTime = new Date();
    assignment.status = "in_progress";
    assignment.designer_start_time = startTime;
    assignment.is_paused = false;
    await assignment.save({ transaction: t });

    await JobDesignTime.create(
      {
        assignment_id: assignment.id,
        start_time: startTime,
      },
      { transaction: t },
    );

    const job = await JobCard.findByPk(job_no, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!job) {
      throw new Error("Job not found");
    }
    job.status = "design_in_progress";
    job.current_stage = "design_in_progress";
    await job.save({ transaction: t });

    // Track Stage
    await advanceStage({
      job_no,
      new_stage: "design_in_progress",
      performed_by_id: req.user?.id || null,
      remarks: "( Designer ) Task started",
      transaction: t,
    });

    // Log Action
    await ActivityLog.create(
      {
        job_no,
        performed_by_id: req.user?.id || null,
        action: "Designer Start Task",
        meta: { assignment },
      },
      { transaction: t },
    );

    await t.commit();

    res.json({ 
      message: "Task started", 
      assignment,
      // null when nothing was running before
      auto_paused_job_no: autoPausedJobNo,
    });

    try{
      /* ------------------ EMAIL NOTIFICATIONS ------------------ */

      // Fetch CRM user
      const crmUser = await User.findOne({
        where: { username: job.order_handled_by },
      });

      // Fetch Process Coordinators
      const coordinators = await User.findAll({
        where: { department: "Process Coordinator" },
      });

      const attachments = [
        {
          filename: "epo-logo.jpg",
          path: path.resolve("assets/epo-logo.jpg"),
          cid: "epo-logo",
        },
      ];

      // 📧 Notify Process Coordinators
      if (coordinators.length) {
        await sendMailForFMS({
          to: coordinators.map((u) => u.email),
          subject: `Design Started | Job #${job_no}`,
          html: processCoordinatorDesignStartedTemplate({
            jobNo: job_no,
            clientName: job.client_name,
            designerName: job.assigned_designer || "Designer",
            startedAt: startTime.toLocaleString(),
            estimatedCompletionTime: assignment.estimated_completion_time,
            dashboardUrl: `${process.env.LEADS_URL}/job-fms/process-coordinator`,
          }),
          attachments,
        });
      }

      // 📧 Notify CRM
      if (crmUser?.email) {
        await sendMailForFMS({
          to: crmUser.email,
          subject: `Design Started | Job #${job_no}`,
          html: crmDesignStartedTemplate({
            crmName: crmUser.username,
            jobNo: job_no,
            clientName: job.client_name,
            designerName: job.assigned_designer || "Designer",
            estimatedCompletionTime: assignment.estimated_completion_time,
            dashboardUrl: `${process.env.LEADS_URL}/job-fms/crm`,
          }),
          attachments,
        });
      }

      console.log(
        "Emails sent successfully for action designer Started the task.",
      );

    }
    catch(err){
      console.error(err);
      console.error("Error in sending emails!");
    }


  } catch (err) {
    if (!t.finished) {
      await t.rollback();
    }
    console.error("designerStartTask error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to start task" });
    }
    return;
  }
};

export const designerPauseTask = async (req, res) => {
  console.log("designerPauseTask called:");
  const t = await db.sequelize.transaction(); // start transaction
  try {
    const { job_no } = req.params;

    const assignment = await JobAssignment.findOne({
      where: { 
        job_no, 
        status: "in_progress", 
        is_paused: false, 
      },
      transaction: t,
      lock: t.LOCK.UPDATE, // optional: prevents race conditions
    });

    if (!assignment) {
      await t.rollback();
      return res.status(404).json({
        error: "No active task found",
      });
    }

    const jobDesignTimeLog = await JobDesignTime.findOne({
      where: {
        assignment_id: assignment.id,
        end_time: null,
      },
      order: [["start_time", "DESC"]],
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!jobDesignTimeLog) {
      await t.rollback();
      return res.status(404).json({
        error: "No active design time log found",
      });
    }

    jobDesignTimeLog.end_time = new Date();
    jobDesignTimeLog.duration_seconds = Math.round(
      (new Date() - new Date(jobDesignTimeLog.start_time)) / 1000,
    );
    assignment.designer_duration_seconds += jobDesignTimeLog.duration_seconds;
    assignment.is_paused = true;
    await assignment.save({ transaction: t });
    await jobDesignTimeLog.save({ transaction: t });

    await ActivityLog.create({
      job_no,
      performed_by_id: req.user?.id || null,
      action: "Designer Pause Task",
      meta: { jobDesignTimeLog },
    },{ transaction: t },
    );

    await t.commit(); // ✅ commit if everything succeeds

    res.json({
      message: "Task paused",
      jobDesignTimeLog,
    });
  } catch (err) {
    if (!t.finished) await t.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to pause task" });
  }
};

export const designerResumeTask = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    const { job_no } = req.params;

    const assignment = await JobAssignment.findOne({
      where: { 
        job_no, 
        status: "in_progress",
        is_paused: true,
      },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!assignment) {
      await t.rollback();
      return res.status(404).json({ 
        error: "No paused task found to resume" 
      });
    }

    // ── Auto-pause any currently running job for this designer ────────────
    const autoPausedJobNo = await autoPauseActiveJob(
      req.user.username,
      job_no,
      t,
    );


    // ── Resume this job ───────────────────────────────────────────────────
    await JobDesignTime.create(
      { assignment_id: assignment.id, start_time: new Date() },
      { transaction: t },
    );

    assignment.is_paused = false;
    await assignment.save({ transaction: t });

    await ActivityLog.create({
      job_no,
      performed_by_id: req.user?.id || null,
      action: "Designer Resume Task",
      meta: { assignment, auto_paused_job: autoPausedJobNo },
    }, { transaction: t },);

    await t.commit();
    return res.json({
      message: "Task resumed",
      auto_paused_job_no: autoPausedJobNo,
    });
  } catch (err) {
    if (!t.finished) await t.rollback();
    console.error("designerResumeTask error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to resume task" });
    }
  }
};

// Designer API to END TASK
export const designerEndTask = async (req, res) => {
  const t = await db.sequelize.transaction();

  try {
    const { job_no } = req.params;

    const assignment = await JobAssignment.findOne({
      where: { job_no, status: "in_progress" },
    });

    if (!assignment)
      return res.status(404).json({ error: "No active task found" });

    const endTime = new Date();

    // Finalize any open design time logs
    const openLog = await JobDesignTime.findOne({
      where: {
        assignment_id: assignment.id,
        end_time: null,
      },
      order: [["start_time", "DESC"]],
    });

    if (openLog) {
      openLog.end_time = endTime;
      openLog.duration_seconds = Math.round(
        (endTime - new Date(openLog.start_time)) / 1000,
      );
      await openLog.save({ transaction: t });
    }

    // Calculate total duration from JobDesignTime logs
    const designLogs = await JobDesignTime.findAll({
      where: { assignment_id: assignment.id },
    });

    let totalSeconds = calculateTotalSeconds(designLogs);

    assignment.status = "completed";
    assignment.designer_end_time = endTime;
    assignment.designer_duration_seconds = totalSeconds;
    assignment.is_paused = false;

    await assignment.save({ transaction: t });

    // Update JobCard ->
    const job = await JobCard.findByPk(job_no);
    job.status = "sent_for_approval";
    job.current_stage = "sent_for_approval";
    await job.save({ transaction: t });

    // Track Stage
    await advanceStage({
      job_no,
      new_stage: "sent_for_approval",
      performed_by_id: req.user?.id || null,
      remarks:
        "( Designer -> CRM ) Task completed and CRM has to send for approval",
      transaction: t,
    });

    // Log
    await ActivityLog.create(
      {
        job_no,
        performed_by_id: assignment.designer_id,
        action: "Designer End Task",
        meta: {
          duration_seconds: totalSeconds,
          duration_hms: new Date(totalSeconds * 1000)
            .toISOString()
            .substring(11, 19),
        },
      },
      { transaction: t },
    );

    await t.commit();
    res.json({
      message: "Task completed",
      assignment,
    });

    // Fetch CRM
    const crmUser = await User.findOne({
      where: {
        username: job.order_handled_by,
      },
    });

    // Fetch all Process Coordinators
    const coordinators = await User.findAll({
      where: { department: "Process Coordinator" },
    });

    // Prepare logo attachment safely
    const attachments = [
      {
        filename: "epo-logo.jpg",
        path: path.resolve("assets/epo-logo.jpg"),
        cid: "epo-logo",
      },
    ];

    // 📧 Notify Process Coordinators
    await sendMailForFMS({
      to: coordinators.map((u) => u.email),
      subject: `Design Completed | Job #${job_no}`,
      html: processCoordinatorDesignCompletedTemplate({
        jobNo: job_no,
        clientName: job.client_name,
        designerName: job.assigned_designer || "Designer",
        completedAt: new Date().toLocaleString(),
        dashboardUrl: `${process.env.LEADS_URL}/job-fms/process-coordinator`,
      }),
      attachments,
    });

    // 📧 Notify CRM
    if (crmUser?.email) {
      await sendMailForFMS({
        to: crmUser.email,
        subject: `Design Completed – Send for Client Approval | Job #${job_no}`,
        html: crmDesignCompletedTemplate({
          crmName: crmUser.username,
          jobNo: job_no,
          clientName: job.client_name,
          designerName: job.assigned_designer || "Designer",
          dashboardUrl: `${process.env.LEADS_URL}/job-fms/crm`,
        }),
        attachments,
      });
    }
    console.log("Emails sent successfully for action designer End the task.");
  } catch (err) {
    await t.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to complete task" });
  }
};

const calculateTotalSeconds = (logs) => {
  let total = 0;

  logs.forEach((log) => {
    if (!log.start_time) return;

    const start = new Date(log.start_time);
    const end = log.end_time ? new Date(log.end_time) : new Date();

    total += Math.floor((end - start) / 1000);
  });

  return total;
};

// ── POST /api/fms/designers/pause-on-logout ───────────────────────────────────
// Called when designer explicitly logs out OR JWT expires.
// Finds any active (in_progress, not paused) assignment for this designer
// and pauses it. No job_no needed — resolved from req.user.
//
// Uses regular auth middleware (token still valid at logout time).
// For JWT expiry path: called BEFORE token is cleared, while 401 hasn't
// fired yet — this is why we call it from the logout function directly.
//
// Idempotent: safe to call multiple times. If nothing is running → no-op.
// ─────────────────────────────────────────────────────────────────────────────
export const pauseOnLogout = async (req, res) => {
  // Respond immediately — don't make logout wait for DB operations
  res.status(200).json({ ok: true });

  // All DB work happens after response is sent (fire-and-forget pattern)
  try {
    let designerUsername = req.user?.username;
    let userId = req.user?.id;

    // If req.user wasn't populated (sendBeacon path — no auth middleware hit)
    if (!designerUsername && req.body?.token) {
      try {
        const decoded = jwt.verify(req.body.token, process.env.JWT_SECRET);
        designerUsername = decoded.username;
        userId = decoded.id;
      } catch {
        console.warn("pause-on-logout: invalid token in body, ignoring.");
        return;
      }
    }

    if (!designerUsername) return;

    // Find any active assignment for this designer via JobCard join
    const activeAssignment = await JobAssignment.findOne({
      where: {
        status: "in_progress",
        is_paused: false,
      },
      include: [
        {
          model: JobCard,
          as: "jobCard",
          where: { assigned_designer: designerUsername },
          attributes: ["job_no"],
        },
      ],
    });

    if (!activeAssignment) return; // nothing running — no-op

    const job_no = activeAssignment.jobCard.job_no;
    const now = new Date();

    // Close the open time log
    const openLog = await JobDesignTime.findOne({
      where: { assignment_id: activeAssignment.id, end_time: null },
      order: [["start_time", "DESC"]],
    });

    if (openLog) {
      openLog.end_time = now;
      openLog.duration_seconds = Math.round(
        (now - new Date(openLog.start_time)) / 1000,
      );
      activeAssignment.designer_duration_seconds =
        (activeAssignment.designer_duration_seconds || 0) +
        openLog.duration_seconds;
      await openLog.save();
    }

    activeAssignment.is_paused = true;
    await activeAssignment.save();

    await ActivityLog.create({
      job_no,
      performed_by_id: userId ?? null,
      action: "Designer Auto-Pause (Logout)",
      meta: { trigger: "logout", username: designerUsername },
    });

    console.log(`pause-on-logout: Job #${job_no} paused for ${designerUsername}`);
  } catch (err) {
    console.error("pause-on-logout error:", err);
  }
};