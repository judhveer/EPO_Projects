console.log("itemMaster routes loaded");
import express from "express";
import { getItemsByCategory, getAllPaperTypes, getGsmByPaperType, getBindingsByCategory, getSizes, calculateItemController, calculateTotalAmountAfterRemoval} from "../../controllers/jobFmsController/itemMaster.controller.js";

const router = express.Router();

router.get("/by-category", getItemsByCategory);
// router.get("/by-category", getItemsByCategory);
router.get("/paper-types", getAllPaperTypes);
router.get("/paper-types/gsm", getGsmByPaperType);
router.get("/sizes", getSizes);
router.get("/bindings", getBindingsByCategory);
router.post("/calculate-item", calculateItemController);
router.post("/calculate-total-amount", calculateTotalAmountAfterRemoval);



export default router;