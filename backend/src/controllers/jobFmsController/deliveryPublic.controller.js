import db from "../../models/index.js";
import { uploadChallanToDrive, uploadMaterialPhotoToDrive, } from "../../utils/jobFms/googleDriveUpload.js";
import { sendMailForFMS } from "../../email/sendMail.js";
import path from "path";

/**
 * GET /api/public/delivery/:token
 * Returns assignment + job info for the public challan page.
 * No auth required.
 */
export const getAssignmentByToken = async (req, res) => {
  try {
    const { token } = req.params;
    const assignment = await db.DeliveryAssignment.findOne({
      where: { upload_token: token },
      include: [
        {
          model: db.JobCard,
          as: "jobCard",
          attributes: [ "job_no", "client_name", "delivery_location", "delivery_address", "status", ],
        },
      ],
    });

    if (!assignment) {
      return res.status(404).json({
        message: "Invalid link.",
      });
    }

    if (new Date() > new Date(assignment.token_expires_at)) {
      return res.status(410).json({
        message: "This link has expired. Contact your coordinator.",
      });
    }

    if (assignment.status === "confirmed") {
      return res.json({
        already_confirmed: true,
        worker_name: assignment.worker_name,
        challan_no: assignment.challan_no,
        confirmed_at: assignment.confirmed_at,
      });
    }

    if (assignment.status === "overridden") {
      return res.json({
        overridden: true,
        worker_name: assignment.worker_name,
        message: "Your assignment has been confirmed by the coordinator.",
      });
    }

    return res.json({
      already_confirmed: false,
      worker_name: assignment.worker_name,
      job_no: assignment.jobCard?.job_no,
      client_name: assignment.jobCard?.client_name,
      delivery_location: assignment.jobCard?.delivery_location?.replace(/_/g, " ",),
      delivery_address: assignment.jobCard?.delivery_address,
      token_expires_at: assignment.token_expires_at,
    });
  } catch (err) {
    console.error("getAssignmentByToken error:", err);
    return res.status(500).json({
      message: "Something went wrong. Try again.",
    });
  }
};

/**
 * POST /api/public/delivery/:token/confirm
 * Multipart: challan_no (field) + challan_file (file).
 * No auth required — token is the credential.
 */
export const confirmDeliveryByToken = async (req, res) => {
  const { token } = req.params;
  const { challan_no } = req.body || {};

  // multer.fields() puts files in req.files (object), not req.file
  const challanFile = req.files?.["challan_file"]?.[0];
  const materialFile = req.files?.["material_photo"]?.[0]; // optional

  let uploadedChallanLink = null;
  let uploadedMaterialLink = null;

  // const file = req.file;
  // let uploadedLink = null;

  try {
    const assignment = await db.DeliveryAssignment.findOne({
      where: { upload_token: token },
      include: [
        {
          model: db.JobCard,
          as: "jobCard",
          attributes: ["job_no", "client_name", "status", "delivery_location"],
        },
      ],
    });

    if (!assignment) {
      return res.status(404).json({
        message: "Invalid link.",
      });
    }
    if (new Date() > new Date(assignment.token_expires_at)) {
      return res.status(410).json({
        message: "This link has expired. Contact your coordinator.",
      });
    }
    if (assignment.status !== "pending") {
      return res.status(400).json({
        message: "This delivery has already been confirmed.",
      });
    }
    if (assignment.jobCard?.status !== "in_production") {
      return res.status(400).json({
        message: "Job is no longer in production.",
      });
    }

    if (!challan_no?.trim()) {
      return res.status(400).json({
        message: "Challan number is required.",
      });
    }

    if (!challanFile) {
      return res.status(400).json({ message: "Challan file upload is required." });
    }

    // ── Upload challan (required) ──────────────────────────────────────────
    const { web_view_link: challanLink } = await uploadChallanToDrive({
      buffer: challanFile.buffer,
      filename: challanFile.originalname,
      mimeType: challanFile.mimetype,
      job_no: assignment.job_no,
    });
    uploadedChallanLink = challanLink;

    // ── Upload material photo (optional) ───────────────────────────────────
    if (materialFile) {
      try {
        const { web_view_link: photoLink } = await uploadMaterialPhotoToDrive({
          buffer: materialFile.buffer,
          filename: materialFile.originalname,
          mimeType: materialFile.mimetype,
          job_no: assignment.job_no,
        });
        uploadedMaterialLink = photoLink;
      } catch (photoErr) {
        // Material photo upload failure is non-fatal — challan is already uploaded.
        // Log it and continue; the assignment will be confirmed without the photo link.
        console.error(
          `[material-photo] Upload failed for job ${assignment.job_no}: ${photoErr.message}`
        );
      }
    }

    // DB transaction
    const t = await db.sequelize.transaction();
    try {
      await assignment.update(
        {
          challan_no: challan_no.trim(),
          challan_file_url: uploadedChallanLink,
          material_photo_url: uploadedMaterialLink, // null if not uploaded
          status: "confirmed",
          confirmed_at: new Date(),
        },
        { transaction: t },
      );

      await db.ActivityLog.create(
        {
          job_no: assignment.job_no,
          action: "delivery_confirmed_by_worker",
          performed_by_id: null,
          meta: {
            worker_name: assignment.worker_name,
            challan_no: challan_no.trim(),
            challan_file_url: uploadedChallanLink,
            material_photo_url: uploadedMaterialLink,
          },
        },
        { transaction: t },
      );

      // Check if ALL assignments for this job are done (confirmed or overridden)
      const pendingCount = await db.DeliveryAssignment.count({
        where: {
          job_no: assignment.job_no,
          status: "pending",
        },
        transaction: t,
      });

      if (pendingCount === 0) {
        // All done → move job to delivered
        const job = await db.JobCard.findByPk(assignment.job_no, {
          transaction: t,
          lock: t.LOCK.UPDATE,
        });

        if (job && job.status === "in_production") {
          await job.update(
            {
              status: "delivered",
              current_stage: "delivered",
              production_stage: null,
              delivered_at: new Date(),
            },
            { transaction: t },
          );

          await db.ActivityLog.create(
            {
              job_no: assignment.job_no,
              action: "job_delivered",
              performed_by_id: null,
              meta: {
                mode: "shipment",
                triggered_by: "all_delivery_confirmations_received",
              },
            },
            { transaction: t },
          );
        }
      }

      await t.commit();
      return res.json({
        message: "Delivery confirmed successfully. Thank you!",
        challan_no: challan_no.trim(),
        challan_file_url: uploadedChallanLink,
        material_photo_url: uploadedMaterialLink,
        all_confirmed: pendingCount === 0,
      });
    } catch (dbErr) {
      await t.rollback().catch(() => {});
      // Log orphan files for manual cleanup
      if (uploadedChallanLink) {
        console.error(`[orphan-challan] Token=${token}, Job=${assignment.job_no}, Link=${uploadedChallanLink}`);
      }
      if (uploadedMaterialLink) {
        console.error(`[orphan-material] Token=${token}, Job=${assignment.job_no}, Link=${uploadedMaterialLink}`);
      }
      throw dbErr;
    }
  } catch (err) {
    console.error("confirmDeliveryByToken error:", err);
    return res.status(err.statusCode || 500).json({
      message: err.message || "Failed to confirm delivery.",
    });
  }
};
