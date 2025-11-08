import express from "express";
import { getNonBossUsers, getAllCrms } from "../../controllers/jobFmsController/users.controller.js";

const router = express.Router();

router.get("/non-boss", getNonBossUsers);

router.get("/crm", getAllCrms);

export default router;