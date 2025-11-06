import express from "express";
import {
    createJobCard,
    getAllJobCards,
    getJobCardByJobNo,
    updateJobCard,
    deleteJobCard,
} from "../../controllers/jobFmsController/jobCard.controller.js";

const router = express.Router();

router.post("/", createJobCard);
router.get("/", getAllJobCards);
router.get("/:id", getJobCardByJobNo);
router.put("/:id", updateJobCard);
router.delete("/:id", deleteJobCard);

export default router;