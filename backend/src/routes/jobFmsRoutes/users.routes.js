import express from "express";
import { getNonBossUsers, getAllCrms, getWorkersByDepartment } from "../../controllers/jobFmsController/users.controller.js";

const router = express.Router();

router.get("/non-boss", getNonBossUsers);
router.get("/crm", getAllCrms);
router.get("/workers", getWorkersByDepartment);

export default router;