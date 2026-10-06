import express from "express";
import { getNonBossUsers, getAllCrms, getWorkersByDepartment, getWorkersForDelivery } from "../../controllers/jobFmsController/users.controller.js";

const router = express.Router();

router.get("/non-boss", getNonBossUsers);
router.get("/crm", getAllCrms);

// IMPORTANT: /workers/for-delivery MUST be registered before /workers.
// Express matches top-to-bottom. If /workers came first, Express would match "for-delivery" as the value of a hypothetical :param and route to the wrong handler. Since there's no param here, it's safe either way, but specific paths before general ones is the convention.
router.get("/workers/for-delivery", getWorkersForDelivery);
router.get("/workers", getWorkersByDepartment);

export default router;
