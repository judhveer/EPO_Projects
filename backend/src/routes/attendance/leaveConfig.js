import express from 'express';
import * as controller from '../../controllers/attendanceController/leaveConfig.controller.js';

const router = express.Router();
router.get('/types', controller.listLeaveTypes);
router.post('/types', controller.createLeaveType);
router.patch('/types/:id', controller.updateLeaveType);
router.post('/policies', controller.createLeavePolicy);
router.post('/recompute-allocation', controller.postRecomputeAllocation);
export default router;