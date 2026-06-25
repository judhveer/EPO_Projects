import express from "express";
import {
    getJobsForAccounts,
    updateBillInfo,
    updatePaymentStatus,
} from "../../controllers/jobFmsController/accounts.controller.js";

import authenticate  from "../../middlewares/authenticate.js";

const router = express.Router();


// All routes require a valid session
router.use(authenticate);
// /api/fms/accounts
router.get("/",                       getJobsForAccounts);
router.patch("/:job_no/bill",         updateBillInfo);
router.patch("/:job_no/payment",      updatePaymentStatus);

export default router;

