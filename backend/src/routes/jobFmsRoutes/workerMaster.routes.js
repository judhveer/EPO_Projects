import { Router } from "express";
import authenticate from "../../middlewares/authenticate.js";
import { getWorkers, createWorker, updateWorker } from "../../controllers/jobFmsController/workerMaster.controller.js";

const router = Router();
router.use(authenticate);

router.get("/", getWorkers);
router.post("/", createWorker);
router.patch("/:id", updateWorker);

export default router;