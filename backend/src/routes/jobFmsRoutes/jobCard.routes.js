import express from "express";
import {
    createJobCard,
    getAllJobCards,
    getJobCardByJobNo,
    updateJobCard,
    deleteJobCard,
    getEnquiryForItems
} from "../../controllers/jobFmsController/jobCard.controller.js";

const router = express.Router();

router.post("/", createJobCard);
router.get("/", getAllJobCards);
router.get("/:id", getJobCardByJobNo);
router.put("/:id", updateJobCard);
router.delete("/:id", deleteJobCard);


// list the enquiry for items:
router.get("/enquiry/items", getEnquiryForItems);

export default router;