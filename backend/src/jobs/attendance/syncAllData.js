import axios from "axios";
import cron from "node-cron";
const BASE_URL = process.env.BASE_URL;
import attendanceController from "../../controllers/attendanceController/attendanceController.js";
let { isSyncing } = attendanceController;

export function AttendanceSyncAll() {
  // syncAll
  // mon-sat 11:59 pm
  cron.schedule(
    "*/5 * * * 1-6",
    async () => {
      try {
        console.log("Running Attendance SyncAll");
        const res = await axios.get(`${BASE_URL}/api/attendance/syncAll`);
        console.log("Attendance syncAll result:", res.data);
      } catch (error) {
        console.error(
          "Attendance sync cron failed:",
          error.response?.data || error.message
        );
      }
    },
    { timezone: "Asia/Kolkata" }
  );

  cron.schedule(
    "06 15 * * 1-6",
    async () => {
      try {
        console.log("Running Attendance SyncAll");
        const res = await axios.get(`${BASE_URL}/api/attendance/syncAll`);
        console.log("Attendance syncAll result:", res.data);
      } catch (error) {
        console.error(
          "Attendance sync cron failed:",
          error.response?.data || error.message
        );
      }
    },
    { timezone: "Asia/Kolkata" }
  );

  // schedule cron job to run every Sunday at 4 AM
  cron.schedule(
    "0 4 * * 0",
    async () => {
      try {
        console.log("Running Attendance SyncAll");
        const res = await axios.get(`${BASE_URL}/api/attendance/syncAll`);
        console.log("Attendance syncAll result:", res.data);
      } catch (error) {
        console.error(
          "Attendance sync cron failed:",
          error.response?.data || error.message
        );
      }
    },
    { timezone: "Asia/Kolkata" }
  );

  // sync
  // everyday at 12 noon
  cron.schedule(
    "0 12 * * *",
    async () => {
      if (isSyncing) {
        console.log("Sync already running (cron).");
        return;
      }
      try {
        console.log("Running attendance sync cron job (office hours)...");
        const res = await axios.get(`${BASE_URL}/api/attendance/sync`);
        console.log("Attendance sync result:", res.data);
      } catch (error) {
        console.error(
          "Attendance sync cron failed:",
          error.response?.data || error.response?.message || error.message
        );
      }
    },
    { timezone: "Asia/Kolkata" }
  );

  // everyday at 10:00 PM
  cron.schedule(
    "0 22 * * *",
    async () => {
      if (isSyncing) {
        console.log("Sync already running (cron).");
        return;
      }
      try {
        console.log("Running attendance sync cron job (office hours)...");
        const res = await axios.get(`${BASE_URL}/api/attendance/sync`);
        console.log("Attendance sync result:", res.data);
      } catch (error) {
        console.error(
          "Attendance sync cron failed:",
          error.response?.data || error.response?.message || error.message
        );
      }
    },
    { timezone: "Asia/Kolkata" }
  );
}
