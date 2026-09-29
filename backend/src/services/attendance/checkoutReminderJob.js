import { Op } from 'sequelize';
import { DateTime } from 'luxon';
import models from '../../models/index.js';
import { nowIST, istMomentOnDate, ZONE } from '../../utils/attendance/istTime.js';
import { getAttendanceSettings } from './attendanceSettingsService.js';
import { computeOvertime } from './attendanceCalculations.js';
import { writeAuditLog } from './auditLogService.js';
import { OVERNIGHT_CUTOFF_HOUR, latestExpiredShiftDate } from './currentShiftService.js';
import { sendPushToUser } from '../../utils/pushNotification.js';
import { sendMailForFMS } from '../../email/sendMail.js';


const { User, Attendance, CheckoutReminderLog } = models;

const REMINDER_INTERVAL_MINUTES = 30

// Checked in, never checked out.
const OPEN_SHIFT = { check_in_time: { [Op.ne]: null }, check_out_time: null };

export async function runCheckoutReminderJob() {
  const settings = await getAttendanceSettings();
  const now = nowIST();

  // ── 1. Catch-up auto-close: EVERY tick, at any time of day ───────────
  // Closes every open shift whose window has expired, not just
  // yesterday's, so a missed run (server down) heals itself and nobody
  // stays blocked from checking in. Expired dates and the reminder
  // window below never overlap (the two-window rule).
  const expiredDate = latestExpiredShiftDate(now);
  const staleCount = await Attendance.count({
    where: { shift_date: { [Op.lte]: expiredDate }, ...OPEN_SHIFT },
  });
  const autoClosed = staleCount > 0 ? await runAutoCheckoutJob(expiredDate) : null;

  // ── 2. Reminders ─────────────────────────────────────────────────────
  // Shift end = shift start + overtime threshold + grace (confirmed
  // formula; grace_minutes is the same field as morning lateness).
  const shiftEndOnDate = (dateOnly) =>
    istMomentOnDate(dateOnly, settings.shift_start_hour, settings.shift_start_minute)
      .plus({ minutes: settings.overtime_threshold_minutes + settings.grace_minutes });

  // The reminder window for a shift date D is [D 18:15, D+1 06:00). It
  // closes at the fixed overnight cutoff, the last moment a manual
  // check-out is still allowed.
  const todayDate = now.toISODate();
  const yesterdayDate = now.minus({ days: 1 }).toISODate();
  const todayCutoff = istMomentOnDate(todayDate, OVERNIGHT_CUTOFF_HOUR, 0);

  let targetShiftDate = null;
  if (now >= shiftEndOnDate(todayDate)) {
    targetShiftDate = todayDate;
  } else if (now < todayCutoff) {
    targetShiftDate = yesterdayDate;
  }

  if (!targetShiftDate) {
    return { checked: 0, reminded: 0, autoClosed, reason: 'Outside the reminder window right now.' };
  }

  const openShifts = await Attendance.findAll({
    where: { 
      shift_date: targetShiftDate, 
      ...OPEN_SHIFT 
    },
    include: [{ 
      model: User, 
      as: 'employee', 
      attributes: ['id', 'username', 'email'], 
      where: { isActive: true } 
    }],
  });

  let reminded = 0;

  for (const record of openShifts) {
    const employee = record.employee;
    if (!employee) continue;

    const lastReminder = await CheckoutReminderLog.findOne({
      where: { 
        employee_id: employee.id, 
        shift_date: targetShiftDate 
      },
      order: [['sent_at', 'DESC']],
    });

    // Self-healing guard against an early/late/skipped cron tick.
    if (
      lastReminder &&
      now.diff(DateTime.fromJSDate(lastReminder.sent_at).setZone(ZONE), 'minutes').minutes < REMINDER_INTERVAL_MINUTES
    ) {
      continue;
    }

    const isFirstReminder = !lastReminder;

    try {
      await sendPushToUser(employee.id, {
        title: 'Forgot to check out?',
        body: "If you're working overtime, ignore this. Otherwise, your shift is over — please check out.",
        data: { url: '/attendance' },
      });

      // Email only on the very first reminder for this person/date.
      let emailSent = false;
      if (isFirstReminder && employee.email) {
        await sendMailForFMS({
          to: employee.email,
          subject: 'You forgot to check out',
          html: `
            <div style="font-family: Arial, Helvetica, sans-serif; color:#333; line-height:1.6">
              <img src="cid:epo-logo" height="50" style="margin-bottom:20px" />
              <h2 style="color:#b45309;">🕒 You haven't checked out yet</h2>
              <p>Hello ${employee.username},</p>
              <p>Our records show you checked in today but haven't checked out. If you're working overtime, please ignore this message. Otherwise, please check out as soon as possible.</p>
              <p style="font-size:12px; color:#888; margin-top:24px;">This is an automated reminder. Eastern Panorama Offset - FMS</p>
            </div>
          `,
        });
        emailSent = true;
      }

      await CheckoutReminderLog.create({
        employee_id: employee.id, shift_date: targetShiftDate, email_sent: emailSent,
      });
      reminded++;
    } catch (err) {
      console.error(`[checkoutReminderJob] Failed for employee ${employee.id}:`, err.message);
      // No log row on failure, so the next tick naturally retries.
    }
  }

  return { checked: openShifts.length, reminded, targetShiftDate, autoClosed };
}

