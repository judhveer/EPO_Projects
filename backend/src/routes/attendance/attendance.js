import express from 'express';
import attendanceController from '../../controllers/attendanceController/attendanceController.js';
import employeeAttendanceController from "../../controllers/attendanceController/employeeAttendance.controller.js";
import { patchOverrideAttendance } from '../../controllers/attendanceController/attendanceOverride.controller.js';
import { getSettings, patchSettings } from '../../controllers/attendanceController/attendanceSettings.controller.js';
import { postRunLeaveAllocation, postRunAttendanceResolution } from '../../controllers/attendanceController/attendanceSettings.controller.js';

const router = express.Router();


// ── NEW: Employee self-service ──────────────────────────────────────
// authenticate is now applied at the app.js mount level, so every route below already requires a valid, active user.
// No additional role check needed here — assertTrackable() inside the controller handles the one real restriction (BOSS excluded), since that's a data-dependent check, not a static role gate a router-level middleware could express cleanly.
router.post('/check-in', employeeAttendanceController.checkIn);
router.post('/check-out', employeeAttendanceController.checkOut);
router.get('/me/today', employeeAttendanceController.getMyTodayStatus);
router.get('/me/summary', employeeAttendanceController.getMySummary);
router.patch('/override', patchOverrideAttendance); // approver check happens inside the service — same reasoning as everywhere else

router.get('/settings', getSettings);
router.patch('/settings', patchSettings);
router.post('/jobs/run-leave-allocation', postRunLeaveAllocation);
router.post('/jobs/run-attendance-resolution', postRunAttendanceResolution);
// ── Company-wide attendance data — rewritten against the new schema.
router.get('/', attendanceController.listAttendance);              // main attendance list (filtered, paginated)
router.get('/summary', attendanceController.attendanceSummary);    // dashboard stats summary
router.get('/absent', attendanceController.absentList);            // absent employees list
router.get('/employees', attendanceController.getEmployees);       // list of all employees


// Add other endpoints here...
export default router;
