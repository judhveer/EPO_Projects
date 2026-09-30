import cron from 'node-cron';
import { runLeaveAllocationJob } from '../../services/attendance/leaveAllocationJob.js';

// Runs daily at 00:30 IST — after midnight so "today" (used internally via todayISTDateOnly()) has already rolled over cleanly, well before anyone starts checking in. `timezone: 'Asia/Kolkata'` is passed explicitly rather than relying on the server's ambient OS timezone — node-cron schedules run in server-local time by default, and we already found process.env.TZ isn't reliably set anywhere at process startup. Same reasoning as everywhere else in this build: never trust ambient timezone, always be explicit.
export function startLeaveAllocationJob(){
    cron.schedule('30 0 * * *', async() => {
        console.log('[leaveAllocationJob] Starting scheduled run...');
        try{
            await runLeaveAllocationJob();
        }
        catch(err){
            console.error('[leaveAllocationJob] Unhandled error during scheduled run:', err);
        }
    }, { timezone: 'Asia/Kolkata' });

    console.log('[leaveAllocationJob] Scheduled for 00:30 IST daily.');
}
