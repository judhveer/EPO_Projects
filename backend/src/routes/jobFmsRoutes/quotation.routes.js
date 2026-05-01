// routes/quotation.routes.js
import express from "express";
import { 
    generateQuotationPDF,   
    createQuotation,
    getQuotationForJob,
    listQuotations,
} from "../../controllers/jobFmsController/quotation.controller.js";

const router = express.Router();
router.post("/generate-pdf", generateQuotationPDF);
router.post("/",                  createQuotation);        // new
router.get("/",                   listQuotations);         // new
router.get("/:refNo/for-job",     getQuotationForJob);    // new
export default router;