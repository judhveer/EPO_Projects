import { Router } from "express";
import { getMyDeliveryAssignments } from "../../controllers/jobFmsController/deliveryWorker.controller.js";

const router = Router();

// GET /api/fms/delivery-worker/assignments
router.get("/assignments", getMyDeliveryAssignments);

export default router;