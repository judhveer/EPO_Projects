import { Router } from 'express';
import { listLeads, getLead, getNextTicketId } from '../../controllers/salesPipelineController/leadController.js';
import { exportLeads } from '../../controllers/salesPipelineController/exportController.js'

const router = Router();

router.get('/', listLeads);
router.get('/export/excel', exportLeads);
router.get('/next-id', getNextTicketId);
router.get('/:ticketId', getLead);

export default router;
