import cron from "node-cron";
import { generateWeeklyTaskReport } from "../../reports/taskbot/weeklyTaskReport.js";

console.log("🕓 Weekly report scheduler initialized.");

export function startTaskReportJob() {
  // Every Monday at 10 AM (10:00)
  // "0 10 * * MON"
  cron.schedule("0 10 * * MON", async () => {
    console.log("🧾 Running scheduled Task Bot weekly report...");
    await generateWeeklyTaskReport();
  }, { timezone: "Asia/Kolkata" } );
}
