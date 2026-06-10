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
//  GET /api/fms/production
//  CHANGED: stageWorkers now includes status, started_at, completed_at
//           so ProductionTable can show "X/Y done" summary per job.
// ═════════
export const getJobsForProduction = async (req, res) => {
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
      include: [
        {
          model: db.JobProductionStageWorker,
          as: "stageWorkers",
          // CHANGED: added id, status, started_at, completed_at for worker status display
          attributes: [
            "id",
            "stage_name",
            "worker_name",
            "worker_id",
            "status",
            "started_at",
            "completed_at",
          ],
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
        },
      ],
      limit: limitNum,
      offset,
      order: [["created_at", "DESC"]],
    });

    res.json({ total, page: pageNum, limit: limitNum, data: jobCards });
  } catch (error) {
    return respondToError(res, error, "Unable to fetch production jobs.");
  }
};


// ══════════════════════════════════════════════════════════════════════
//  GET /api/fms/production/:job_no/valid-stages
//  CHANGED: now returns stage_worker_summary so coordinator can see
//           who is done / not done before deciding to advance.
// ═══════════════
export const getValidStagesForJob = async (req, res) => {
  try {
    ensureProductionRole(req);
    const { job_no } = req.params;

    const job = await JobCard.findByPk(job_no, {
      attributes: ["job_no", "status", "production_stage", "delivery_location"],
    });

    if (!job) return res.status(404).json({ message: "Job not found" });

    const fromStage =
      job.status === "ready_for_production" ? null : job.production_stage;
    let forward = getValidForwardStages(fromStage);
    const reverse =
      job.status === "in_production" ? getValidReverseStages(fromStage) : [];

    const isPickup = isPickupDelivery(job.delivery_location);
    const isShipment = isShipmentDelivery(job.delivery_location);

    if (fromStage === "ready_to_dispatch" && isPickup) {
      forward = forward.filter((s) => s !== "out_for_delivery");
    }

    // Load delivery assignment statuses for out_for_delivery shipment jobs
    let deliveryAssignments = [];
    if (isShipment && job.production_stage === "out_for_delivery") {
      deliveryAssignments = await db.DeliveryAssignment.findAll({
        where: { job_no },
        attributes: ["id", "worker_name", "status", "challan_no", "confirmed_at"],
        order: [["created_at", "ASC"]],
      });
    }

    // CHANGED: Load per-worker assignment status for the current stage.
    // Coordinator uses this to see who has started, paused, or completed
    // before deciding to advance or force-complete stuck workers.
    let stageWorkerSummary = null;
    if (
      job.production_stage &&
      STAGES_REQUIRING_WORKERS.includes(job.production_stage)
    ) {
      const workers = await db.JobProductionStageWorker.findAll({
        where: {
          job_no,
          stage_name: job.production_stage,
          // Exclude cancelled — they are historical from reverts
          status: { [Op.notIn]: ["cancelled"] },
        },
        attributes: [
          "id",
          "worker_name",
          "worker_id",
          "status",
          "started_at",
          "paused_at",
          "completed_at",
          "total_pause_duration_seconds",
          "force_completed_by_id",
        ],
        order: [["created_at", "ASC"]],
      });

      const total = workers.length;
      const done = workers.filter((w) =>
        ["completed", "force_completed"].includes(w.status)
      ).length;

      stageWorkerSummary = {
        workers,
        total,
        done,
        all_done: total > 0 && done === total,
        has_incomplete: done < total,
      };
    }

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
        isPickup &&
        job.production_stage === "ready_to_dispatch",
      delivery_assignments: deliveryAssignments,
      // NEW field — worker completion summary for current stage
      stage_worker_summary: stageWorkerSummary,
    });
  } catch (error) {
    return respondToError(res, error, "Failed to fetch valid stages.");
  }
};


