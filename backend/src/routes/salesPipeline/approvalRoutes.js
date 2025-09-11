import { Router } from 'express';
import { createApproval } from '../../controllers/salesPipelineController/approvalController.js';

const router = Router();
router.post('/', createApproval);

export default router;
