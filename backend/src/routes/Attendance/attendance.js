import express from 'express';
import attendanceController from '../../controllers/attendanceController/attendanceController.js';
// src/routes/Attendance/attendance.js
import models from '../../models/index.js';   // <- note the .js
const { Attendance, TelegramUser, sequelize } = models;

import { syncAllAttendance } from "../../controllers/attendanceController/fetchAllDataFromSheet.js";

const router = express.Router();


router.get('/sync', attendanceController.syncAttendance);


router.get('/', attendanceController.listAttendance);              // main attendance list (filtered, paginated)
router.get('/summary', attendanceController.attendanceSummary);    // dashboard stats summary
router.get('/absent', attendanceController.absentList);            // absent employees list
router.get('/employees', attendanceController.getEmployees);       // list of all employees


// Add to attendanceRoutes.js
// router.get('/debug', async (req, res) => {
//   const record = await Attendance.findAll();
//   res.json(record);
// });


router.post('/bulk-insert', attendanceController.bulkInsertAttendance);
router.get('/syncAll', syncAllAttendance);


// Add other endpoints here...
export default router;
