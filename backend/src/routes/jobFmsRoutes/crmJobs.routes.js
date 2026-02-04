import express from "express";

import {
  getAllJobsForCRM,
  sendToClient,
  approveJobByClient,
  clientChanges
} from "../../controllers/jobFmsController/crm.controller.js";

const router = express.Router();

router.get("/jobs", getAllJobsForCRM);
router.patch("/:job_no/sent-to-client", sendToClient);
router.patch("/:job_no/approved", approveJobByClient);
router.patch("/:job_no/client-changes", clientChanges);

export default router;