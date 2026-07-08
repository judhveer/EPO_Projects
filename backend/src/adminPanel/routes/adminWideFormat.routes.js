import express from "express";
import {
  listWideFormats,
  createWideFormat,
  updateWideFormat,
  deleteWideFormat,
} from "../controllers/adminWideFormat.controller.js";

const router = express.Router();

router.get("/",       listWideFormats);
router.post("/",      createWideFormat);
router.patch("/:id",  updateWideFormat);
router.delete("/:id", deleteWideFormat);

export default router;