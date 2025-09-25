import express from 'express';
import attendanceController from '../../controllers/attendanceController/attendanceController.js';
// src/routes/Attendance/attendance.js
import models from '../../models/index.js';   // <- note the .js
const { Attendance, TelegramUser, sequelize } = models;

import { syncAllAttendance } from "../../controllers/attendanceController/fetchAllDataFromSheet.js";

const router = express.Router();


router.get('/sync', attendanceController.syncAttendance);


// // route/controller wrapper (express)
// app.get('/api/attendance/sync', async (req, res) => {
//   if (isSyncing) return res.status(429).json({ error: 'Sync in progress' });

//   isSyncing = true;
//   // respond immediately
//   res.status(202).json({ message: 'Sync started' });

//   // run sync asynchronously (don't await)
//   (async () => {
//     try {
//       await runSyncAttendance(); // move your big logic into runSyncAttendance()
//       console.log('Background sync finished');
//     } catch (err) {
//       console.error('Background sync failed', err);
//     } finally {
//       isSyncing = false;
//     }
//   })();
// });



router.get('/', attendanceController.listAttendance);              // main attendance list (filtered, paginated)
router.get('/summary', attendanceController.attendanceSummary);    // dashboard stats summary
router.get('/absent', attendanceController.absentList);            // absent employees list
router.get('/employees', attendanceController.getEmployees);       // list of all employees



router.post('/bulk-insert', attendanceController.bulkInsertAttendance);
router.get('/syncAll', syncAllAttendance);


// Add other endpoints here...
export default router;
