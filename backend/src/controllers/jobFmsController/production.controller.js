import db from "../../models/index.js";
import { Op } from "sequelize";
import { advanceStage } from "../../utils/jobFms/stageTracking.js";
import { sendMailForFMS } from "../../email/sendMail.js";
import { DateTime } from "luxon";
import { orderConfirmationTemplate, crmJobAssignmentTemplate, coordinatorJobReviewTemplate } from "../../email/templates/emailTemplates.js";
import path from "path";


/**
 * GET ALL JOB CARDS FOR PRODUCTION (with pagination)
 */
// controllers/jobFms/productionController.js (or similar)

export const getJobsForProduction = async (req, res) => {
    console.log("getJobsForProduction called...");
  try {
    const { page = 1, limit = 50 } = req.query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const offset = (pageNum - 1) * limitNum;

    // 👇 Only jobs where stage = 'production'
    const whereClause = {
    //   stage: 'production',    // adjust field name if different
      // Optionally exclude cancelled/completed jobs
      status: { [Op.in]: ['production', 'approved'] }
    };

    const total = await db.JobCard.count({ where: whereClause });

    const jobCards = await db.JobCard.findAll({
      where: whereClause,
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
      limit: limitNum,
      offset,
      order: [["created_at", "DESC"]],
    });

    res.json({
      total,
      page: pageNum,
      limit: limitNum,
      data: jobCards,
    });
  } catch (error) {
    console.error("Error fetching production jobs:", error);
    return res.status(500).json({
      message: "Unable to fetch jobs. Please try again later.",
    });
  }
};




// Mark Job Order stage to Completed

export const orderComplete = async (req, res) => {
  console.log("orderComplete called");
  const t = await db.sequelize.transaction();

  try{
    const { job_no } = req.params;

    // 1. Validate job_no presence
    if (!job_no || typeof job_no !== 'string') {
      console.error("invalid job num: ", job_no);
      await t.rollback();
      return res.status(400).json({ message: "Invalid job number" });
    }


    // 2. Role-based access control (adjust role name as needed)
    const allowedDepartments = ['Admin', 'Process Coordinator', 'Production Coordinator'];
    if (!req.user || !allowedDepartments.includes(req.user.department)) {
      await t.rollback();
      return res.status(403).json({ message: "Unauthorized to complete jobs" });
    }

    // 3. Fetch job with row lock
    const job = await db.JobCard.findByPk(job_no, { 
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!job) {
      await t.rollback();
      return res.status(404).json({ message: "Job not found" });
    }

    if (job.status === "completed") {
      await t.rollback();
      return res.status(400).json({
        message: "Job already completed",
      });
    }

    // 🔥 Safety check
    if (!['production', 'approved'].includes(job.status)) {
      await t.rollback();
      return res.status(400).json({ message: "Only production jobs can be completed" });
    }


    // 🔥 Update status
    await job.update(
      {
        status: "completed",
        current_stage: "completed",
        completed_at: new Date(),
      },
      { transaction: t }
    );

    // Track Stage
    await advanceStage({
      job_no,
      new_stage: "completed",
      performed_by_id: req.user?.id || null,
      remarks: "(Production -> Completed)",
      transaction: t,
    });

        // Log Action
    await db.ActivityLog.create(
      {
        job_no,
        performed_by_id: req.user?.id,
        action: "Job Completed",
        meta: { source: "production_dashboard" },
      },
      { transaction: t }
    );

    await t.commit();

    return res.json({ message: "Job completed successfully" });
  }
  catch(error){
    await t.rollback();
    console.error("Error in completing job order:", error);
    return res.status(500).json({
      message: "Unable to complete job. Please try again later.",
    });
  }
}