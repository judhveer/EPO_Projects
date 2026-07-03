import { Router } from 'express';
import {
    listPapers,
    createPaper,
    updatePaper,
    deletePaper,
} from "../controllers/adminPapers.controller.js";

const router = Router();

router.get("/", listPapers);
router.post("/", createPaper);
router.patch("/:id", updatePaper);
router.delete("/:id", deletePaper);

export default router;

