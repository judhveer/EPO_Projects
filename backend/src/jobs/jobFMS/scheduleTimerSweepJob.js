import cron from "node-cron";
import { runTimerSweep } from "../../services/jobFms/timerSweep.service.js";

// Safety net for "pause timers at check-out". Off unless TIMER_SWEEP_ENABLED=true, because
// it must only be switched on once Start/Resume require a check-in (otherwise it would keep
// pausing people who work without checking in).
//
// Runs 5 minutes after each auto-closer run (which fires at :00/:15/:30/:45), so a timer the
// auto-closer failed to pause is caught right after. TIMER_SWEEP_CRON overrides the schedule
// (for testing only, e.g. "* * * * *").
const DEFAULT_CRON = "5,20,35,50 * * * *";

export function startTimerSweepJob() {
  if (process.env.TIMER_SWEEP_ENABLED !== "true") {
    console.log("[timerSweepJob] Disabled (set TIMER_SWEEP_ENABLED=true to enable).");
    return;
  }

  const expr = cron.validate(process.env.TIMER_SWEEP_CRON || "")
    ? process.env.TIMER_SWEEP_CRON
    : DEFAULT_CRON;

  let running = false; // overlap guard: a slow run must never stack with the next one

  cron.schedule( expr, async () => {
      if (running) return;
      running = true;
      try {
        const r = await runTimerSweep();
        if (r.swept || r.failed || r.orphanLogsClosed) {
          console.log(
            `[timerSweepJob] candidates=${r.candidates} swept=${r.swept} skippedOpenShift=${r.skippedOpenShift} failed=${r.failed} orphanLogsClosed=${r.orphanLogsClosed}`,
          );
        }
      } catch (err) {
        console.error("[timerSweepJob] Unhandled error:", err);
      } finally {
        running = false;
      }
    },
    { timezone: "Asia/Kolkata" },
  );

  console.log(`[timerSweepJob] Scheduled (${expr}).`);
}