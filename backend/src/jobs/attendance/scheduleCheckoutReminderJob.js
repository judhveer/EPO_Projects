import cron from 'node-cron';
import { runCheckoutReminderJob } from '../../services/attendance/checkoutReminderJob.js';

// Every 15 minutes — same reasoning as the morning reminder: the job's
// OWN internal timing math decides whether 30 minutes have genuinely
// passed since the last send, not the cron schedule itself. Running
// the check more often than the reminder interval means a slightly
// delayed cron tick never pushes someone's actual reminder cadence off
// by much.
export function startCheckoutReminderJob() {
  cron.schedule('*/15 * * * *', async () => {
    try {
      await runCheckoutReminderJob();
    } catch (err) {
      console.error('[checkoutReminderJob] Unhandled error:', err);
    }
  }, { timezone: 'Asia/Kolkata' });

  console.log('[checkoutReminderJob] Scheduled to check every 15 minutes.');
}