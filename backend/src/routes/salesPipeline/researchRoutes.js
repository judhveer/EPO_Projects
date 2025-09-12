import { Router } from 'express';
import { createResearch } from '../../controllers/salesPipelineController/researchController.js';
import authenticate from '../../middlewares/authenticate.js';
import { requirePermission } from '../../middlewares/authorize.js';
const router = Router();



router.post('/', createResearch);

// Research
router.get('/', (req, res) => res.json({data: []}));

export default router;
