import express from 'express';
import * as holidayController from '../../controllers/attendanceController/holiday.controller.js';

const router = express.Router();

router.get('/', holidayController.getHolidays); // every authenticated user can VIEW the holiday calendar
router.post('/', holidayController.postHoliday); // approver check inside controller
router.patch('/:id/deactivate', holidayController.patchDeactivateHoliday);

export default router;