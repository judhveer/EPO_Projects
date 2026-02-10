import express from "express";

import { getDashboardJobs, getDashboardJobDetails, getJobItemsByJobNo } from "../../controllers/jobFmsController/commonDashboard.controller.js";

const router = express.Router();

router.get("/jobs", getDashboardJobs);
router.get("/jobs/:jobNo", getDashboardJobDetails);
router.get("/jobs/:jobNo/items", getJobItemsByJobNo)

export default router;