/**
 * Force-closes every still-open shift on or before `latestExpiredDate`.
 * Auto-checkout = check_in_time + overtime_threshold_minutes, derived
 * from each person's own check-in, so it can never land before their
 * check-in. Audited, marked as system-guessed.
 *
 * Only shifts from the MOST RECENTLY expired date notify the employee;
 * older catch-up rows (e.g. found after downtime) are closed silently,
 * since a notification about a shift from weeks ago would be noise.
 */
export async function runAutoCheckoutJob(latestExpiredDate) {
  const settings = await getAttendanceSettings();

  const openShifts = await Attendance.findAll({
    where: { 
      shift_date: { 
        [Op.lte]: latestExpiredDate 
      }, 
      ...OPEN_SHIFT 
    },
    include: [{ 
      model: User, 
      as: 'employee', 
      attributes: ['id', 'username', 'email'] 
    }],
  });

  let closed = 0;

  for (const record of openShifts) {
    const employee = record.employee;
    if (!employee) continue;

    const derivedCheckout = new Date(
      new Date(record.check_in_time).getTime() + settings.overtime_threshold_minutes * 60000,
    );
    const { overtimeMinutes } = computeOvertime(record.check_in_time, derivedCheckout, settings);
    const shouldNotify = record.shift_date === latestExpiredDate;

    try {
      await record.update({ check_out_time: derivedCheckout, overtime_minutes: overtimeMinutes });

      await writeAuditLog({
        entityType: 'ATTENDANCE',
        entityId: record.id,
        action: 'AUTO_CHECKOUT',
        performedBy: null, // system-generated
        oldValue: { check_out_time: null },
        newValue: { check_out_time: derivedCheckout, note: 'System-guessed checkout — employee never checked out.' },
        reason: `Auto-closed: no checkout recorded for ${record.shift_date}. Derived as check-in + ${settings.overtime_threshold_minutes} minutes.`,
      });

      if (shouldNotify) {
        sendPushToUser(employee.id, {
          title: 'Shift Auto-Closed',
          body: "We noticed you didn't check out, so we've automatically closed your shift. Contact HR if this is wrong.",
          data: { url: '/attendance' },
        }).catch((err) => console.error(`[autoCheckoutJob] Push failed for ${employee.id}:`, err.message));

        if (employee.email) {
          sendMailForFMS({
            to: employee.email,
            subject: 'Your shift was automatically closed',
            html: `
              <div style="font-family: Arial, Helvetica, sans-serif; color:#333; line-height:1.6">
                <img src="cid:epo-logo" height="50" style="margin-bottom:20px" />
                <h2 style="color:#b45309;">🕒 Shift Auto-Closed</h2>
                <p>Hello ${employee.username},</p>
                <p>We noticed you didn't check out on <strong>${record.shift_date}</strong>, so we've automatically closed your shift for that day.</p>
                <p>If this doesn't seem right, please contact HR to have it corrected.</p>
                <p style="font-size:12px; color:#888; margin-top:24px;">This is an automated notification. Eastern Panorama Offset - FMS</p>
              </div>
            `,
          }).catch((err) => console.error(`[autoCheckoutJob] Email failed for ${employee.id}:`, err.message));
        }
      }

      closed++;
    } catch (err) {
      console.error(`[autoCheckoutJob] Failed to close shift for employee ${employee.id}:`, err.message);
    }
  }

  return { checked: openShifts.length, closed };
}