
import express from "express";
import {
  designerStartTask,
  designerEndTask,
  setEstimatedTime,
  getAllJobsForDesginer,
  designerPauseTask,
  designerResumeTask
} from "../../controllers/jobFmsController/designer.controller.js";

import {
  getAvailableDesigners,
  getOutgoingRequests,
  getIncomingRequests,
  getBadgeCount,
  createTransferRequest,
  cancelTransferRequest,
  acceptTransferRequest,
  rejectTransferRequest,
  dismissTransferNotification,
  cancelRequestsAndStart,
} from "../../controllers/jobFmsController/designerTransfer.controller.js";



const router = express.Router();

// ── Job data ──────────────────────────────────────────────────────────
router.get("/jobs", getAllJobsForDesginer);

// ── Transfer request reads ─────────────────────────────────────────────
// Declared before /:job_no routes as a convention — no actual collision
// risk since these are GET and the parameterised routes are PATCH,
// but ordering specific paths before params is cleaner to read.
router.get("/available-designers",            getAvailableDesigners);
router.get("/transfer-requests/outgoing",     getOutgoingRequests);
router.get("/transfer-requests/incoming",     getIncomingRequests);
router.get("/transfer-requests/badge-count",  getBadgeCount);

// ── Transfer — mutations ──────────────────────────────────────────────
// Specific transfer-request paths must come BEFORE /:job_no paths
// to prevent Express matching "transfer-requests" as a job_no param.
router.post(  "/transfer-requests",                              createTransferRequest);
router.delete("/transfer-requests/:request_id",                  cancelTransferRequest);
router.patch( "/transfer-requests/:request_id/accept",           acceptTransferRequest);
router.patch( "/transfer-requests/:request_id/reject",           rejectTransferRequest);
router.patch( "/transfer-requests/:request_id/dismiss",          dismissTransferNotification);

// ── Job actions ───────────────────────────────────────────────────────
router.patch("/set-estimated-time", setEstimatedTime);
router.patch("/:job_no/start", designerStartTask);
router.patch("/:job_no/pause", designerPauseTask);
router.patch("/:job_no/resume", designerResumeTask);
router.patch("/:job_no/end", designerEndTask);
router.patch("/:job_no/cancel-requests-and-start", cancelRequestsAndStart);


export default router;
