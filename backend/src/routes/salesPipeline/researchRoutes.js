import { Router } from 'express';
import { createResearch } from '../../controllers/salesPipelineController/researchController.js';
const router = Router();

router.post('/', createResearch);

export default router;
