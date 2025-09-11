import { Router } from 'express';
import { listLeads, getLead, getNextTicketId } from '../../controllers/salesPipelineController/leadController.js';

const router = Router();

router.get('/', listLeads);
router.get('/next-id', getNextTicketId);
router.get('/:ticketId', getLead);

export default router;
