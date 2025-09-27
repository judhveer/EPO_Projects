// jobs/scheduleWeeklyReport.js
import cron  from 'node-cron';
import { DateTime }  from 'luxon';
import { generateWeeklyAttendancePDF }  from '../../reports/weeklyAttendance.js';
import { sendWeeklyAttendanceReport }  from '../../email/attendance/sendReport.js'; 
import week  from '../../utils/attendance/week.js';
const { ZONE } = week;

export function startWeeklyReportJob() {
  // Every Sunday at 08:00 (IST)
  
  // 0 8 * * 0
  cron.schedule('0 8 * * 0', async () => {
    try {
      const now = DateTime.now().setZone(ZONE);
      console.log(`[WeeklyReport] Starting at ${now.toISO()}`);

      const { outPath, startStr, endStr, agg, performers } = await generateWeeklyAttendancePDF({ when: now });

      console.log("generating Weekly Attendance step 11.......");

      const subject = `Weekly Attendance Report (Mon-Sat: ${startStr} → ${endStr})`;
      const html = `
        <p>Hello,</p>
        <p>Please find attached the weekly attendance report for <b>${startStr}</b> to <b>${endStr}</b>.</p>
        <ul>
          <li>Total Employees: ${agg.length}</li>
          <li>Perfect Attendance: ${performers.perfectAttendance.length}</li>
          <li>Late ≥ 3 Days: ${performers.late3plus.length}</li>
        </ul>
        <p>— EPO Attendance System</p>
      `;

      console.log("generating Weekly Attendance step 12.......");

      await sendWeeklyAttendanceReport({
        to: process.env.REPORT_TO || process.env.EMAIL_USER,
        subject, html, attachmentPath: outPath,
      });

      console.log(`[WeeklyReport] Sent: ${outPath}`);
    } catch (err) {
      console.error('[WeeklyReport] ERROR:', err);
    }
  }, { timezone: ZONE });
}

