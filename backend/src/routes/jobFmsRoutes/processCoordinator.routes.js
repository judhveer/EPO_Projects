import express from "express";
import {
getAllJobsForProcessCoordinator,
assignDesigner,
getDesignerStatus, 
coordinatorSetEstimatedTime
} from "../../controllers/jobFmsController/processCoordinator.controller.js";

const router = express.Router();

router.get("/jobs", getAllJobsForProcessCoordinator);
router.patch("/:job_no/assign", assignDesigner);
router.patch("/:job_no/set-estimated-time", coordinatorSetEstimatedTime);
router.get("/designers/status", getDesignerStatus);

export default router;