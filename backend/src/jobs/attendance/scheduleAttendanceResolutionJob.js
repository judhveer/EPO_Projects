import cron from 'node-cron';
import { runAttendanceResolutionJob } from '../../services/attendance/attendanceResolutionJob.js';

// 00:45 IST — deliberately 15 minutes AFTER the leave allocation job
// (00:30), so anyone crossing their 6-month eligibility mark today
// already has an allocation in place before this job might need to
// auto-deduct from it for yesterday. Well after midnight so
// "yesterday" has fully, cleanly elapsed in IST first.
export function startAttendanceResolutionJob() {
  cron.schedule('45 0 * * *', async () => {
    console.log('[attendanceResolutionJob] Starting scheduled run...');
    try {
      await runAttendanceResolutionJob();
    } catch (err) {
      console.error('[attendanceResolutionJob] Unhandled error during scheduled run:', err);
    }
  }, { timezone: 'Asia/Kolkata' });

  console.log('[attendanceResolutionJob] Scheduled for 00:45 IST daily.');
}