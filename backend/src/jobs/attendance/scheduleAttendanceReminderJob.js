import cron from 'node-cron';
import { runAttendanceReminderJob } from '../../services/attendance/attendanceReminderJob.js';

// Every 15 minutes — the job's own internal threshold check (against
// the admin-configurable reminder_delay_minutes) decides whether
// anything actually needs sending on a given run, not the cron
// schedule itself. This is what lets the reminder TIME stay
// admin-tunable via AttendanceSettings without ever needing to
// reschedule or restart this cron task.
export function startAttendanceReminderJob() {
  cron.schedule('*/15 * * * *', async () => {
    try {
      await runAttendanceReminderJob();
    } catch (err) {
      console.error('[attendanceReminderJob] Unhandled error:', err);
    }
  }, { timezone: 'Asia/Kolkata' });

  console.log('[attendanceReminderJob] Scheduled to check every 15 minutes.');
}