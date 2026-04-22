import express from "express";
import { getItemsByCategory, getAllPaperTypes, getGsmByPaperType, getWideMaterialTypes, getGsmByWideMaterialTypes, getBindingsByCategory, getSizes, calculateItemController, } from "../../controllers/jobFmsController/itemMaster.controller.js";

const router = express.Router();

router.get("/by-category", getItemsByCategory);
// router.get("/by-category", getItemsByCategory);
router.get("/paper-types", getAllPaperTypes);
router.get("/paper-types/gsm", getGsmByPaperType);
router.get("/wide-materials", getWideMaterialTypes);
router.get("/wide-materials/gsm", getGsmByWideMaterialTypes);
router.get("/sizes", getSizes);
router.get("/bindings", getBindingsByCategory);
router.post("/calculate-item", calculateItemController);



export default router;