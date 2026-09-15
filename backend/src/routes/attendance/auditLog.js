import express from 'express';
import { listAuditLog } from '../../controllers/attendanceController/auditLog.controller.js';
const router = express.Router();
router.get('/', listAuditLog); // visibility gated in frontend routing (BOSS/ADMIN/HR) — this endpoint itself has no further per-row sensitivity requiring server-side restriction beyond "must be authenticated", same reasoning as GET /api/holidays
export default router;