import cron from "node-cron";
import { sweepWaitingJobs } from "../../services/jobFms/designerAssignment.service.js";

// Every minute: jobs that were left in coordinator_review because no designer
// was available (nobody checked in yet, all on leave...) are assigned as soon as
// an eligible designer exists. Urgent first, then oldest first.
//
// Safe with several PM2 instances: the assignment itself takes a DB lock and
// re-checks the job status, so only one instance can assign a given job.
//
// Kill switch: set DESIGNER_SWEEP_ENABLED=false in .env to stop it without a deploy.
export function startDesignerSweepJob() {
  if (process.env.DESIGNER_SWEEP_ENABLED === "false") {
    console.log("[designerSweepJob] Disabled via DESIGNER_SWEEP_ENABLED=false.");
    return;
  }

  cron.schedule(
    "* * * * *",
    async () => {
      try {
        const r = await sweepWaitingJobs();
        if (r.assigned > 0) {
          console.log(`[designerSweepJob] assigned ${r.assigned}/${r.checked} waiting job(s).`);
        }
      } catch (err) {
        console.error("[designerSweepJob] Unhandled error:", err);
      }
    },
    { timezone: "Asia/Kolkata" },
  );

  console.log("[designerSweepJob] Scheduled to run every minute.");
}