// jobs/scheduleAccountantMonthlyReport.js
import cron  from 'node-cron';
import { DateTime }  from 'luxon';
import { generateAccountantMonthlyPDF }  from '../../reports/accountantMonthly.js';
import { sendWeeklyAttendanceReport }  from '../../email/attendance/sendReport.js'; // your existing generic mailer
import week  from '../../utils/attendance/week.js';
const { ZONE } = week;

export function startAccountantMonthlyReportJob() {
  // 1st of every month at 08:15 IST
//   '15 8 1 * *'
  cron.schedule('* * * * *', async () => {
    try {
      const now = DateTime.now().setZone(ZONE);
      console.log(`[AccountantMonthly] Starting at ${now.toISO()}`);

      const { outPath, monthName, workingDays, agg } =
        await generateAccountantMonthlyPDF({ when: now });

      const subject = `Accountant Monthly Report — ${monthName}`;
      const html = `
        <p>Hello,</p>
        <p>Attached is the accountant monthly report for <b>${monthName}</b>.</p>
        <ul>
          <li>Employees: ${agg.length}</li>
          <li>Working Days (Mon-Sat): ${workingDays}</li>
        </ul>
        <p>— EPO Attendance System</p>
      `;

      await sendWeeklyAttendanceReport({
        to: process.env.REPORT_TO || process.env.EMAIL_USER,
        subject, html, attachmentPath: outPath,
      });

      console.log(`[AccountantMonthly] Sent: ${outPath}`);
    } catch (err) {
      console.error('[AccountantMonthly] ERROR:', err);
    }
  }, { timezone: ZONE });
}
