import { overrideAttendanceStatus } from '../../services/attendance/attendanceOverrideService.js';

export async function patchOverrideAttendance(req, res) {
    try {
        const { employee_id, shift_date, new_status, reason, check_in_time, check_out_time } = req.body;

        if (!employee_id || !shift_date || !new_status) {
            return res.status(400).json({ error: 'employee_id, shift_date, and new_status are required.' });
        }
        const record = await overrideAttendanceStatus({
            employeeId: employee_id,
            shiftDate: shift_date,
            newStatus: new_status,
            reason, 
            actor: req.user,
            checkInTime: check_in_time, 
            checkOutTime: check_out_time,
        });
        res.json({ message: 'Attendance status updated.', attendance: record });
    } catch (err) {
        console.error('[attendanceOverride.controller]', err);
        res.status(err.statusCode || 500).json({ 
            error: err.statusCode ? err.message : 'Failed to override attendance.' 
        });
    }
}