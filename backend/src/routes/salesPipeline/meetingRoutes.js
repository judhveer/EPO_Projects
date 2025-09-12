import { Router } from 'express';
import { createMeetingOutcome } from '../../controllers/salesPipelineController/meetingController.js';
const router = Router();

router.post('/', createMeetingOutcome);

// Meeting
router.get('/',
  (req, res) => res.json({ items: [] })
);

export default router;
