
import express from "express";
import {
  designerStartTask,
  designerEndTask,
  setEstimatedTime,
  getAllJobsForDesginer,
  designerPauseTask,
  designerResumeTask
} from "../../controllers/jobFmsController/designer.controller.js";

const router = express.Router();

router.get("/jobs", getAllJobsForDesginer);
router.patch("/set-estimated-time", setEstimatedTime);
router.patch("/:job_no/start", designerStartTask);
router.patch("/:job_no/pause", designerPauseTask);
router.patch("/:job_no/resume", designerResumeTask);
router.patch("/:job_no/end", designerEndTask);



export default router;
