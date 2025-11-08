import express from "express";
import {getClientNames, getFullDetails} from "../../controllers/jobFmsController/clientDetails.controller.js";

const router = express.Router();

router.get("/search", getClientNames);

router.get("/:client_name", getFullDetails);


export default router;