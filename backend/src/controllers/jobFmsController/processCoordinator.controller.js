import { Op } from "sequelize";
import db from "../../models/index.js";
const { JobCard, JobAssignment, StageTracking, ActivityLog, User } = db;
import { advanceStage } from "../../utils/jobFms/stageTracking.js";
import { sendMailForFMS } from "../../email/sendMail.js";
import { rankDesignersForAssignment } from "../../services/jobFms/designerAllocation.service.js";
import {
  assignDesignerToJob,
  sendAssignmentNotifications,
  AssignmentError,
} from "../../services/jobFms/designerAssignment.service.js";

import { nowIST } from "../../utils/attendance/istTime.js";
import { computeScore, getEligibleDesigners } from "../../services/jobFms/designerAllocation.service.js";

import {
  designerAssignmentTemplate,
  crmJobStageTemplate,
} from "../../email/templates/emailTemplates.js";
import path from "path";

import { sendPushToUser } from "../../utils/pushNotification.js"

// Get all jobs for Process Coordinator
export const getAllJobsForProcessCoordinator = async (req, res) => {
  try {

    const total = await JobCard.count({
      where: {
        status: "coordinator_review",
      },
    })

    const jobCards = await JobCard.findAll({
      where: {
        status: "coordinator_review",
      },
      order: [["createdAt", "DESC"]],
    });

    res.json({
      total,
      data: jobCards,
    });
  } catch (error) {
    console.error("Error fetching jobs for Process Coordinator:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// ------------------------------
// ASSIGN DESIGNER TO JOB
// ------------------------------
// process coordinator api to assigns designer to a job

export const assignDesigner = async (req, res) => {
  const { job_no } = req.params;
  const { designer_id } = req.body;

  if (!designer_id) {
    return res.status(400).json({ error: "designer_id is required" });
  }

  try {
    const { assignment, job, designer, estimated_completion_time } =
      await assignDesignerToJob({
        jobNo: job_no,
        designerId: designer_id,
        assignedById: req.user?.id,
        mode: "manual",
      });

    res.json({
      message: "Designer assigned successfully",
      assignment,
      estimated_completion_time,
    });

    // After the response: never throws, each channel is isolated.
    await sendAssignmentNotifications({
      job,
      designer,
      mode: "manual",
      estimatedCompletionTime: estimated_completion_time,
    });
  } catch (err) {
    if (err instanceof AssignmentError) {
      return res.status(err.status).json({ error: err.message, code: err.code });
    }
    console.error("[assignDesigner]", err);
    if (!res.headersSent) {
      return res.status(500).json({ error: "Failed to assign designer" });
    }
  }
};


// 25 points of auto-assign workload = a full (100%) bar. One place to tune.
const FULL_LOAD_SCORE = 25;

/**
 * GET /designers/status — read-only stats for the Process Coordinator.
 * 3 queries in total (designers, open assignments, today's completed) + the
 * attendance check, instead of 3 queries per designer.
 * Counts use the same definitions (and weights) as the auto-assign ranking.
 */

export const getDesignerStatus = async (req, res) => {
  try {
    const designers = await User.findAll({
      where: { department: "Designer", isActive: true },
      attributes: ["id", "username"],
      order: [["username", "ASC"]],
    });
    if (designers.length === 0) return res.json([]);

    const ids = designers.map((d) => d.id);
    const now = nowIST();
    const startOfToday = now.startOf("day").toJSDate();

    const [openRows, doneRows, attendance] = await Promise.all([
      JobAssignment.findAll({
        where: { 
          designer_id: { [Op.in]: ids }, 
          status: { [Op.in]: ["assigned", "in_progress"] } 
        },
        include: [{ 
          model: JobCard, 
          as: "jobCard", 
          attributes: ["job_no", "client_name", "task_priority", "delivery_date"] 
        }],
        order: [["assigned_at", "ASC"], ["id", "ASC"]],
      }),
      
      JobAssignment.findAll({
        attributes: ["designer_id", [db.sequelize.fn("COUNT", db.sequelize.col("id")), "cnt"]],
        where: { designer_id: { [Op.in]: ids }, status: "completed", designer_end_time: { [Op.gte]: startOfToday } },
        group: ["designer_id"],
        raw: true,
      }),
      // Same attendance / leave check the auto-assign uses. If it fails, the stats still load.
      getEligibleDesigners(now).catch((err) => {
        console.warn("[getDesignerStatus] attendance check failed:", err.message);
        return null;
      }),
    ]);

    const openByDesigner = new Map();
    for (const row of openRows) {
      if (!openByDesigner.has(row.designer_id)) openByDesigner.set(row.designer_id, []);
      openByDesigner.get(row.designer_id).push(row);
    }
    const doneByDesigner = new Map(doneRows.map((r) => [r.designer_id, Number(r.cnt)]));

    const eligibleIds = attendance ? new Set(attendance.eligible.map((d) => d.id)) : null;
    const excludedReason = attendance ? new Map(attendance.excluded.map((d) => [d.designer_id, d.reason])) : null;

    const result = designers.map((designer) => {
      const rows = openByDesigner.get(designer.id) ?? [];
      const active = rows
        .filter((r) => r.status === "in_progress")
        .sort((a, b) => new Date(a.designer_start_time || 0) - new Date(b.designer_start_time || 0));
      const pending = rows.filter((r) => r.status === "assigned");

      const paused = active.filter((r) => r.is_paused).length;
      const running = active.length - paused;
      const urgentWaiting = pending.filter((r) => r.jobCard?.task_priority === "Urgent").length;

      const assignScore = computeScore({ running, paused, assigned: pending.length, urgentWaiting });

      // Expected free time: latest estimate among running/paused jobs (fallback: start + 1h)
      const endTimes = active
        .map((r) =>
          r.estimated_completion_time
            ? new Date(r.estimated_completion_time)
            : r.designer_start_time
              ? new Date(new Date(r.designer_start_time).getTime() + 60 * 60 * 1000)
              : null,
        )
        .filter((d) => d && !Number.isNaN(d.getTime()));
      const expectedFreeTime = endTimes.length ? new Date(Math.max(...endTimes.map((d) => d.getTime()))) : null;

      const todayCompleted = doneByDesigner.get(designer.id) ?? 0;

      return {
        designer_id: designer.id,
        name: designer.username,
        status: active.length > 0 ? "active" : "idle",
        active_jobs: active.map((r) => ({
          job_no: r.job_no,
          client_name: r.jobCard?.client_name,
          priority: r.jobCard?.task_priority,
          delivery_date: r.jobCard?.delivery_date,
          start_time: r.designer_start_time,
          estimated_done: r.estimated_completion_time,
          is_paused: r.is_paused,
        })),
        pending_jobs: pending.map((r) => ({
          job_no: r.job_no,
          client_name: r.jobCard?.client_name,
          priority: r.jobCard?.task_priority,
          delivery_date: r.jobCard?.delivery_date,
          assigned_at: r.assigned_at,
          estimated_done: r.estimated_completion_time,
        })),
        today_completed: todayCompleted,
        today_jobs: active.length + pending.length + todayCompleted,
        workload_score: Math.min(100, Math.round((assignScore / FULL_LOAD_SCORE) * 100)), // 0–100 % bar
        assign_score: assignScore, // the exact number the auto-assign ranking uses
        urgent_flag: urgentWaiting > 0,
        expected_free_time: expectedFreeTime,
        availability: eligibleIds
          ? { available: eligibleIds.has(designer.id), reason: excludedReason.get(designer.id) ?? null }
          : { available: null, reason: null },
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch designer status" });
  }
};


export const coordinatorSetEstimatedTime = async (req, res) => {
  try{
    const { job_no } = req.params;
    const { estimated_completion_time } = req.body;

    if(!estimated_completion_time){
      return res.status(400).json({
        error: "estimated_completion_time is required" 
      });
    }

    if(!job_no){
      return res.status(400).json({
        error: "Job No is required" 
      });
    }

    const estimatedTime = new Date(estimated_completion_time);
    const now = new Date();

    if(isNaN(estimatedTime.getTime())){
      return res.status(400).json({
        error: "Invalid date format"
      });
    }

    if(estimatedTime <= now){
      return res.status(400).json({
        error: "Estimated completion time cannot be in the past."
      });
    }

    // Only constraint for coordinator: must not exceed delivery date
    const jobCard = await JobCard.findByPk(job_no);
    if(!jobCard){
      return res.status(400).json({
        error: "Job not found"
      });
    }

    const deliveryDate = new Date(jobCard.delivery_date);
    if(estimatedTime >= deliveryDate){
      const maxStr = deliveryDate.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata", day: "2-digit", month: "short",
        year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true,
      });
      return res.status(400).json({
        error: `Estimated time cannot exceed delivery date (${maxStr}).`,
      });
    }

    // Find the active assignment — coordinator can update regardless of current value
    const assignment = await JobAssignment.findOne({
      where: {
        job_no,
        status: { [Op.in]: ["assigned", "in_progress"] },
      },
      order: [["created_at", "DESC"]],
    });

    if(!assignment){
      return res.status(400).json({
        error: "No active assignment found for this job."
      });
    }

    assignment.estimated_completion_time = estimated_completion_time;
    await assignment.save();

    await ActivityLog.create({
      job_no,
      performed_by_id: req.user?.id,
      action:          "Set Estimated Time (Coordinator Override)",
      meta:            { estimated_completion_time },
    });

    res.json({ 
      message: "Estimated time updated", 
      assignment 
    });

    // ── Push: designer (fire-and-forget) ─────────────────────────────────────
    sendPushToUser(assignment.designer_id, {
      title: "Estimated Time Set",
      body: `Job #${job_no} — coordinator set a completion deadline.`,
      icon: "/favicon.png",
      vibrate: [1000, 200, 1000, 200, 1000],
      requireInteraction: true,
      data: { url: "/job-fms/designer", tag: `job-${job_no}` },
    }).catch((err) =>
      console.warn(`Push failed for designer on job ${job_no}:`, err.message)
    );

  }
  catch(err){
    console.error("[coordinatorSetEstimatedTime]", err);
    res.status(500).json({ error: "Failed to set estimated time" });
  }
}

// READ-ONLY preview of who would receive the next job. Changes no data.
export const previewDesignerRanking = async (req, res) => {
  try {
    const { ranked, excluded } = await rankDesignersForAssignment();
    return res.json({
      next_designer: ranked[0]?.name ?? null,
      ranked,
      excluded,
    });
  } catch (err) {
    console.error("[previewDesignerRanking]", err);
    return res.status(500).json({ error: "Failed to compute designer ranking" });
  }
};
