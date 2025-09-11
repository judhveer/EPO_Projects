import { Router } from 'express';
import { createTelecall } from '../../controllers/salesPipelineController/telecallController.js';
const router = Router();

router.post('/', createTelecall);

export default router;
