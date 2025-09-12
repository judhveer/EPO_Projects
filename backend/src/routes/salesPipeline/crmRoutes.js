import { Router } from 'express';
import { createCrmFollowup } from '../../controllers/salesPipelineController/crmController.js';
const router = Router();

router.post('/', createCrmFollowup);

router.get('/',
  (req, res) => res.json({ items: [] })
);

export default router;
