import db from "../../models/index.js";
import { Op } from "sequelize";
import { advanceStage } from "../../utils/jobFms/stageTracking.js";
import { sendMailForFMS } from "../../email/sendMail.js";
import { DateTime } from "luxon";
import { orderConfirmationTemplate, crmJobAssignmentTemplate, coordinatorJobReviewTemplate } from "../../email/templates/emailTemplates.js";
import path from "path";

import { uploadChallanToDrive } from "../../utils/jobFms/googleDriveUpload.js"

import {
  STAGE_LABELS,
  assertForwardTransition,
  assertReverseTransition,
  getValidForwardStages,
  getValidReverseStages,
  isPickupDelivery,
  isShipmentDelivery,
  StageTransitionError,
} from "../../utils/jobFms/productionTransitions.js"

const { JobCard, ActivityLog } = db;


// ──────────────────────────────────────────────────────────────────────
// Role guard — production dashboard is owned by Production Coordinator.
// Admin is allowed for support / oversight.
// ──────────────────────────────────────────────────────────────────────
const ALLOWED_DEPARTMENTS = ["Admin", "Production Coordinator"];

function ensureProductionRole(req) {
  if (!req.user || !ALLOWED_DEPARTMENTS.includes(req.user.department)) {
    const err = new Error("Only Production Coordinator can perform this action.");
    err.statusCode = 403;
    throw err;
  }
}

// Reusable error responder — keeps controllers DRY.
function respondToError(res, error, fallbackMsg) {
  const status = error.statusCode || (error instanceof StageTransitionError ? 422 : 500);
  if (status >= 500) console.error(fallbackMsg, error);
  return res.status(status).json({ message: error.message || fallbackMsg });
}


// ══════════════════════════════════════════════════════════════════════
//  PRODUCTION PIPELINE DASHBOARD (Tab 1)
// ══════════════════════════════════════════════════════════════════════
/**
 * GET /api/fms/production
 * Lists jobs visible on the Production Pipeline dashboard.
 * Filters: optional ?stage=<production_stage> to narrow by sub-stage.
 */


