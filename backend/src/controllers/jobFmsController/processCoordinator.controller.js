import { Op } from "sequelize";
import models from "../../models/index.js";
const { JobCard, JobAssignment, StageTracking, ActivityLog, User } = models;

// Get all jobs for Process Coordinator
export const getAllJobsForProcessCoordinator = async (req, res) => {
  try {
    const jobCards = await JobCard.findAndCountAll({
      where: {
        status: "coordinator_review"
      },
      order: [["createdAt", "DESC"]],
    });

    res.json({
      total: jobCards.count,
      data: jobCards.rows,
    });
  } catch (error) {
    console.error("Error fetching jobs for Process Coordinator:", error);
    res.status(500).json({ message: "Internal server error" });
  }
}


// ------------------------------
// ASSIGN DESIGNER TO JOB
// ------------------------------
// process coordinator api to assigns designer to a job


export const assignDesigner = async (req, res) => {
  const t = await JobCard.sequelize.transaction();

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
    await StageTracking.create(
      {
        job_no,
        performed_by_id: req.user?.id,
        stage_name: "assigned_to_designer",
        started_at: new Date(),
      },
      { transaction: t }
    );

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

  } catch (err) {
    await t.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to assign designer" });
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
            [Op.gte]: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      });

      // -----------------------------
      // 4️⃣ Expected Free Time 
      //    Based on end_time of all active tasks.
      // -----------------------------
      let expectedFreeTime = null;

      if (activeJobs.length > 0) {
        const endTimes = activeJobs.map(job => {
          if (job.designer_end_time) return new Date(job.designer_end_time);
          
          // fallback: assume 1 hour if no end time
          return new Date(new Date(job.designer_start_time).getTime() + 60 * 60 * 1000);
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
      const urgentFlag = pendingJobs.some(p => p.jobCard?.task_priority === "Urgent");

      // -----------------------------
      // 7️⃣ Recommended score 
      // (lower = better: idle designers first, lower workload first)
      // -----------------------------
      const recommendedScore =
        (activeJobs.length * 5) +
        (pendingJobs.length * 3) +
        (urgentFlag ? 5 : 0);

      result.push({
        designer_id: designerId,
        name: designer.username,
        status: activeJobs.length > 0 ? "busy" : "idle",
        active_jobs: activeJobs.map(j => ({
          job_no: j.job_no,
          priority: j.jobCard?.task_priority,
          start_time: j.designer_start_time,
          designer_end_time: j.designer_end_time,
        })),
        pending_jobs: pendingJobs.map(j => ({
          job_no: j.job_no,
          priority: j.jobCard?.task_priority,
          assigned_at: j.assigned_at,
        })),
        today_completed: todayCompletedJobs.length,
        today_jobs: activeJobs.length + pendingJobs.length + todayCompletedJobs.length,
        workload_score: workloadScore,
        urgent_flag: urgentFlag,
        expected_free_time: expectedFreeTime,
        recommended_score: recommendedScore
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