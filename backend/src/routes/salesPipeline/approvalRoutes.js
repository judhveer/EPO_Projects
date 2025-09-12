import { Router } from 'express';
import { createApproval } from '../../controllers/salesPipelineController/approvalController.js';

const router = Router();
router.post('/', createApproval);

// Approval
router.get('/',
  (req, res) => res.json({ items: [] })
);

export default router;
