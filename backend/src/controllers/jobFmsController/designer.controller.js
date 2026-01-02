import { Op, where } from "sequelize";
import models from "../../models/index.js";
const {
  JobCard,
  JobAssignment,
  StageTracking,
  ActivityLog,
  User,
  JobDesignTime,
  JobItem,
  PaperMaster,
  ItemMaster,
} = models;
import { advanceStage } from "../../utils/jobFms/stageTracking.js";

// Get all jobs for Designers
export const getAllJobsForDesginer = async (req, res) => {
  try {
    const jobCards = await JobCard.findAndCountAll({
      where: {
        status: ["assigned_to_designer", "design_in_progress"],
      },
      include: [
        {
          model: JobAssignment,
          as: "assignments",
          where: { status: { [Op.in]: ["assigned", "in_progress"] } },
          required: false,
        },
        {
          model: JobItem,
          as: "items",
          include: [
            { model: PaperMaster, as: "selectedPaper" }, // <-- important
            { model: PaperMaster, as: "selectedCoverPaper" },
            { model: ItemMaster, as: "itemMaster" },
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.json({
      total: jobCards.count,
      data: jobCards.rows,
    });
  } catch (error) {
    console.error("Error fetching jobs for Process Coordinator:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const setEstimatedTime = async (req, res) => {
  console.log("setEstimatedTime called:");
  try {
    const { job_no, estimated_completion_time } = req.body;

    console.log("Estimated Completion Time:", estimated_completion_time);

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
    });

    console.log("Found Assignment:", assignment);

    if (!assignment) {
      return res.status(404).json({
        error: "No active assignment found",
      });
    }

    assignment.estimated_completion_time = estimated_completion_time;
    await assignment.save();
    console.log("Updated Assignment:", assignment);

    // Log Action
    await ActivityLog.create({
      job_no,
      performed_by_id: req.user?.id,
      action: "Set Estimated Time",
      meta: { estimated_completion_time },
    });

    res.json({
      message: "Estimated time set successfully",
      assignment,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to set estimated time",
    });
  }
};

// Designer's API to START TASK
export const designerStartTask = async (req, res) => {
  const t = await JobCard.sequelize.transaction();

  try {
    const { job_no } = req.params;

    const assignment = await JobAssignment.findOne({
      where: { job_no, status: "assigned" },
    });

    if (!assignment) {
      return res.status(404).json({ error: "No assignment found to start" });
    }

    assignment.status = "in_progress";
    assignment.designer_start_time = new Date();

    await JobDesignTime.create(
      {
        assignment_id: assignment.id,
        start_time: new Date(),
      },
      { transaction: t }
    );

    await assignment.save({ transaction: t });

    const job = await JobCard.findByPk(job_no);
    job.status = "design_in_progress";
    job.current_stage = "design_in_progress";
    await job.save({ transaction: t });

    // Track Stage
    await advanceStage({
      job_no,
      new_stage: "design_in_progress",
      performed_by_id: req.user?.id || null,
      started_at: new Date(),
      remarks: "( Designer ) Task started",
      transaction: t,
    });

    // Log Action
    await ActivityLog.create(
      {
        job_no,
        performed_by_id: req.user?.id || null,
        action: "Designer Start Task",
        meta: {assignment},
      },
      { transaction: t }
    );

    await t.commit();

    res.json({ message: "Task started", assignment });
  } catch (err) {
    await t.rollback();
    console.error(err);
    res.status(500).json({ error: "Failed to start task" });
  }
};

export const designerPauseTask = async (req, res) => {
  console.log("designerPauseTask called:");
  try {
    const { job_no } = req.params;

    const assignment = await JobAssignment.findOne({
      where: { job_no, status: "in_progress" },
    });

    if (!assignment) {
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
    });

    if (!jobDesignTimeLog) {
      return res.status(404).json({
        error: "No active design time log found",
      });
    }

    jobDesignTimeLog.end_time = new Date();
    jobDesignTimeLog.duration_seconds = Math.round(
      (new Date() - new Date(jobDesignTimeLog.start_time)) / 1000
    );
    assignment.designer_duration_seconds += jobDesignTimeLog.duration_seconds;
    assignment.is_paused = true;
    await assignment.save();
    await jobDesignTimeLog.save();

    await ActivityLog.create(
      {
        job_no,
        performed_by_id: req.user?.id || null,
        action: "Designer Pause Task",
      },
    );

    res.json({
      message: "Task paused",
      jobDesignTimeLog,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to pause task" });
  }
};

export const designerResumeTask = async (req, res) => {
  try {
    const { job_no } = req.params;

    const assignment = await JobAssignment.findOne({
      where: { job_no, status: "in_progress" },
    });

    if (!assignment) {
      return res.status(404).json({
        error: "No active task found",
      });
    }

    await JobDesignTime.create({
      assignment_id: assignment.id,
      start_time: new Date(),
    });

    assignment.is_paused = false;
    await assignment.save();

    await ActivityLog.create(
      {
        job_no,
        performed_by_id: req.user?.id || null,
        action: "Designer Resume Task",
      },
    );

    res.json({ message: "Task resumed" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to resume task" });
  }
};

// Designer API to END TASK
export const designerEndTask = async (req, res) => {
  const t = await JobCard.sequelize.transaction();

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
        (endTime - new Date(openLog.start_time)) / 1000
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
    await job.save({ transaction: t });

     // Track Stage
    await advanceStage({
      job_no,
      new_stage: "sent_for_approval",
      performed_by_id: req.user?.id || null,
      started_at: new Date(),
      remarks: "( Designer -> CRM ) Task completed and CRM has to send for approval",
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
      { transaction: t }
    );

    await t.commit();

    res.json({ message: "Task completed", assignment });
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
