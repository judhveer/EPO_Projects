import express from "express";
import {
getAllJobsForProcessCoordinator,
assignDesigner,
getDesignerStatus
} from "../../controllers/jobFmsController/processCoordinator.controller.js";

const router = express.Router();

router.get("/jobs", getAllJobsForProcessCoordinator);
router.patch("/:job_no/assign", assignDesigner);
router.get("/designers/status", getDesignerStatus);

export default router;