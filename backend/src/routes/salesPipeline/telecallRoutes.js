import { Router } from 'express';
import { createTelecall } from '../../controllers/salesPipelineController/telecallController.js';
const router = Router();

router.post('/', createTelecall);

// Telecall
router.get('/',
  (req, res) => res.json({ items: [] })
);


export default router;
