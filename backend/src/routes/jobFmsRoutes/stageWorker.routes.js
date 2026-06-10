import { Router } from "express";
import authenticate from "../../middlewares/authenticate.js";
import {
  getMyAssignments,
  startAssignment,
  pauseAssignment,
  resumeAssignment,
  completeAssignment,
} from "../../controllers/jobFmsController/stageWorker.controller.js";

const router = Router();

// All worker routes require a valid JWT
// router.use(authenticate);

// GET  /api/fms/worker/assignments
// Returns active assignments for the logged-in worker
router.get("/assignments", getMyAssignments);

// POST /api/fms/worker/assignments/:id/start
router.post("/assignments/:id/start", startAssignment);

// POST /api/fms/worker/assignments/:id/pause
router.post("/assignments/:id/pause", pauseAssignment);

// POST /api/fms/worker/assignments/:id/resume
router.post("/assignments/:id/resume", resumeAssignment);

// POST /api/fms/worker/assignments/:id/done
router.post("/assignments/:id/done", completeAssignment);

export default router;