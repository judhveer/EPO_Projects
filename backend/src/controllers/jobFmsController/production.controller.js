import db from "../../models/index.js";
import { Op } from "sequelize";
import { advanceStage } from "../../utils/jobFms/stageTracking.js";
import { sendMailForFMS } from "../../email/sendMail.js";
import { DateTime } from "luxon";
import { orderConfirmationTemplate, crmJobAssignmentTemplate, coordinatorJobReviewTemplate } from "../../email/templates/emailTemplates.js";
import path from "path";
import { v4 as uuidv4 } from "uuid";

import { uploadChallanToDrive, uploadMaterialPhotoToDrive } from "../../utils/jobFms/googleDriveUpload.js"

import {
  STAGE_LABELS,
  STAGES_REQUIRING_WORKERS,
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
      // separate:true runs a second query for workers instead of a JOIN —
      // avoids duplicate JobCard rows that hasMany JOINs cause.
      include: [
        {
          model: db.JobProductionStageWorker,
          as: "stageWorkers",
          attributes: ["stage_name", "worker_name", "worker_id"],
          required: false,
          separate: true,
          order: [["created_at", "ASC"]],
        },
        {
          model: db.DeliveryAssignment,
          as: "deliveryAssignments",
          attributes: ["id", "worker_name", "status", "challan_no", "confirmed_at"],
          required: false,
          separate: true,
        }
      ],
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

    const isPickup = isPickupDelivery(job.delivery_location);
    const isShipment = isShipmentDelivery(job.delivery_location);

    // Pickup jobs skip out_for_delivery entirely — drop it from forward options
    if (fromStage === "ready_to_dispatch" && isPickup) {
      forward = forward.filter((s) => s !== "out_for_delivery");
    }

    // For shipment in out_for_delivery, load assignment statuses
    let deliveryAssignments = [];
    if (isShipment && job.production_stage === "out_for_delivery") {
      deliveryAssignments = await db.DeliveryAssignment.findAll({
        where: { job_no },
        attributes: ["id", "worker_name", "status", "challan_no", "confirmed_at"],
        order: [["created_at", "ASC"]],
      });
    }


    return res.json({
      job_no: job.job_no,
      status: job.status,
      current_production_stage: job.production_stage,
      delivery_location: job.delivery_location,
      delivery_mode: isPickup ? "pickup" : isShipment ? "shipment" : "unknown",
      forward_stages: forward.map((s) => ({ value: s, label: STAGE_LABELS[s] })),
      reverse_stages: reverse.map((s) => ({ value: s, label: STAGE_LABELS[s] })),
      // Only pickup jobs can be manually marked delivered by coordinator
      can_mark_delivered:
        job.status === "in_production" &&
        isPickup &&
        job.production_stage === "ready_to_dispatch",
      // Shipment delivery assignments (empty for non-shipment or non-out_for_delivery)
      delivery_assignments: deliveryAssignments,
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
  try {
    ensureProductionRole(req);
    const { job_no } = req.params;
    const { to_stage, remarks, worker_ids = [] } = req.body || {};

    if (!job_no) throw Object.assign(new Error("Job number required"), { statusCode: 400 });
    if (!to_stage) throw Object.assign(new Error("to_stage is required"), { statusCode: 400 });
    if (!Array.isArray(worker_ids)) throw Object.assign(new Error("worker_ids must be an array"), { statusCode: 400 });

    // Validate worker_ids for stages requiring workers
    if (STAGES_REQUIRING_WORKERS.includes(to_stage) && worker_ids.length === 0) {
      throw Object.assign(
        new Error(`At least one worker is required for ${STAGE_LABELS[to_stage]}.`),
        { statusCode: 400 }
      );
    }

    // For out_for_delivery, worker_ids are delivery workers
    if (to_stage === "out_for_delivery" && worker_ids.length === 0) {
      throw Object.assign(
        new Error("At least one delivery worker is required."),
        { statusCode: 400 }
      );
    }

    const job = await db.JobCard.findByPk(job_no, { transaction: t, lock: t.LOCK.UPDATE });
    if (!job) throw Object.assign(new Error("Job not found"), { statusCode: 404 });

    if (!["ready_for_production", "in_production"].includes(job.status)) {
      throw Object.assign(
        new Error(`Cannot advance: job is "${job.status}", not in production phase.`),
        { statusCode: 400 }
      );
    }

    const fromStage = job.status === "ready_for_production" ? null : job.production_stage;
    assertForwardTransition(fromStage, to_stage);

    if (to_stage === "out_for_delivery" && !isShipmentDelivery(job.delivery_location)) {
      throw Object.assign(
        new Error(`Cannot enter Out for Delivery: job is pickup-based.`),
        { statusCode: 400 }
      );
    }

    // Fetch selected workers from master (validates IDs and gets names/emails)
    let selectedWorkers = [];
    if (worker_ids.length > 0) {
      selectedWorkers = await db.ProductionWorkerMaster.findAll({
        where: { id: worker_ids, is_active: true },
        transaction: t,
      });
      if (selectedWorkers.length !== worker_ids.length) {
        throw Object.assign(
          new Error("One or more selected workers not found or inactive."),
          { statusCode: 400 }
        );
      }
      // Validate roles match the stage
      if (to_stage !== "out_for_delivery") {
        const wrongRole = selectedWorkers.find((w) => w.role !== to_stage);
        if (wrongRole) {
          throw Object.assign(
            new Error(`Worker ${wrongRole.worker_code}-${wrongRole.name} does not have role "${to_stage}".`),
            { statusCode: 400 }
          );
        }
      } else {
        const wrongRole = selectedWorkers.find((w) => w.role !== "delivery");
        if (wrongRole) {
          throw Object.assign(
            new Error(`Worker ${wrongRole.worker_code}-${wrongRole.name} is not a delivery worker.`),
            { statusCode: 400 }
          );
        }
        // Delivery workers must have email
        const noEmail = selectedWorkers.find((w) => !w.email);
        if (noEmail) {
          throw Object.assign(
            new Error(`Delivery worker ${noEmail.worker_code}-${noEmail.name} has no email address. Update their profile first.`),
            { statusCode: 400 }
          );
        }
      }
    }

    const updates = {
      status: "in_production",
      current_stage: "in_production",
      production_stage: to_stage,
      production_stage_started_at: new Date(),
    };

    await job.update(updates, { transaction: t });

    // Save stage workers for non-delivery stages
    if (STAGES_REQUIRING_WORKERS.includes(to_stage) && selectedWorkers.length > 0) {
      await db.JobProductionStageWorker.bulkCreate(
        selectedWorkers.map((w) => ({
          job_no,
          stage_name: to_stage,
          worker_name: `${w.worker_code}-${w.name}`,
          worker_id: w.id,
          recorded_by_id: req.user?.id || null,
        })),
        { transaction: t }
      );
    }

    // Create delivery assignments for out_for_delivery
    if (to_stage === "out_for_delivery" && selectedWorkers.length > 0) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000); // 4 days

      const assignments = await db.DeliveryAssignment.bulkCreate(
        selectedWorkers.map((w) => ({
          job_no,
          worker_id: w.id,
          worker_name: `${w.worker_code}-${w.name}`,
          worker_email: w.email,
          upload_token: uuidv4(),
          token_expires_at: expiresAt,
          status: "pending",
          assigned_by_id: req.user?.id || null,
        })),
        { transaction: t, returning: true }
      );

      // Update delivery_persons_name on JobCard for quick display
      await job.update(
        { delivery_persons_name: selectedWorkers.map((w) => `${w.worker_code}-${w.name}`).join(", ") },
        { transaction: t }
      );

      // Commit first so assignments exist in DB before sending emails
      await advanceStage({
        job_no,
        new_stage: to_stage,
        performed_by_id: req.user?.id || null,
        remarks: `(Production → ${STAGE_LABELS[to_stage]})${remarks ? ": " + remarks.trim() : ""}`,
        transaction: t,
      });

      await db.ActivityLog.create(
        {
          job_no,
          action: "production_stage_advanced",
          performed_by_id: req.user?.id || null,
          meta: {
            from_stage: fromStage,
            to_stage,
            delivery_workers: selectedWorkers.map((w) => w.worker_code + "-" + w.name),
            remarks: remarks?.trim() || null,
          },
        },
        { transaction: t }
      );

      await t.commit();

      // Send emails after commit (fire-and-forget)
      const frontendUrl = process.env.LEADS_URL || process.env.LEADS_URL;
      for (const assignment of assignments) {
        const worker = selectedWorkers.find((w) => w.id === assignment.worker_id);
        const uploadLink = `${frontendUrl}/delivery/confirm/${assignment.upload_token}`;
        const expiryStr = new Date(assignment.token_expires_at).toLocaleDateString("en-IN", {
          day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
        });

        sendMailForFMS({
          to: worker.email,
          subject: `Delivery Assignment — Job #${job_no} | ${job.client_name}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#333">
              <h2 style="color:#1d4ed8">📦 Delivery Assignment</h2>
              <p>Hello <strong>${worker.worker_code}-${worker.name}</strong>,</p>
              <p>You have been assigned to deliver the following order:</p>
              <table style="border-collapse:collapse;width:100%;font-size:14px">
                <tr><td style="padding:6px 12px;border:1px solid #e5e7eb;font-weight:bold">Job No</td><td style="padding:6px 12px;border:1px solid #e5e7eb">${job_no}</td></tr>
                <tr><td style="padding:6px 12px;border:1px solid #e5e7eb;font-weight:bold">Client</td><td style="padding:6px 12px;border:1px solid #e5e7eb">${job.client_name}</td></tr>
                <tr><td style="padding:6px 12px;border:1px solid #e5e7eb;font-weight:bold">Delivery Location</td><td style="padding:6px 12px;border:1px solid #e5e7eb">${job.delivery_location?.replace(/_/g," ")}</td></tr>
                ${job.delivery_address ? `<tr><td style="padding:6px 12px;border:1px solid #e5e7eb;font-weight:bold">Address</td><td style="padding:6px 12px;border:1px solid #e5e7eb">${job.delivery_address}</td></tr>` : ""}
              </table>
              <p style="margin-top:20px">After delivering, please upload the challan using the link below:</p>
              <p style="text-align:center;margin:24px 0">
                <a href="${uploadLink}" style="background:#16a34a;color:white;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:15px">
                  Upload Challan &amp; Confirm Delivery
                </a>
              </p>
              <p style="color:#dc2626;font-size:13px">⚠️ This link expires on <strong>${expiryStr}</strong>. Do not share this link.</p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0"/>
              <p style="color:#6b7280;font-size:12px">— Eastern Panorama Offset Production Team</p>
            </div>
          `,
        }).then(() => {
          db.DeliveryAssignment.update(
            { email_sent: true, email_sent_at: new Date() },
            { where: { id: assignment.id } }
          );
        }).catch((emailErr) => {
          console.error(`[email-fail] Delivery assignment email failed for worker ${worker.email}:`, emailErr.message);
        });
      }

      return res.json({
        message: `Stage advanced to ${STAGE_LABELS[to_stage]}. Emails sent to ${selectedWorkers.length} delivery worker(s).`,
        job_no,
        production_stage: to_stage,
      });
    }

    // Non-delivery stage commit
    await advanceStage({
      job_no,
      new_stage: to_stage,
      performed_by_id: req.user?.id || null,
      remarks: `(Production → ${STAGE_LABELS[to_stage]})${remarks ? ": " + remarks.trim() : ""}`,
      transaction: t,
    });

    await db.ActivityLog.create(
      {
        job_no,
        action: "production_stage_advanced",
        performed_by_id: req.user?.id || null,
        meta: {
          from_stage: fromStage,
          to_stage,
          workers: selectedWorkers.map((w) => `${w.worker_code}-${w.name}`),
          remarks: remarks?.trim() || null,
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
  } catch (error) {
    await t.rollback().catch(() => {});
    return respondToError(res, error, "Failed to advance stage.");
  }
};



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
    const { to_stage, remarks, worker_ids = [], } = req.body;

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

    if(!Array.isArray(worker_ids)){
      throw Object.assign(new Error("worker_ids must be an array of IDs"), { statusCode: 400 });
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


    // Inside revertProductionStage, REPLACE the worker handling section:
    let selectedWorkers = [];
    if (STAGES_REQUIRING_WORKERS.includes(to_stage) && worker_ids.length > 0) {
      selectedWorkers = await db.ProductionWorkerMaster.findAll({
        where: { 
          id: worker_ids, 
          is_active: true 
        },
        transaction: t,
      });
    }

    // Then in bulkCreate:
    if (STAGES_REQUIRING_WORKERS.includes(to_stage) && selectedWorkers.length > 0) {
      await db.JobProductionStageWorker.bulkCreate(
        selectedWorkers.map((w) => ({
          job_no,
          stage_name: to_stage,
          worker_name: `${w.worker_code}-${w.name}`,
          worker_id: w.id,
          recorded_by_id: req.user?.id || null,
        })),
        { transaction: t }
      );
    }

    

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
          workers: selectedWorkers.map((w) => `${w.worker_code}-${w.name}`),
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



/**
 * GET /api/fms/production/:job_no/stage-workers
 * Returns distinct worker names grouped by stage for a job.
 * Used to pre-populate the worker input when reverting a stage.
 */
export const getStageWorkersForJob = async (req, res) => {
  try {
    ensureProductionRole(req);
    const { job_no } = req.params;

    const rows = await db.JobProductionStageWorker.findAll({
      where: { job_no },
      attributes: ["stage_name", "worker_name", "worker_id", "created_at"],
      order: [["created_at", "DESC"]],
    });

    // Group by stage. Deduplicate names case-insensitively,
    // keeping the most recent spelling if the same person appears multiple times.
    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.stage_name]) {
        grouped[row.stage_name] = [];
      }

      const exists = grouped[row.stage_name].some(
        (n) => n.worker_id === row.worker_id || n.name.toLowerCase() === row.worker_name.toLowerCase()
      );

      if (!exists) {
        grouped[row.stage_name].push({ name: row.worker_name, worker_id: row.worker_id });
      }
    }

    return res.json(grouped);
  } catch (error) {
    return respondToError(res, error, "Failed to fetch stage workers.");
  }
};





/**
 * POST /api/fms/production/:job_no/delivery-assignments/:assignment_id/override
 * Coordinator manually marks one assignment as done when delivery person is unreachable.
 */
export const overrideDeliveryAssignment = async (req, res) => {
  const { job_no, assignment_id } = req.params;
  const { override_reason, challan_no } = req.body || {};
  const challanFile = req.files?.["challan_file"]?.[0];
  const materialFile = req.files?.["material_photo"]?.[0];

  let uploadedChallanLink = null;
  let uploadedMaterialLink = null;

  try {
    ensureProductionRole(req);

    if (!override_reason?.trim()) {
      throw Object.assign(
        new Error("Override reason is required."), 
        { statusCode: 400 }
      );
    }

    if (!challan_no?.trim()) {
      throw Object.assign(
        new Error("Challan number is required."), 
        { statusCode: 400 }
      );
    }

    if (!challanFile) {
      throw Object.assign(
        new Error("Challan file is required."), 
        { statusCode: 400 }
      );
    }

    // Pre-flight read — no lock yet, file uploads happen before transaction
    const assignment = await db.DeliveryAssignment.findOne({
      where: { 
        id: assignment_id, 
        job_no 
      },
    });

    if (!assignment) {
      throw Object.assign(
        new Error("Assignment not found."), 
        { statusCode: 404 }
      );
    }

    if (assignment.status !== "pending") {
      throw Object.assign(
        new Error("Assignment is already confirmed or overridden."), 
        { statusCode: 400 }
      );
    }

    // ── Upload challan (required) ──────────────────────────────────────────
    const { web_view_link: challanLink } = await uploadChallanToDrive({
      buffer: challanFile.buffer,
      filename: challanFile.originalname,
      mimeType: challanFile.mimetype,
      job_no,
    });
    uploadedChallanLink = challanLink;

    // ── Upload material photo (optional) ───────────
    if (materialFile) {
      try {
        const { web_view_link: photoLink } = await uploadMaterialPhotoToDrive({
          buffer: materialFile.buffer,
          filename: materialFile.originalname,
          mimeType: materialFile.mimetype,
          job_no,
        });
        uploadedMaterialLink = photoLink;
      } catch (photoErr) {
        console.error(
          `[material-photo] Override upload failed for job ${job_no}: ${photoErr.message}`
        );
        // Non-fatal — continue without material photo
      }
    }

    // ── DB transaction ────────────
    const t = await db.sequelize.transaction();
    try{
      // Re-fetch with lock for safe concurrent update
      const lockedAssignment = await db.DeliveryAssignment.findOne({
        where: { 
          id: assignment_id, 
          job_no 
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!lockedAssignment) {
        throw Object.assign(
          new Error("Assignment not found."), 
          { statusCode: 404 }
        );
      }
      if (lockedAssignment.status !== "pending") {
        throw Object.assign(
          new Error("Assignment was already actioned by someone else."),
          { statusCode: 400 }
        );
      }

      await lockedAssignment.update(
        {
          challan_no: challan_no.trim(),
          challan_file_url: uploadedChallanLink,
          material_photo_url: uploadedMaterialLink,
          status: "overridden",
          overridden_by_id: req.user?.id || null,
          overridden_at: new Date(),
          override_reason: override_reason.trim(),
        },
        { transaction: t }
      );

      await db.ActivityLog.create(
        {
          job_no,
          action: "delivery_assignment_overridden",
          performed_by_id: req.user?.id || null,
          meta: { 
            assignment_id, 
            worker_name: lockedAssignment.worker_name, 
            override_reason: override_reason.trim(),
            challan_no: challan_no.trim(),
            challan_file_url: uploadedChallanLink,
            material_photo_url: uploadedMaterialLink, 
          },
        },
        { transaction: t }
      );

      // Check if all assignments are now done
      const pendingCount = await db.DeliveryAssignment.count({
        where: { job_no, status: "pending" },
        transaction: t,
      });

      if (pendingCount === 0) {
        const job = await db.JobCard.findByPk(job_no, { 
            transaction: t, 
            lock: t.LOCK.UPDATE 
        });

        if (job && job.status === "in_production") {
          await job.update({ 
            status: "delivered", 
            current_stage: "delivered", 
            production_stage: null, 
            delivered_at: new Date() 
          },
            { transaction: t }
          );
          await db.ActivityLog.create(
            {
              job_no,
              action: "job_delivered",
              performed_by_id: req.user?.id || null,
              meta: { 
                mode: "shipment", 
                triggered_by: "coordinator_override_completed_all" 
              },
            },
            { transaction: t }
          );
        }
      }

      await t.commit();
      return res.json({
        message: "Assignment overridden successfully.",
        all_confirmed: pendingCount === 0,
      });

    }
    catch (dbErr){
      await t.rollback().catch( () => {});
      if (uploadedChallanLink) {
        console.error(
          `[orphan-challan] Override DB rollback. Job=${job_no}, Assignment=${assignment_id}, Link=${uploadedChallanLink}`
        );
      }
      if (uploadedMaterialLink) {
        console.error(
          `[orphan-material] Override DB rollback. Job=${job_no}, Assignment=${assignment_id}, Link=${uploadedMaterialLink}`
        );
      }
      throw dbErr;
    }

  } catch (error) {
    return respondToError(res, error, "Failed to override assignment.");
  }
};



