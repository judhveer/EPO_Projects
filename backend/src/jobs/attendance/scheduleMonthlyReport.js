import cron  from 'node-cron';
import { DateTime }  from 'luxon';
import MonthlyReport  from '../../reports/monthlyAttendance.js';
const { generateMonthlyAttendancePDF } = MonthlyReport;
import { sendWeeklyAttendanceReport }  from '../../email/attendance/sendReport.js'; 

const ZONE = 'Asia/Kolkata';

export function startMonthlyReportJob() {
  // Run on the 1st of every month at 08:00 IST, for the previous month
  // '0 8 1 * *'
  cron.schedule('0 8 1 * *', async () => {
    try {
      const now = DateTime.now().setZone(ZONE);
      console.log(`[MonthlyReport] Starting at ${now.toISO()}`);

      const { outPath, monthName, workingDays, agg, performers } =
        await generateMonthlyAttendancePDF({ when: now });

      const subject = `Monthly Attendance Report — ${monthName}`;
      const html = `
        <p>Hello,</p>
        <p>Please find attached the monthly attendance report for <b>${monthName}</b>.</p>
        <ul>
          <li>Total Employees: ${agg.length}</li>
          <li>Working Days (Mon–Sat): ${workingDays}</li>
          <li>Perfect Attendance: ${performers.perfectAttendance.length}</li>
          <li>Late ≥ threshold: ${performers.lateFlag.length}</li>
        </ul>
        <p>— EPO Attendance System</p>
      `;

      await sendWeeklyAttendanceReport({
        to: process.env.REPORT_TO || process.env.EMAIL_USER,
        subject, html, attachmentPath: outPath,
      });

      console.log(`[MonthlyReport] Sent: ${outPath}`);
    } catch (err) {
      console.error('[MonthlyReport] ERROR:', err);
    }
  }, { timezone: ZONE });
}
