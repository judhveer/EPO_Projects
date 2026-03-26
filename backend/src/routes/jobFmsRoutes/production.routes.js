import express from "express";
import { getJobsForProduction, orderComplete } from "../../controllers/jobFmsController/production.controller.js";

const router = express.Router();

router.get("/", getJobsForProduction);

router.patch("/:job_no/complete", orderComplete);


export default router;