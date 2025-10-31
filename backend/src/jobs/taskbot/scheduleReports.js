import cron from "node-cron";
import { generateWeeklyTaskReport } from "../../reports/taskbot/weeklyTaskReport.js";

console.log("🕓 Weekly report scheduler initialized.");

export function startTaskReportJob() {
  // Every Saturday at 8 PM (20:00)
  // 0 20 * * 6
  cron.schedule("0 18 * * 6", async () => {
    console.log("🧾 Running scheduled Task Bot weekly report...");
    await generateWeeklyTaskReport();
  }, { timezone: "Asia/Kolkata" } );
}
