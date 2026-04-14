// routes/quotation.routes.js
import express from "express";
import { generateQuotationPDF } from "../../controllers/jobFmsController/quotation.controller.js";

const router = express.Router();
router.post("/generate-pdf", generateQuotationPDF);
export default router;