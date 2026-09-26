import { Op } from 'sequelize';
import models from '../../models/index.js';
import { nowIST, istMomentOnDate, ZONE } from '../../utils/attendance/istTime.js';
import { getAttendanceSettings } from './attendanceSettingsService.js';
import { sendPushToUser } from '../../utils/pushNotification.js';
import { sendMailForFMS } from '../../email/sendMail.js';
import { DateTime } from 'luxon';
import { computeOvertime } from './attendanceCalculations.js';
import { writeAuditLog } from './auditLogService.js';

const { User, Attendance, CheckoutReminderLog } = models;

const REMINDER_INTERVAL_MINUTES = 30;

export async function runCheckoutReminderJob() {
    const settings = await getAttendanceSettings();
    const now = nowIST();

    // Shift end = shift start + overtime threshold + grace, on a GIVEN
    // date — confirmed formula, reusing the same grace_minutes field
    // that already governs morning lateness, per your explicit choice.
    const shiftEndOnDate = (dateOnly) =>
        istMomentOnDate(dateOnly, settings.shift_start_hour, settings.shift_start_minute)
            .plus({ minutes: settings.overtime_threshold_minutes + settings.grace_minutes });

    // ── Which shift-date is even eligible right now? ────────────────────
    // At most ONE date can ever be in-window at a given moment, since
    // the reminder start time (e.g. 18:15) is always later in the day
    // than the next morning's shift start (10:00) — the two windows
    // never overlap. This single check IS the "stop once the next
    // shift's start time has passed" rule: once "now" crosses into
    // today's 10:00, yesterday's window is no longer selectable at all.
    const todayDate = now.toISODate();
    const yesterdayDate = now.minus({ days: 1 }).toISODate();
    const todayShiftStart = istMomentOnDate(todayDate, settings.shift_start_hour, settings.shift_start_minute);

    let targetShiftDate = null;
    if (now >= shiftEndOnDate(todayDate)) {
        targetShiftDate = todayDate; // evening window just opened for today's shift
    } else if (now < todayShiftStart) {
        targetShiftDate = yesterdayDate; // still before today's shift start — yesterday's window is still open
    }

    if (!targetShiftDate) {
        // ── We're in the "dead zone" (10:00–18:15) — this is exactly the moment yesterday's reminder window has closed. Run auto-checkout for yesterday's date if there's still anyone open — cheap guard via Attendance.count() avoids doing real work on every 15-minute tick across the whole day for nothing. Naturally idempotent: once a shift is closed, it no longer matches this query on the next tick, so this can run every 15 minutes all day with zero risk of double-processing anyone.
        const stillOpenCount = await Attendance.count({
            where: { 
                shift_date: yesterdayDate, 
                check_in_time: { [Op.ne]: null }, 
                check_out_time: null 
            },
        });
        if (stillOpenCount > 0) {
            const result = await runAutoCheckoutJob(yesterdayDate);
            return { checked: 0, reminded: 0, autoClosedDate: yesterdayDate, ...result };
        }
        return { checked: 0, reminded: 0, reason: 'Outside the reminder window right now.' };
    }


    // ── Every trackable employee with an OPEN shift on that date ────────
    // Checked in, never checked out. Confirmed scope: every department,
    // including Production Worker and Delivery.
    const openShifts = await Attendance.findAll({
        where: {
            shift_date: targetShiftDate,
            check_in_time: { [Op.ne]: null },
            check_out_time: null,
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

        // Self-healing guard against an early/late/occasionally-skipped cron tick — only re-sends once genuinely ~30 minutes have passed since the last one, never faster.
        if (lastReminder && now.diff(DateTime.fromJSDate(lastReminder.sent_at).setZone(ZONE), 'minutes').minutes < REMINDER_INTERVAL_MINUTES) {
            continue;
        }

        const isFirstReminder = !lastReminder;

        try {
            await sendPushToUser(employee.id, {
                title: 'Forgot to check out?',
                body: "If you're working overtime, ignore this. Otherwise, your shift is over — please check out.",
                data: { url: '/attendance' },
            });

            // Email only on the very first reminder for this person/date —
            // your confirmed choice, avoids a dozen emails across one night.
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
                employee_id: employee.id, 
                shift_date: targetShiftDate, 
                email_sent: emailSent,
            });
            reminded++;
        } catch (err) {
            console.error(`[checkoutReminderJob] Failed for employee ${employee.id}:`, err.message);
            // Deliberately no CheckoutReminderLog row on failure — the next
            // cron tick will naturally retry, since "no recent log entry"
            // is exactly what triggers a send.
        }
    }

    return { checked: openShifts.length, reminded, targetShiftDate };
}

/**
 * Force-closes any still-open shift for a date whose reminder window
 * has just ended (i.e. the NEXT shift's start time has now passed).
 * Auto-checkout = check_in_time + overtime_threshold_minutes — derived
 * from each person's own check-in, per the confirmed fix, so it can
 * never land before their check-in even for a late-night shift.
 *
 * Only ever called for a date that has FULLY exited the reminder
 * window (see the caller below) — never for "today's" still-open
 * window, since that would force-checkout someone genuinely still
 * mid-shift.
 */
export async function runAutoCheckoutJob(expiredShiftDate) {
  const settings = await getAttendanceSettings();

  const openShifts = await Attendance.findAll({
    where: {
      shift_date: expiredShiftDate,
      check_in_time: { [Op.ne]: null },
      check_out_time: null,
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

    // Derived from THIS person's own check-in — never a fixed clock time. Can never produce a checkout earlier than the check-in, by construction.
    const derivedCheckout = new Date(
      new Date(record.check_in_time).getTime() + settings.overtime_threshold_minutes * 60000
    );

    const { overtimeMinutes } = computeOvertime(record.check_in_time, derivedCheckout, settings);
    // overtimeMinutes will always be 0 here — the derived checkout IS
    // exactly the overtime threshold from check-in, by definition.
    // Computed anyway (rather than hardcoded to 0) so this stays
    // correct even if the underlying formula ever changes.

    try {
      await record.update({
        check_out_time: derivedCheckout,
        overtime_minutes: overtimeMinutes,
      });

      await writeAuditLog({
        entityType: 'ATTENDANCE',
        entityId: record.id,
        action: 'AUTO_CHECKOUT',
        performedBy: null, // system-generated, not an admin action
        oldValue: { check_out_time: null },
        newValue: { check_out_time: derivedCheckout, note: 'System-guessed checkout — employee never checked out.' },
        reason: `Auto-closed: no checkout recorded for ${expiredShiftDate}. Derived as check-in + ${settings.overtime_threshold_minutes} minutes.`,
      });

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
              <p>We noticed you didn't check out on <strong>${expiredShiftDate}</strong>, so we've automatically closed your shift for that day.</p>
              <p>If this doesn't seem right, please contact HR to have it corrected.</p>
              <p style="font-size:12px; color:#888; margin-top:24px;">This is an automated notification. Eastern Panorama Offset - FMS</p>
            </div>
          `,
        }).catch((err) => console.error(`[autoCheckoutJob] Email failed for ${employee.id}:`, err.message));
      }

      closed++;
    } catch (err) {
      console.error(`[autoCheckoutJob] Failed to close shift for employee ${employee.id}:`, err.message);
    }
  }

  return { checked: openShifts.length, closed };
}