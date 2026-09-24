import express from 'express';
import * as leaveController from '../../controllers/attendanceController/leaveRequest.controller.js';

const router = express.Router();

router.get('/types', leaveController.listActiveLeaveTypes);
router.get('/me/balance', leaveController.getMyBalance);
router.post('/requests', leaveController.createLeaveRequest);
router.get('/requests/me', leaveController.getMyLeaveRequests);
router.get('/requests/pending', leaveController.getPendingApprovals); // approver check happens inside the controller — data-dependent, same reasoning as assertTrackable
router.patch('/requests/:id/approve', leaveController.approveRequest);
router.patch('/requests/:id/reject', leaveController.rejectRequest);
router.patch('/requests/:id/cancel', leaveController.cancelRequest);
router.get('/estimate', leaveController.getLeaveEstimate);


export default router;