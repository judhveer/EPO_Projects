import express from "express";
import multer from "multer";
import { getJobsForProduction, 
        getValidStagesForJob, 
        advanceProductionStage, 
        revertProductionStage, 
        markJobDelivered, 
        getDeliveredJobs, 
        orderComplete 
    } from "../../controllers/jobFmsController/production.controller.js";

const router = express.Router();

// ── Multer config: in-memory buffer (we stream straight to Google Drive) ──
const challanUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
    fileFilter: (req, file, cd) => {
        const allowed = ["application/pdf", "image/jpeg", "image/jpg", "image/png"];
        if (allowed.includes(file.mimetype)) {
            cd(null, true);
        }else{
            cd(new Error("Only PDF, JPG, and PNG files are allowed for challan."), false);
        }
    },
});

/**
 * Wraps a multer middleware so multer's errors (oversize, wrong mime, etc.)
 * return a clean 400 JSON instead of express's default HTML error page.
 */
const safeUpload = (multerMw) => (req, res, next) => {
    console.log("Processing file upload with multer...");
    multerMw(req, res, (err) => {
        if(err) {
            const status = err.code === "LIMIT_FILE_SIZE" ? 400 : 400; // multer's file size error code
            return res.status(status).json({ message: err.message || "Upload failed." });
        }
        next();
    });
};

// ── Production Pipeline (Tab 1) ──
router.get("/", getJobsForProduction);
router.get("/:job_no/valid-stages", getValidStagesForJob);
router.post("/:job_no/advance-stage", advanceProductionStage);
router.post("/:job_no/revert-stage", revertProductionStage);
router.post("/:job_no/mark-delivered", markJobDelivered);

// ── Completion (Tab 2) ─────────────────────────────────────────────────
// completion-list MUST come before :job_no/complete in the file, but Express
// matches by exact path so order isn't strictly required. Grouped for clarity.
router.get("/completion-list", getDeliveredJobs);
router.post("/:job_no/complete", safeUpload(challanUpload.single("challan_file")), orderComplete);


export default router;