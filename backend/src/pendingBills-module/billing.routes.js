import express from "express";
import { fetchPendingBilling } from "./billing.controller.js";

const router = express.Router();

router.get("/pending-bills", fetchPendingBilling);

export default router;