export const getJobsForProduction = async (req, res) => {
    console.log("getJobsForProduction called...");
  try {
    const { page = 1, limit = 50, stage } = req.query;
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const offset = (pageNum - 1) * limitNum;

    const where = {
      status: { [Op.in]: ["ready_for_production", "in_production"] },
    };
    if (stage) where.production_stage = stage;

    const total = await JobCard.count({ where });

    const jobCards = await JobCard.findAll({
      where,
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
    return respondToError(res, error, "Unable to fetch production jobs.");
  }
};


/**
 * GET /api/fms/production/:job_no/valid-stages
 * Tells the frontend exactly which forward and reverse stages are valid
 * RIGHT NOW for this job. Powers the contextual stage dropdown.
 */
export const getValidStagesForJob = async (req, res) => {
  try{
    ensureProductionRole(req);
    const { job_no } = req.params;
    
    const job = await JobCard.findByPk(job_no, {
      attributes: ["job_no", "status", "production_stage", "delivery_location"],
    });

    if (!job) {
      return res.status(404).json({ 
        message: "Job not found" 
      });
    }
    // Treat ready_for_production as "stage = null" for transition lookup
    const fromStage = job.status === "ready_for_production" ? null : job.production_stage;
    let forward = getValidForwardStages(fromStage);

    const reverse = job.status === "in_production" ? getValidReverseStages(fromStage) : [];

    // Pickup jobs skip out_for_delivery entirely — drop it from forward options
    if (fromStage === "ready_to_dispatch" && isPickupDelivery(job.delivery_location)) {
      forward = forward.filter((s) => s !== "out_for_delivery");
    }

    const isPickup = isPickupDelivery(job.delivery_location);
    const isShipment = isShipmentDelivery(job.delivery_location);

    return res.json({
      job_no: job.job_no,
      status: job.status,
      current_production_stage: job.production_stage,
      delivery_location: job.delivery_location,
      delivery_mode: isPickup ? "pickup" : isShipment ? "shipment" : "unknown",
      forward_stages: forward.map((s) => ({ value: s, label: STAGE_LABELS[s] })),
      reverse_stages: reverse.map((s) => ({ value: s, label: STAGE_LABELS[s] })),
      can_mark_delivered:
        job.status === "in_production" &&
        ((isPickup && job.production_stage === "ready_to_dispatch") ||
          (isShipment && job.production_stage === "out_for_delivery")),
    });

  }
  catch (error) {
    return respondToError(res, error, "Failed to fetch valid stages.");
  }
}


/**
 * POST /api/fms/production/:job_no/advance-stage
 * Body: { to_stage, remarks?, delivery_persons_name? }
 *
 * Forward-moves a job through production. Handles BOTH:
 *   - First stage entry (ready_for_production -> in_production with stage set)
 *   - Subsequent stage transitions within in_production
 *
 * Entering out_for_delivery requires delivery_persons_name AND a shipment delivery_location.
 */
export const advanceProductionStage = async (req, res) => {
  const t = await db.sequelize.transaction();
  try{
    ensureProductionRole(req);
    const { job_no } = req.params;
    const { to_stage, remarks, delivery_persons_name } = req.body;

    if (!job_no) {
      throw Object.assign(
        new Error("Job number required"), 
        { statusCode: 400 }
      );
    }
    if (!to_stage) {
      throw Object.assign(
        new Error("to_stage is required"), 
        { statusCode: 400 }
      );
    }

    const job = await JobCard.findByPk(job_no, 
      { 
        transaction: t, 
        lock: t.LOCK.UPDATE 
      });

    if (!job) { 
      throw Object.assign(
        new Error("Job not found"), 
        { statusCode: 404 }
      );
    }

    if (!["ready_for_production", "in_production"].includes(job.status)) {
      throw Object.assign(
        new Error(`Cannot advance: job is "${job.status}", not in production phase.`),
        { statusCode: 400 }
      );
    }

    const fromStage = job.status === "ready_for_production" ? null : job.production_stage;
    
    assertForwardTransition(fromStage, to_stage);

    // out_for_delivery has extra preconditions
    if (to_stage === "out_for_delivery") {
      if (!isShipmentDelivery(job.delivery_location)) {
        throw Object.assign(
          new Error(
            `Cannot enter Out for Delivery: this job is pickup-based (${job.delivery_location}). Use "Mark Delivered" instead.`
          ),
          { statusCode: 400 }
        );
      }
      if (!delivery_persons_name?.trim()) {
        throw Object.assign(
          new Error("Delivery person name is required to enter Out for Delivery."),
          { statusCode: 400 }
        );
      }
    }

    const updates = {
      status: "in_production",
      current_stage: "in_production",
      production_stage: to_stage,
      production_stage_started_at: new Date(),
    };
    if (to_stage === "out_for_delivery") {
      updates.delivery_persons_name = delivery_persons_name.trim();
    }

    await job.update(updates, { transaction: t });

    await advanceStage({
      job_no,
      new_stage: to_stage,
      performed_by_id: req.user?.id || null,
      remarks: `(Production → ${STAGE_LABELS[to_stage]})${remarks ? ": " + remarks.trim() : ""}`,
      transaction: t,
    });

    await ActivityLog.create(
      {
        job_no,
        action: "production_stage_advanced",
        performed_by_id: req.user?.id || null,
        meta: {
          from_stage: fromStage,
          to_stage,
          remarks: remarks?.trim() || null,
          ...(to_stage === "out_for_delivery"
            ? { delivery_persons_name: delivery_persons_name.trim() }
            : {}),
        },
      },
      { transaction: t }
    );

    await t.commit();
    return res.json({
      message: `Stage advanced to ${STAGE_LABELS[to_stage]}.`,
      job_no,
      production_stage: to_stage,
    });
  }
  catch(error){
    await t.rollback().catch(() => {});
    return respondToError(res, error, "Failed to advance stage.");
  }
}



/**
 * POST /api/fms/production/:job_no/revert-stage
 * Body: { to_stage, remarks }
 *
 * Reverse stage movement. Only allowed within in_production. Remarks REQUIRED.
 */

export const revertProductionStage = async (req, res) => {
  const t = await db.sequelize.transaction();
  try{
    ensureProductionRole(req);
    const { job_no } = req.params;
    const { to_stage, remarks } = req.body;

    if (!job_no) { 
      throw Object.assign(
        new Error("Job number required"), 
        { statusCode: 400 }
      );
    }
    if (!to_stage) {
      throw Object.assign(
        new Error("to_stage is required"), 
        { statusCode: 400 }
      );
    }

    if (!remarks?.trim()) {
      throw Object.assign(new Error("Remarks are required for stage reverts."), {
        statusCode: 400,
      });
    }

    const job = await JobCard.findByPk(job_no, { transaction: t, lock: t.LOCK.UPDATE });
    if (!job) {
      throw Object.assign(
        new Error("Job not found"), 
        { statusCode: 404 }
      );
    }

    if (job.status !== "in_production") {
      throw Object.assign(
        new Error("Reverse movement is only allowed when the job is in production."),
        { statusCode: 400 }
      );
    }

    const fromStage = job.production_stage;
    assertReverseTransition(fromStage, to_stage);

    const updates = {
      production_stage: to_stage,
      production_stage_started_at: new Date(),
    };

    // If reverting out of out_for_delivery, clear the delivery person name
    if (fromStage === "out_for_delivery") {
      updates.delivery_persons_name = null;
    }

    await job.update(updates, { transaction: t });
    await advanceStage({
      job_no,
      new_stage: to_stage,
      performed_by_id: req.user?.id || null,
      remarks: `(Reverted ${STAGE_LABELS[fromStage]} → ${STAGE_LABELS[to_stage]}): ${remarks.trim()}`,
      transaction: t,
    });

    await ActivityLog.create(
      {
        job_no,
        action: "production_stage_reverted",
        performed_by_id: req.user?.id || null,
        meta: {
          from_stage: fromStage,
          to_stage,
          remarks: remarks.trim(),
        },
      },
      { transaction: t }
    );

    await t.commit();
    return res.json({
      message: `Stage reverted to ${STAGE_LABELS[to_stage]}.`,
      job_no,
      production_stage: to_stage,
    });

  }
  catch (error) {
    await t.rollback().catch(() => {});
    return respondToError(res, error, "Failed to revert stage.");
  }
}


/**
 * POST /api/fms/production/:job_no/mark-delivered
 * Body: { remarks? }
 *
 * Final action on the production dashboard. Moves job to status='delivered'
 * (it then disappears from production table and appears in Completion tab).
 *
 *   - Pickup: must currently be in ready_to_dispatch
 *   - Shipment: must currently be in out_for_delivery
 */
export const markJobDelivered = async (req, res) => {
  const t = await db.sequelize.transaction();
  try{
    ensureProductionRole(req);
    const { job_no } = req.params;
    const { remarks } = req.body || {};

    if (!job_no) { 
      throw Object.assign(
        new Error("Job number required"), 
        { statusCode: 400 }
      );
    }

    const job = await JobCard.findByPk(job_no, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if(!job) {
      throw Object.assign(
        new Error("Job not found"), 
        { statusCode: 404 }
      );
    }

    if (job.status !== "in_production") {
      throw Object.assign(
        new Error(`Cannot mark delivered: job is "${job.status}", not in production.`),
        { statusCode: 400 }
      );
    }

    const isPickup = isPickupDelivery(job.delivery_location);
    const isShipment = isShipmentDelivery(job.delivery_location);

    if (isPickup) {
      if (job.production_stage !== "ready_to_dispatch") {
        throw Object.assign(
          new Error(
            `Cannot mark delivered (pickup): job must be in "Ready to Dispatch" (current: ${STAGE_LABELS[job.production_stage] || "none"}).`
          ),
          { statusCode: 400 }
        );
      }
    } else if (isShipment) {
      if (job.production_stage !== "out_for_delivery") {
        throw Object.assign(
          new Error(
            `Cannot mark delivered (shipment): job must be in "Out for Delivery" (current: ${STAGE_LABELS[job.production_stage] || "none"}).`
          ),
          { statusCode: 400 }
        );
      }
    } else {
      throw Object.assign(
        new Error(`Invalid delivery_location: ${job.delivery_location}`),
        { statusCode: 400 }
      );
    }

    await job.update(
      {
        status: "delivered",
        current_stage: "delivered",
        production_stage: null, // clear sub-stage on phase transition
        delivered_at: new Date(),
      },
      { transaction: t }
    );

    await advanceStage({
      job_no,
      new_stage: "delivered",
      performed_by_id: req.user?.id || null,
      remarks: `(${isPickup ? "Pickup" : "Shipment"} → Delivered)${remarks ? ": " + remarks.trim() : ""}`,
      transaction: t,
    });

    await ActivityLog.create(
      {
        job_no,
        action: "job_delivered",
        performed_by_id: req.user?.id || null,
        meta: {
          mode: isPickup ? "pickup" : "shipment",
          remarks: remarks?.trim() || null,
        },
      },
      { transaction: t }
    );

    await t.commit();
    return res.json({ 
      message: "Job marked as delivered.", job_no 
    });
  }
  catch(error){
    await t.rollback().catch(() => {});
    return respondToError(res, error, "Failed to mark job as delivered.");
  }
}



// ══════════════════════════════════════════════════════════════════════
//  COMPLETION TAB (Tab 2)
//  Owned by the same role (Production Coordinator) but on a separate UI.
// ══════════════════════════════════════════════════════════════════════

/**
 * GET /api/fms/production/completion-list
 * All jobs in status='delivered' awaiting final completion.
 */

export const getDeliveredJobs = async (req, res) => {
  try{
    ensureProductionRole(req);

    const { page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const offset = (pageNum - 1) * limitNum;

    const where = { status: "delivered" };

    const total = await JobCard.count({ where });
    const data = await JobCard.findAll({
      where,
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
      order: [["delivered_at", "DESC"]],
    });
    return res.json({ 
      total, 
      page: pageNum, 
      limit: limitNum, 
      data 
    });
  }
  catch (error) {
    return respondToError(res, error, "Failed to fetch delivered jobs.");
  }
}



/**
 * POST /api/fms/production/:job_no/complete
 * Content-Type: multipart/form-data
 *
 * Body fields (form-data):
 *   - challan_no        (string, required if shipment)
 *   - remarks           (string, optional)
 *   - challan_file      (file, required if shipment)
 *
 * Flow:
 *   1. Validate role + job state (outside transaction, no lock held during Drive upload)
 *   2. If shipment: upload challan_file to Google Drive, get webViewLink
 *   3. Start DB transaction with row lock, re-validate state (defensive — another
 *      coordinator might have moved the job in the meantime)
 *   4. Persist completion + log
 *
 * If step 4 fails after step 2 succeeded, the Drive file is orphaned.
 * The orphan filename embeds the job_no for future cleanup.
 */


export const orderComplete = async (req, res) => {
  // Read multipart-parsed fields (multer fills req.body and req.file)
  const { job_no } = req.params;
  const { challan_no, remarks } = req.body || {};
  const file = req.file; // multer middleware should have processed the file upload // populated by multer's upload.single("challan_file")

  let uploadedDriveLink = null; // for orphan logging if DB later fails

  try{
    ensureProductionRole(req);
  

    if (!job_no){
      throw Object.assign(
        new Error("Job number required"), 
        { statusCode: 400 }
      );
    }

    // ── Pre-flight read (no lock) ─────
    const preJob = await JobCard.findByPk(job_no, {
      attributes: ["job_no", "status", "delivery_location"],
    });

    console.log("Pre-flight job fetch:", preJob ? preJob.toJSON() : "not found");

    if (!preJob) {
      throw Object.assign(
        new Error("Job not found"), 
        { statusCode: 404 }
      );
    }

    if (preJob.status !== "delivered") {
      throw Object.assign(
        new Error(`Cannot complete: job is "${preJob.status}", not delivered.`),
        { statusCode: 400 }
      );
    }

    const isShipment = isShipmentDelivery(preJob.delivery_location);
    const isPickup = isPickupDelivery(preJob.delivery_location);

    // ── Shipment-only required fields ─────
    if (isShipment) {
      if (!challan_no?.trim()) {
        throw Object.assign(
          new Error("Challan number is required for shipment-based completion."),
          { statusCode: 400 }
        );
      }
      if (!file) {
        throw Object.assign(
          new Error("Challan file is required for shipment-based completion."),
          { statusCode: 400 }
        );
      }
    }

    // ── Upload to Drive BEFORE transaction (slow external call) ───
    if(isShipment){
      const { web_view_link } = await uploadChallanToDrive({
        buffer: file.buffer,
        filename: file.originalname,
        mimeType: file.mimetype,
        job_no,
      });
      uploadedDriveLink = web_view_link;
    }

    // ── DB transaction with re-validation under row lock ──
    const t = await db.sequelize.transaction();
    try{
      const job = await JobCard.findByPk(job_no, { transaction: t, lock: t.LOCK.UPDATE });
      if (!job) {
        throw Object.assign(
          new Error("Job not found"), 
          { statusCode: 404 }
        );
      }

      // Defensive re-check — status might have changed since pre-flight
      if (job.status !== "delivered") {
        throw Object.assign(
          new Error(`Cannot complete: job is "${job.status}", not delivered.`),
          { statusCode: 400 }
        );
      }

      const updates = {
        status: "completed",
        current_stage: "completed",
        completed_at: new Date(),
      };

      if (isShipment) {
        updates.challan_no = challan_no.trim();
        updates.challan_file_url = uploadedDriveLink;
      }
      
      await job.update(updates, { transaction: t });

      await advanceStage({
        job_no,
        new_stage: "completed",
        performed_by_id: req.user?.id || null,
        remarks: `(${isPickup ? "Pickup" : "Shipment"} → Completed)${remarks ? ": " + remarks.trim() : ""}`,
        transaction: t,
      });

      await ActivityLog.create(
        {
          job_no,
          action: "job_completed",
          performed_by_id: req.user?.id || null,
          meta: {
            mode: isPickup ? "pickup" : "shipment",
            challan_no: isShipment ? challan_no.trim() : null,
            challan_file_url: uploadedDriveLink,
            remarks: remarks?.trim() || null,
          },
        },
        { transaction: t }
      );

      await t.commit();
      return res.json({
        message: "Job completed successfully.",
        job_no,
        challan_file_url: uploadedDriveLink,
      });

    }
    catch(dbErr){
      await t.rollback().catch(() => {});
      if(uploadedDriveLink){
        // File uploaded but DB write failed → log clearly for manual cleanup
        console.error(
          `[orphan-challan] DB rollback after Drive upload. Job=${job_no}, link=${uploadedDriveLink}`
        );
      }
      throw dbErr; // re-throw to be caught by outer handler
    }
  }
  catch(error){
    return respondToError(res, error, "Failed to complete job.");
  }
}