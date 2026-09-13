import { Op } from 'sequelize';
import models from '../../models/index.js';
import { nowIST, todayISTDateOnly, istMomentOnDate } from '../../utils/attendance/istTime.js';
import { getAttendanceSettings } from './attendanceSettingsService.js';
import { sendPushToUser } from '../../utils/pushNotification.js';

const { User, Attendance, AttendanceReminderLog } = models;

export async function runAttendanceReminderJob() {
  const settings = await getAttendanceSettings();
  const now = nowIST();
  const todayStr = todayISTDateOnly();

  const threshold = istMomentOnDate(todayStr, settings.shift_start_hour, settings.shift_start_minute)
    .plus({ minutes: settings.reminder_delay_minutes });

  if (now < threshold) {
    return { sent: 0, reason: 'Not yet reminder time.' }; // too early — nothing to do this run
  }

  const employees = await User.findAll({
    where: { role: { [Op.ne]: 'BOSS' }, office: { [Op.ne]: null }, isActive: true },
    attributes: ['id'],
  });

  let sent = 0;
  for (const employee of employees) {
    const attendanceRow = await Attendance.findOne({
      where: { employee_id: employee.id, shift_date: todayStr },
    });
    if (attendanceRow?.check_in_time) continue; // already checked in — nothing to remind

    const alreadyReminded = await AttendanceReminderLog.findOne({
      where: { employee_id: employee.id, shift_date: todayStr },
    });
    if (alreadyReminded) continue;

    try {
      await sendPushToUser(employee.id, {
        title: "You haven't checked in yet",
        body: "Don't forget to mark your attendance for today.",
        icon: '/icons/attendance.png',
        data: { url: '/attendance' },
      });
      await AttendanceReminderLog.create({ employee_id: employee.id, shift_date: todayStr });
      sent++;
    } catch (err) {
      // A race with another run of this same job (both fire within
      // the 15-min window, both pass the alreadyReminded check before
      // either writes) hits the unique constraint here — treated as
      // "someone else already sent it," not a real error.
      if (err.name !== 'SequelizeUniqueConstraintError') {
        console.error(`[attendanceReminderJob] Failed for employee ${employee.id}:`, err.message);
      }
    }
  }

  console.log(`[attendanceReminderJob] Sent ${sent} reminder(s).`);
  return { sent };
}