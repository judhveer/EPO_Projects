import { Router } from 'express';
import { createCrmFollowup } from '../../controllers/salesPipelineController/crmController.js';
const router = Router();

router.post('/', createCrmFollowup);

export default router;
