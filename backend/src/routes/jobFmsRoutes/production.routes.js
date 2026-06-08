import express from "express";
import multer from "multer";

import {
  getJobsForProduction,
  getValidStagesForJob,
  advanceProductionStage,
  revertProductionStage,
  markJobDelivered,
  getStageWorkersForJob,
  overrideDeliveryAssignment,
  forceCompleteWorkerAssignment,
  getWorkerStats
} from "../../controllers/jobFmsController/production.controller.js";

const router = express.Router();


// ADD these after your imports
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
    allowed.includes(file.mimetype)
      ? cb(null, true)
      : cb(new Error("Only PDF, JPG, PNG allowed."));
  },
});

const safeUpload = (mw) => (req, res, next) =>
  mw(req, res, (err) => {
    if (err)
      return res
        .status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400)
        .json({ message: err.message });
    next();
  });



// ── Production Pipeline (Tab 1) ──
router.get("/", getJobsForProduction);
router.get("/worker-stats", getWorkerStats);   
router.get("/:job_no/valid-stages", getValidStagesForJob);
router.get("/:job_no/stage-workers", getStageWorkersForJob);
router.post("/:job_no/advance-stage", advanceProductionStage);
router.post("/:job_no/revert-stage", revertProductionStage);
router.post("/:job_no/mark-delivered", markJobDelivered); // pickup only
router.post(
  "/:job_no/delivery-assignments/:assignment_id/override",
  safeUpload(
    upload.fields([
      { name: "challan_file", maxCount: 1 },
      { name: "material_photo", maxCount: 1 },
    ]),
  ),
  overrideDeliveryAssignment,
);

// Coordinator force-completes a stuck worker assignment
// (worker absent, forgot to mark done, etc.)
router.post(
  "/:job_no/worker-assignments/:assignment_id/force-complete",
  forceCompleteWorkerAssignment,
);

export default router;
