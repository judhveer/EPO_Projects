import { Router } from 'express';
import { createMeetingOutcome } from '../../controllers/salesPipelineController/meetingController.js';
const router = Router();

router.post('/', createMeetingOutcome);

export default router;