// ══════════════════════════════════════════════════════════════════════
//  POST /api/fms/production/:job_no/advance-stage
//
//  CHANGED:
//  1. Workers fetched from User model (not ProductionWorkerMaster)
//  2. Validation by department ("Production Worker" / "Delivery")
//     instead of role — workers are now role-independent
//  3. worker_name stored as w.username (not worker_code-name)
//  4. status: "assigned" added to bulkCreate
//  5. Auto force-completes any incomplete workers from the FROM stage
//     when coordinator advances (they see the warning in modal and decide)
// ════════
export const advanceProductionStage = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    ensureProductionRole(req);
    const { job_no } = req.params;
    const { to_stage, remarks, worker_ids = [] } = req.body || {};

    if (!job_no)
      throw Object.assign(new Error("Job number required"), { statusCode: 400 });
    if (!to_stage)
      throw Object.assign(new Error("to_stage is required"), { statusCode: 400 });
    if (!Array.isArray(worker_ids))
      throw Object.assign(new Error("worker_ids must be an array"), { statusCode: 400 });

    if (STAGES_REQUIRING_WORKERS.includes(to_stage) && worker_ids.length === 0) {
      throw Object.assign(
        new Error(`At least one worker is required for ${STAGE_LABELS[to_stage]}.`),
        { statusCode: 400 }
      );
    }

    if (to_stage === "out_for_delivery" && worker_ids.length === 0) {
      throw Object.assign(
        new Error("At least one delivery worker is required."),
        { statusCode: 400 }
      );
    }

    const job = await db.JobCard.findByPk(job_no, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!job)
      throw Object.assign(new Error("Job not found"), { statusCode: 404 });

    if (!["ready_for_production", "in_production"].includes(job.status)) {
      throw Object.assign(
        new Error(
          `Cannot advance: job is "${job.status}", not in production phase.`
        ),
        { statusCode: 400 }
      );
    }

    const fromStage =
      job.status === "ready_for_production" ? null : job.production_stage;
    assertForwardTransition(fromStage, to_stage);

    if (
      to_stage === "out_for_delivery" &&
      !isShipmentDelivery(job.delivery_location)
    ) {
      throw Object.assign(
        new Error(`Cannot enter Out for Delivery: job is pickup-based.`),
        { statusCode: 400 }
      );
    }

    // CHANGED: Fetch workers from User model — no role, validate by department
    let selectedWorkers = [];
    if (worker_ids.length > 0) {
      selectedWorkers = await db.User.findAll({
        where: { id: worker_ids, isActive: true },
        attributes: ["id", "username", "email", "department"],
        transaction: t,
      });

      if (selectedWorkers.length !== worker_ids.length) {
        throw Object.assign(
          new Error("One or more selected workers not found or inactive."),
          { statusCode: 400 }
        );
      }

      if (to_stage !== "out_for_delivery") {
        // Production stages: must be "Production Worker" department
        const wrongDept = selectedWorkers.find(
          (w) => w.department !== "Production Worker"
        );
        if (wrongDept) {
          throw Object.assign(
            new Error(
              `User "${wrongDept.username}" is not a Production Worker.`
            ),
            { statusCode: 400 }
          );
        }
      } else {
        // Delivery stage: must be "Delivery" department
        const wrongDept = selectedWorkers.find(
          (w) => w.department !== "Delivery"
        );
        if (wrongDept) {
          throw Object.assign(
            new Error(`User "${wrongDept.username}" is not a Delivery worker.`),
            { statusCode: 400 }
          );
        }
        // Delivery workers must have email for the challan upload link
        const noEmail = selectedWorkers.find((w) => !w.email);
        if (noEmail) {
          throw Object.assign(
            new Error(
              `Delivery worker "${noEmail.username}" has no email address. Update their profile first.`
            ),
            { statusCode: 400 }
          );
        }
      }
    }

    let autoForcedCount = 0;
    // CHANGED: Auto force-complete any remaining incomplete worker assignments
    // from the FROM stage when coordinator advances.
    // This handles the case where coordinator advances despite incomplete workers.
    if (fromStage && STAGES_REQUIRING_WORKERS.includes(fromStage)) {
      const now = new Date();
      const incompleteAssignments = await db.JobProductionStageWorker.findAll({
        where: {
          job_no,
          stage_name: fromStage,
          status: { [Op.in]: ["assigned", "in_progress", "paused"] },
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (incompleteAssignments.length > 0) {

        for(const a of incompleteAssignments){
          if(a.status === "assigned"){
            // Worker was assigned but never pressed START.
            // No work was done — cancel cleanly.
            // force_completed should only apply to workers who actually started.
            await a.update(
              {
                status: "cancelled",
                cancelled_at: now,
                cancelled_reason: `Stage advanced to ${STAGE_LABELS[to_stage] || to_stage} before worker started.`,
              },
              { transaction: t }
            );

            await db.ActivityLog.create(
              {
                job_no,
                action: "worker_assignment_cancelled_on_advance",
                performed_by_id: req.user?.id || null,
                meta: {
                  assignment_id: a.id,
                  worker_name: a.worker_name,
                  reason: `Coordinator advanced to ${STAGE_LABELS[to_stage] || to_stage}. Worker had not started.`,
                },
              },
              { transaction: t }
            );
          }
          else{
            // Worker started (in_progress or paused) — force complete with correct end time.
            const completedAt = a.status === "paused" && a.paused_at ? new Date(a.paused_at) : now;
            await a.update(
              {
                status: "force_completed",
                completed_at: completedAt,
                paused_at: null,
                force_completed_by_id: req.user?.id || null,
              },
              { transaction: t }
            );

            // ── ADDED: record reason in ActivityLog so scoring has context ──
            await db.ActivityLog.create(
              {
                job_no,
                action: "worker_assignment_force_completed",
                performed_by_id: req.user?.id || null,
                meta: {
                  assignment_id: a.id,
                  worker_name: a.worker_name,
                  previous_status: a.status,
                  completed_at: completedAt,
                  reason: `Auto force-completed: coordinator advanced stage from ${STAGE_LABELS[fromStage] || fromStage} to ${STAGE_LABELS[to_stage] || to_stage}.`,
                },
              },
              { transaction: t }
            );
          }
        }
      }
      // Count only workers who actually started — assigned workers were simply cancelled
      autoForcedCount = incompleteAssignments.filter(
        (a) => ["in_progress", "paused"].includes(a.status)
      ).length;

    }

    await job.update(
      {
        status: "in_production",
        current_stage: "in_production",
        production_stage: to_stage,
        production_stage_started_at: new Date(),
      },
      { transaction: t }
    );

    // CHANGED: worker_name = w.username, status = "assigned" (new field)
    if (STAGES_REQUIRING_WORKERS.includes(to_stage) && selectedWorkers.length > 0) {
      await db.JobProductionStageWorker.bulkCreate(
        selectedWorkers.map((w) => ({
          job_no,
          stage_name: to_stage,
          worker_name: w.username,
          worker_id: w.id,
          recorded_by_id: req.user?.id || null,
          status: "assigned",
        })),
        { transaction: t }
      );
    }

    // ── out_for_delivery path ─────────────────────────────────────────────
    if (to_stage === "out_for_delivery" && selectedWorkers.length > 0) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 4 * 24 * 60 * 60 * 1000);

      const assignments = await db.DeliveryAssignment.bulkCreate(
        selectedWorkers.map((w) => ({
          job_no,
          worker_id: w.id,
          worker_name: w.username,   // CHANGED: was worker_code-name
          worker_email: w.email,
          upload_token: uuidv4(),
          token_expires_at: expiresAt,
          status: "pending",
          assigned_by_id: req.user?.id || null,
        })),
        { transaction: t, returning: true }
      );

      // CHANGED: delivery_persons_name uses username
      await job.update(
        {
          delivery_persons_name: selectedWorkers
            .map((w) => w.username)
            .join(", "),
        },
        { transaction: t }
      );

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
            delivery_workers: selectedWorkers.map((w) => w.username),
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
        if (!worker) continue;

        const uploadLink = `${frontendUrl}/delivery/confirm/${assignment.upload_token}`;
        const expiryStr = new Date(
          assignment.token_expires_at
        ).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
          timeZone: "Asia/Kolkata",
        });

        sendMailForFMS({
          to: worker.email,
          subject: `Delivery Assignment — Job #${job_no} | ${job.client_name}`,
          html: `
            <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#333">
              <h2 style="color:#1d4ed8">📦 Delivery Assignment</h2>
              <p>Hello <strong>${worker.username}</strong>,</p>
              <p>You have been assigned to deliver the following order:</p>
              <table style="border-collapse:collapse;width:100%;font-size:14px">
                <tr><td style="padding:6px 12px;border:1px solid #e5e7eb;font-weight:bold">Job No</td><td style="padding:6px 12px;border:1px solid #e5e7eb">${job_no}</td></tr>
                <tr><td style="padding:6px 12px;border:1px solid #e5e7eb;font-weight:bold">Client</td><td style="padding:6px 12px;border:1px solid #e5e7eb">${job.client_name}</td></tr>
                <tr><td style="padding:6px 12px;border:1px solid #e5e7eb;font-weight:bold">Delivery Location</td><td style="padding:6px 12px;border:1px solid #e5e7eb">${job.delivery_location?.replace(/_/g, " ")}</td></tr>
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
        })
          .then(() => {
            db.DeliveryAssignment.update(
              { email_sent: true, email_sent_at: new Date() },
              { where: { id: assignment.id } }
            );
          })
          .catch((emailErr) => {
            console.error(
              `[email-fail] Delivery assignment email failed for worker ${worker.email}:`,
              emailErr.message
            );
          });
      }

      return res.json({
        message: `Stage advanced to ${STAGE_LABELS[to_stage]}. Emails sent to ${selectedWorkers.length} delivery worker(s).`,
        job_no,
        production_stage: to_stage,
        auto_force_completed: autoForcedCount,
      });
    }

    // ── Non-delivery stage commit ─────────────────────────────────────────
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
          workers: selectedWorkers.map((w) => w.username),
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
      auto_force_completed: autoForcedCount,
    });
  } catch (error) {
    await t.rollback().catch(() => {});
    return respondToError(res, error, "Failed to advance stage.");
  }
};

// ══════════════════════════════════════════════════════════════════════
//  POST /api/fms/production/:job_no/revert-stage
//
//  CHANGED:
//  1. Cancels assigned/in_progress/paused assignments for the FROM stage
//  2. If reverting from out_for_delivery, marks pending delivery
//     assignments as overridden (they are stale)
//  3. Workers fetched from User model, validated by department
//  4. worker_name uses w.username, status: "assigned" on new records
// ═══════════
export const revertProductionStage = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    ensureProductionRole(req);
    const { job_no } = req.params;
    const { to_stage, remarks, worker_ids = [] } = req.body;

    if (!job_no)
      throw Object.assign(new Error("Job number required"), { statusCode: 400 });
    if (!to_stage)
      throw Object.assign(new Error("to_stage is required"), { statusCode: 400 });
    if (!remarks?.trim()) {
      throw Object.assign(
        new Error("Remarks are required for stage reverts."),
        { statusCode: 400 }
      );
    }
    if (!Array.isArray(worker_ids)) {
      throw Object.assign(
        new Error("worker_ids must be an array of IDs"),
        { statusCode: 400 }
      );
    }

    const job = await JobCard.findByPk(job_no, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!job)
      throw Object.assign(new Error("Job not found"), { statusCode: 404 });

    if (job.status !== "in_production") {
      throw Object.assign(
        new Error(
          "Reverse movement is only allowed when the job is in production."
        ),
        { statusCode: 400 }
      );
    }

    const fromStage = job.production_stage;
    assertReverseTransition(fromStage, to_stage);

    const now = new Date();



    // ── Assignment handling depends on whether we are reverting FROM quality_check ──
    // Any revert FROM QC = defect was detected by the QC worker(s).
    // Workers who were actively working get credit (defect_reported).
    // Workers who were assigned but never started get cancelled (no work done).
    // For all other stages, keep the existing blanket-cancel behaviour.

    if(fromStage === "quality_check") {
      // ── Handle QC workers individually based on their current state ──────────
      const activeQcAssignments = await db.JobProductionStageWorker.findAll({
        where: {
          job_no,
          stage_name: "quality_check",
          status: { [Op.in]: ["in_progress", "paused", "assigned"] },
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      
      for(const a of activeQcAssignments) {
        if (["in_progress", "paused"].includes(a.status)) {
          // Worker did productive inspection work — credit them for detecting the defect.
          // Time logic: same as force-complete (paused → use paused_at, in_progress → now).
          const completedAt = a.status === "paused" && a.paused_at ? new Date(a.paused_at) : now;
          
          await a.update(
            {
              status: "defect_reported",
              completed_at: completedAt,
              paused_at: null,
            },
            { transaction: t }
          );
        }
        else{
          // Worker was assigned but never started — genuinely no work done.
          await a.update(
            {
              status: "cancelled",
              cancelled_at: now,
              cancelled_reason: `Stage reverted from Quality Check to ${STAGE_LABELS[to_stage] || to_stage}: ${remarks.trim()}`,
            },
            { transaction: t }
          );
        }
      }

      // ── Mark ALL workers who completed the TO stage (e.g. Printing) as caused_rework ──
      // Multiple workers may have worked on that stage together — all share responsibility.
      // Using UPDATE (not increment) because caused_rework is a boolean flag, so
      // marking an already-marked assignment 1→1 is idempotent and safe.

      await db.JobProductionStageWorker.update(
        { caused_rework: true },
        {
          where: {
            job_no,
            stage_name: to_stage,
            status: { [Op.in]: ["completed", "force_completed"] },
          },
          transaction: t,
        }
      );

    }
    else {
      // ── Standard revert: cancel all active assignments for the FROM stage ────
      await db.JobProductionStageWorker.update(
        {
          status: "cancelled",
          cancelled_at: now,
          cancelled_reason: `Stage reverted from ${STAGE_LABELS[fromStage] || fromStage} to ${STAGE_LABELS[to_stage] || to_stage} by coordinator. Remarks: ${remarks.trim()}`,
        },
        {
          where: {
            job_no,
            stage_name: fromStage,
            status: { [Op.in]: ["assigned", "in_progress", "paused"] },
          },
          transaction: t,
        }
      );
    }


    const updates = {
      production_stage: to_stage,
      production_stage_started_at: new Date(),
    };

    if (fromStage === "out_for_delivery") {
      updates.delivery_persons_name = null;

      // CHANGED: Mark pending delivery assignments as overridden.
      // Delivery workers who got the email link can no longer act on it
      // since the job is being pulled back into production.
      await db.DeliveryAssignment.update(
        {
          status: "overridden",
          overridden_by_id: req.user?.id || null,
          overridden_at: now,
          override_reason: `Stage reverted: job returned to production from Out for Delivery.`,
        },
        {
          where: { job_no, status: "pending" },
          transaction: t,
        }
      );
    }

    await job.update(updates, { transaction: t });

    // CHANGED: Fetch from User model, validate by department
    let selectedWorkers = [];
    if (STAGES_REQUIRING_WORKERS.includes(to_stage) && worker_ids.length > 0) {
      selectedWorkers = await db.User.findAll({
        where: { id: worker_ids, isActive: true },
        attributes: ["id", "username", "email", "department"],
        transaction: t,
      });

      const wrongDept = selectedWorkers.find(
        (w) => w.department !== "Production Worker"
      );
      if (wrongDept) {
        throw Object.assign(
          new Error(`User "${wrongDept.username}" is not a Production Worker.`),
          { statusCode: 400 }
        );
      }
    }

    // CHANGED: worker_name = w.username, status starts as "assigned"
    if (STAGES_REQUIRING_WORKERS.includes(to_stage) && selectedWorkers.length > 0) {
      await db.JobProductionStageWorker.bulkCreate(
        selectedWorkers.map((w) => ({
          job_no,
          stage_name: to_stage,
          worker_name: w.username,
          worker_id: w.id,
          recorded_by_id: req.user?.id || null,
          status: "assigned",
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
        action: fromStage === "quality_check"
          ? "quality_defect_detected"
          : "production_stage_reverted",
        performed_by_id: req.user?.id || null,
        meta: {
          from_stage: fromStage,
          to_stage,
          workers: selectedWorkers.map((w) => w.username),
          remarks: remarks.trim(),
          ...(fromStage === "quality_check" && {
            rework_attributed_to_stage: to_stage,
          }),
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
  } catch (error) {
    await t.rollback().catch(() => {});
    return respondToError(res, error, "Failed to revert stage.");
  }
};


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
//  GET /api/fms/production/:job_no/stage-workers
//  CHANGED: added id and status to response for coordinator visibility
// ════════
export const getStageWorkersForJob = async (req, res) => {
  try {
    ensureProductionRole(req);
    const { job_no } = req.params;

    const rows = await db.JobProductionStageWorker.findAll({
      where: { job_no },
      // CHANGED: added id and status
      attributes: ["id", "stage_name", "worker_name", "worker_id", "status", "created_at"],
      order: [["created_at", "DESC"]],
    });

    const grouped = {};
    for (const row of rows) {
      if (!grouped[row.stage_name]) grouped[row.stage_name] = [];

      const exists = grouped[row.stage_name].some(
        (n) =>
          n.worker_id === row.worker_id ||
          n.name.toLowerCase() === row.worker_name?.toLowerCase()
      );

      if (!exists) {
        grouped[row.stage_name].push({
          id: row.id,                    // CHANGED: added id
          name: row.worker_name,
          worker_id: row.worker_id,
          status: row.status,            // CHANGED: added status
        });
      }
    }

    return res.json(grouped);
  } catch (error) {
    return respondToError(res, error, "Failed to fetch stage workers.");
  }
};

// ══════════════════════════════════════════════════════════════════════
//  POST /api/fms/production/:job_no/worker-assignments/:assignment_id/force-complete
//  NEW FUNCTION
//
//  Coordinator manually force-completes a stuck worker assignment.
//  Time logic:
//    - paused     → completed_at = paused_at (work stopped when they paused)
//    - in_progress → completed_at = NOW()
//    - assigned   → completed_at = NOW() (never started, just skip it)
// ═════════

export const forceCompleteWorkerAssignment = async (req, res) => {
  const t = await db.sequelize.transaction();
  try {
    ensureProductionRole(req);
    const { job_no, assignment_id } = req.params;
    const { reason } = req.body || {};

    if (!reason?.trim()) {
      throw Object.assign(
        new Error("Reason is required for force completion."),
        { statusCode: 400 }
      );
    }

    const assignment = await db.JobProductionStageWorker.findOne({
      where: { id: assignment_id, job_no },
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (!assignment) {
      throw Object.assign(new Error("Assignment not found."), {
        statusCode: 404,
      });
    }

    if (!["assigned", "in_progress", "paused"].includes(assignment.status)) {
      throw Object.assign(
        new Error(
          `Cannot force-complete: current status is '${assignment.status}'. Already done or cancelled.`
        ),
        { statusCode: 400 }
      );
    }

    const now = new Date();

    // Time logic: use paused_at if paused, NOW() otherwise
    const completedAt =
      assignment.status === "paused" && assignment.paused_at
        ? new Date(assignment.paused_at)
        : now;

    await assignment.update(
      {
        status: "force_completed",
        completed_at: completedAt,
        paused_at: null,
        force_completed_by_id: req.user?.id || null,
      },
      { transaction: t }
    );

    await db.ActivityLog.create(
      {
        job_no,
        action: "worker_assignment_force_completed",
        performed_by_id: req.user?.id || null,
        meta: {
          assignment_id,
          worker_name: assignment.worker_name,
          reason: reason.trim(),
          previous_status: assignment.status,
          completed_at: completedAt,
        },
      },
      { transaction: t }
    );

    await t.commit();
    return res.json({
      message: `Assignment for "${assignment.worker_name}" force-completed.`,
      assignment,
    });
  } catch (err) {
    await t.rollback().catch(() => {});
    return respondToError(res, err, "Failed to force-complete assignment.");
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

// ══════════════════════════════════════════════════════════════════════
//  GET /api/fms/production/worker-stats
//  Returns all Production Workers with their assignment statistics.
//  Used by the Workers tab in the Production Coordinator dashboard.
// ══════════════════════════════════════════════════════════════════════
export const getWorkerStats = async (req, res) => {
  try {
    ensureProductionRole(req);

    // All active Production Workers
    const allWorkers = await db.User.findAll({
      where: { 
        department: { [Op.in]: ["Production Worker", "Delivery"] },
        isActive: true 
      },
      attributes: ["id", "username", "department"],
      order: [["department", "ASC"], ["username", "ASC"]],
    });

    if (allWorkers.length === 0) {
      return res.json({
        workers: [],
        overview: { total: 0, working: 0, paused: 0, idle: 0 },
      });
    }

    const productionIds = allWorkers
      .filter((w) => w.department === "Production Worker")
      .map((w) => w.id);

    const deliveryIds = allWorkers
      .filter((w) => w.department === "Delivery")
      .map((w) => w.id);

    // ── Production Worker stats ──────────


    // All-time + today stats in a single GROUP BY query
    const productionStats = productionIds.length > 0 ? await db.JobProductionStageWorker.findAll({
          attributes: [
              "worker_id",
              [db.sequelize.fn("COUNT", db.sequelize.col("id")), "total_assignments"],
              [db.sequelize.literal("SUM(CASE WHEN status IN ('completed','force_completed') THEN 1 ELSE 0 END)"), "total_done"],
              [db.sequelize.literal("SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)"), "self_completed"],
              [db.sequelize.literal("SUM(CASE WHEN status = 'force_completed' THEN 1 ELSE 0 END)"), "force_completed"],
              [db.sequelize.literal("SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)"), "cancelled"],
              [db.sequelize.literal("SUM(CASE WHEN status IN ('completed','force_completed') AND DATE(completed_at) = CURDATE() THEN 1 ELSE 0 END)"), "done_today"],
              // NEW: QC defect detections (positive metric for QC workers)
              [db.sequelize.literal("SUM(CASE WHEN status = 'defect_reported' THEN 1 ELSE 0 END)"), "defects_reported"],
              // NEW: Assignments where this worker's output failed QC and caused rework
              [db.sequelize.literal("SUM(CASE WHEN caused_rework = 1 THEN 1 ELSE 0 END)"), "rework_caused"],
            ],
            where: { worker_id: { [Op.in]: productionIds } },
            group: ["worker_id"],
            raw: true,
          }) : [];


    // FIX: Fetch ALL active assignments, order in_progress first so priority
    // selection always sees the highest-status assignment first per worker.
    const activeProductionAssignments =
      productionIds.length > 0
        ? await db.JobProductionStageWorker.findAll({
            where: {
              worker_id: { [Op.in]: productionIds },
              status: { [Op.in]: ["in_progress", "paused", "assigned"] },
            },
            attributes: ["worker_id", "job_no", "stage_name", "status", "started_at"],
            include: [
              {
                model: db.JobCard,
                as: "jobCard",
                attributes: ["job_no", "client_name"],
              },
            ],
            // in_progress must come first so it always wins the priority check
            order: [
              [db.sequelize.literal("FIELD(JobProductionStageWorker.status,'in_progress','paused','assigned')"), "ASC"],
            ],
          })
        : [];

    // ── Delivery Worker stats ───
    const deliveryStats = deliveryIds.length > 0 ? await db.DeliveryAssignment.findAll({
            attributes: [
              "worker_id",
              [db.sequelize.fn("COUNT", db.sequelize.col("id")), "total_assignments"],
              [db.sequelize.literal("SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END)"), "total_done"],
              // Coordinator uploaded on their behalf = equivalent of force_completed
              [db.sequelize.literal("SUM(CASE WHEN status = 'overridden' THEN 1 ELSE 0 END)"), "force_completed"],
              [db.sequelize.literal("SUM(CASE WHEN status = 'confirmed' AND DATE(confirmed_at) = CURDATE() THEN 1 ELSE 0 END)"), "done_today"],
            ],
            where: { worker_id: { [Op.in]: deliveryIds } },
            group: ["worker_id"],
            raw: true,
          }) : [];

    // Delivery workers with pending assignments = currently out delivering
    const activeDeliveries = deliveryIds.length > 0 ? await db.DeliveryAssignment.findAll({
            where: {
              worker_id: { [Op.in]: deliveryIds },
              status: "pending",
            },
            attributes: ["worker_id", "job_no", "status"],
            include: [
              {
                model: db.JobCard,
                as: "jobCard",
                attributes: ["job_no", "client_name"],
              },
            ],
          }) : [];

    // Build lookup maps
    const productionStatsMap = {};
    for (const s of productionStats) productionStatsMap[s.worker_id] = s;
    
    // FIX: Group all active assignments per worker, keeping highest-priority
    // status as "primary" (in_progress > paused > assigned).
    // Because of ORDER BY FIELD above, in_progress records arrive first, so
    // the first insertion is already highest priority — subsequent insertions
    // only replace if they have strictly higher priority.
    const STATUS_PRIORITY = { in_progress: 3, paused: 2, assigned: 1 };

    const activeProductionMap = {};
    for (const a of activeProductionAssignments) {
      if (!activeProductionMap[a.worker_id]) {
        activeProductionMap[a.worker_id] = { primary: a, total: 1 };
      } else {
        activeProductionMap[a.worker_id].total++;
        const existing = activeProductionMap[a.worker_id].primary;
        if (
          (STATUS_PRIORITY[a.status] || 0) >
          (STATUS_PRIORITY[existing.status] || 0)
        ) {
          activeProductionMap[a.worker_id].primary = a;
        }
      }
    }

    const deliveryStatsMap = {};
    for (const s of deliveryStats) deliveryStatsMap[s.worker_id] = s;

    // Group pending deliveries per worker
    const activeDeliveryMap = {};
    for (const d of activeDeliveries) {
      if (!activeDeliveryMap[d.worker_id]) {
        activeDeliveryMap[d.worker_id] = { primary: d, total: 1 };
      } else {
        activeDeliveryMap[d.worker_id].total++;
      }
    }


    // ── Merge ─────────────────────────────────────────────────────────────
    const result = allWorkers.map((w) => {
      if (w.department === "Production Worker") {
        const s = productionStatsMap[w.id] || {};
        const active = activeProductionMap[w.id] || null;
        const primary = active?.primary || null;
        // additional_count = paused/assigned jobs the worker also holds
        const additionalCount = active ? active.total - 1 : 0;

        return {
          id: w.id,
          username: w.username,
          department: "Production Worker",
          current: primary
            ? {
                job_no: primary.job_no,
                client_name: primary.jobCard?.client_name || "—",
                stage_name: primary.stage_name,
                status: primary.status,
                started_at: primary.started_at,
                additional_count: additionalCount,
              }
            : null,
          stats: {
            total_assignments: parseInt(s.total_assignments) || 0,
            total_done:        parseInt(s.total_done)        || 0,
            self_completed:    parseInt(s.self_completed)    || 0,
            force_completed:   parseInt(s.force_completed)   || 0,
            done_today:        parseInt(s.done_today)        || 0,
            defects_reported:  parseInt(s.defects_reported)  || 0,
            rework_caused:     parseInt(s.rework_caused)     || 0,
          },
        };
      }

      // Delivery worker
      const s = deliveryStatsMap[w.id] || {};
      const active = activeDeliveryMap[w.id] || null;
      const additionalCount = active ? active.total - 1 : 0;

      return {
        id: w.id,
        username: w.username,
        department: "Delivery",
        // Treat pending deliveries as "in_progress" for display consistency
        current: active
          ? {
              job_no: active.primary.job_no,
              client_name: active.primary.jobCard?.client_name || "—",
              stage_name: "out_for_delivery",
              status: "in_progress",
              started_at: null,
              additional_count: additionalCount,
            }
          : null,
        stats: {
          total_assignments: parseInt(s.total_assignments) || 0,
          total_done:        parseInt(s.total_done)        || 0,
          self_completed:    parseInt(s.total_done)        || 0,
          force_completed:   parseInt(s.force_completed)   || 0,
          done_today:        parseInt(s.done_today)        || 0,
          defects_reported:  0,  // Delivery workers do not do QC
          rework_caused:     0,  // Delivery workers do not produce print output
        },
      };
    });

    const working = result.filter((w) => w.current?.status === "in_progress").length;
    const paused  = result.filter((w) => w.current?.status === "paused").length;
    const idle    = result.filter((w) => !w.current).length;

    return res.json({
      workers: result,
      overview: { total: allWorkers.length, working, paused, idle },
    });
  } catch (err) {
    return respondToError(res, err, "Failed to fetch worker stats.");
  }
};