// routes/outbound.routes.js
import express from "express";
import { getOutboundJobs } from "../../controllers/jobFmsController/outbound.controller.js";

const router = express.Router();

router.get("/jobs", getOutboundJobs);

export default router;