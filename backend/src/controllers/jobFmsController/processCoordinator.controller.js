import { Op } from "sequelize";
import db from "../../models/index.js";
const { JobCard, JobAssignment, StageTracking, ActivityLog, User } = db;
import { advanceStage } from "../../utils/jobFms/stageTracking.js";
import { sendMailForFMS } from "../../email/sendMail.js";

import {
  designerAssignmentTemplate,
  crmJobStageTemplate,
} from "../../email/templates/emailTemplates.js";
import path from "path";

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
  const t = await db.sequelize.transaction();

  try {
    const { job_no } = req.params;
    const { designer_id } = req.body;

    if (!designer_id) {
      return res.status(400).json({ error: "designer_id is required" });
    }

    const desginer = await User.findByPk(designer_id);

    if (!desginer || desginer.department !== "Designer") {
      return res.status(400).json({ error: "Invalid designer_id" });
    }

    const job = await JobCard.findByPk(job_no);
    if (!job) return res.status(404).json({ error: "Job not found" });

    // Create assignment entry
    const assignment = await JobAssignment.create(
      {
        job_no,
        designer_id,
        assigned_by_id: req.user?.id || null,
        status: "assigned",
      },
      { transaction: t }
    );

    // Update JobCard status
    job.status = "assigned_to_designer";
    job.current_stage = "assigned_to_designer";
    job.assigned_designer = desginer.username;
    await job.save({ transaction: t });

    // Track Stage
    await advanceStage({
      job_no,
      new_stage: "assigned_to_designer",
      performed_by_id: req.user?.id || null,
      remarks: "(Process Coordinator -> Designer) Job assigned to designer",
      transaction: t,
    });

    // Log Action
    await ActivityLog.create(
      {
        job_no,
        performed_by_id: req.user?.id,
        action: "Assigned Designer",
        meta: { designer_id },
      },
      { transaction: t }
    );

    await t.commit();

    res.json({ message: "Designer assigned successfully", assignment });

    // Fetch CRM handling this job
    const crmUser = await User.findOne({
      where: {
        username: job.order_handled_by,
      },
    });

    const attachments = [
      {
        filename: "epo-logo.jpg",
        path: path.resolve("assets/epo-logo.jpg"),
        cid: "epo-logo",
      },
    ];

    // Designer Email
    await sendMailForFMS({
      to: desginer.email,
      subject: `New Job Assigned - Job #${job_no}`,
      html: designerAssignmentTemplate({
        designerName: desginer.username,
        jobNo: job_no,
        dashboardUrl: `${process.env.LEADS_URL}/job-fms/designer`,
      }),
      attachments,
    });

    // CRM Notification Email
    // CRM Email
    if (crmUser?.email) {
      await sendMailForFMS({
        to: crmUser.email,
        subject: `Job #${job_no} Assigned to Designer`,
        html: crmJobStageTemplate({
          crmName: crmUser.username,
          jobNo: job_no,
          designerName: desginer.username,
          assignedAt: new Date(),
          dashboardUrl: `${process.env.LEADS_URL}/job-fms/crm`,
        }),
        attachments,
      });
    }

  } catch (err) {
    if (!t.finished) {
      await t.rollback();
    }
    console.error(err);
    return res.status(500).json({ error: "Failed to assign designer" });
  }
};

export const getDesignerStatus = async (req, res) => {
  try {
    const designers = await User.findAll({
      where: { department: "Designer" },
    });

    const result = [];

    for (let designer of designers) {
      const designerId = designer.id;

      // -----------------------------
      // 1️⃣ ACTIVE JOBS (in progress)
      // -----------------------------
      const activeJobs = await JobAssignment.findAll({
        where: {
          designer_id: designerId,
          status: "in_progress",
        },
        include: [{ model: JobCard, as: "jobCard" }],
      });

      // -----------------------------
      // 2️⃣ PENDING JOBS (assigned but not started)
      // -----------------------------
      const pendingJobs = await JobAssignment.findAll({
        where: {
          designer_id: designerId,
          status: "assigned",
        },
        include: [{ model: JobCard, as: "jobCard" }],
      });

      // -----------------------------
      // 3️⃣ TODAY COMPLETED JOBS
      // -----------------------------
      const todayCompletedJobs = await JobAssignment.findAll({
        where: {
          designer_id: designerId,
          status: "completed",
          designer_end_time: {
            [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      });

      // -----------------------------
      // 4️⃣ Expected Free Time
      //    Based on end_time of all active tasks.
      // -----------------------------
      let expectedFreeTime = null;

      if (activeJobs.length > 0) {
        const endTimes = activeJobs.map((job) => {
          if (job.estimated_completion_time)
            return new Date(job.estimated_completion_time);

          // fallback: assume 1 hour if no end time
          return new Date(
            new Date(job.designer_start_time).getTime() + 60 * 60 * 1000
          );
        });

        expectedFreeTime = new Date(Math.max(...endTimes));
      }

      // -----------------------------
      // 5️⃣ Workload Score
      //    0–100% based on active + pending job count
      // -----------------------------
      const totalTasks = activeJobs.length + pendingJobs.length;
      const workloadScore = Math.min(totalTasks * 20, 100); // Example: 5 tasks → 100%

      // -----------------------------
      // 6️⃣ Contains urgent tasks?
      // -----------------------------
      const urgentFlag = pendingJobs.some(
        (p) => p.jobCard?.task_priority === "Urgent"
      );

      // -----------------------------
      // 7️⃣ Recommended score
      // (lower = better: idle designers first, lower workload first)
      // -----------------------------
      const recommendedScore =
        activeJobs.length * 5 + pendingJobs.length * 3 + (urgentFlag ? 5 : 0);

      result.push({
        designer_id: designerId,
        name: designer.username,
        status: activeJobs.length > 0 ? "active" : "idle",
        active_jobs: activeJobs.map((j) => ({
          job_no: j.job_no,
          priority: j.jobCard?.task_priority,
          start_time: j.designer_start_time,
          designer_end_time: j.designer_end_time,
        })),
        pending_jobs: pendingJobs.map((j) => ({
          job_no: j.job_no,
          priority: j.jobCard?.task_priority,
          assigned_at: j.assigned_at,
        })),
        today_completed: todayCompletedJobs.length,
        today_jobs:
          activeJobs.length + pendingJobs.length + todayCompletedJobs.length,
        workload_score: workloadScore,
        urgent_flag: urgentFlag,
        expected_free_time: expectedFreeTime,
        recommended_score: recommendedScore,
      });
    }

    // Sort designers by score (best recommended first)
    result.sort((a, b) => a.recommended_score - b.recommended_score);

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch designer status" });
  }
};
