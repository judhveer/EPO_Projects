import express from "express";
import {
    createJobCard,
    getAllJobCards,
    getJobCardByJobNo,
    updateJobCard,
    deleteJobCard,
    getEnquiryForItems,
    cancelJobCard
} from "../../controllers/jobFmsController/jobCard.controller.js";

const router = express.Router();

router.post("/", createJobCard);
router.get("/", getAllJobCards);
router.get("/:job_no", getJobCardByJobNo);
router.put("/:job_no", updateJobCard);
router.delete("/:job_no", deleteJobCard);
router.patch("/:job_no/cancel", cancelJobCard);


// list the enquiry for items:
router.get("/enquiry/items", getEnquiryForItems);

export default router;