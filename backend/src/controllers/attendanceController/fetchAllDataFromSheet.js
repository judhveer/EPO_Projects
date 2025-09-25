import dotenv from 'dotenv';
dotenv.config();
import db from '../../models/index.js';
import  {getSheetData}  from '../../utils/attendance/sheets.js';
import { Op } from 'sequelize';
import { DateTime } from 'luxon';

import EMPLOYEE from '../../config/attendance/employees.js'



function parseCustomTimestamp(ts) {
  if (!ts || typeof ts !== "string") return null;
  const [datePart, timePart] = ts.trim().split(' ');
  if (!datePart || !timePart) return null;
  let day, month, year;
  if (datePart.includes('/')) {
    [day, month, year] = datePart.split('/').map(Number);
  } else if (datePart.includes('-')) {
    [year, month, day] = datePart.split('-').map(Number);
  } else {
    return null;
  }
  const [hour, minute, second] = timePart.split(':').map(Number);
  if ([year, month, day, hour, minute, second].some(isNaN)) return null;
  return DateTime.fromObject(
    { year, month, day, hour, minute, second },
    { zone: 'Asia/Kolkata' }
  );
}



function getDateStringFromDate(dt) {
  // dt is a Luxon DateTime
  return dt.toFormat('yyyy-LL-dd'); // for Sequelize DATEONLY
}

function msToHMS(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${hours} hrs ${minutes} min ${seconds} sec`;
}


let isSyncing = false;

export async function syncAllAttendance(req, res) {
  const start = Date.now();
  if (isSyncing) {
    return res.status(429).json({ error: "Sync in progress" });
  }
  isSyncing = true;
  try {
    const rows = await getSheetData();
    const [header, ...dataRows] = rows;

    // Identify columns
    const COLS = {
      timestamp: header.findIndex(h => h.toLowerCase().includes('timestamp')),
      name: header.findIndex(h => h.toLowerCase() === 'name'),
      action: header.findIndex(h => h.toLowerCase() === 'action'),
      location: header.findIndex(h => h.toLowerCase() === 'location'),
      photo: header.findIndex(h => h.toLowerCase().includes('photo')),
    };

    // 1. Collect all unique attendance dates in the data
    const allDatesSet = new Set();
    for (const row of dataRows) {
      const timestampRaw = row[COLS.timestamp];
      if (!timestampRaw) continue;
      const timestamp = parseCustomTimestamp(timestampRaw);
      if (!timestamp) continue;
      const dateStr = getDateStringFromDate(timestamp);
      allDatesSet.add(dateStr);
    }
    const allDates = Array.from(allDatesSet).sort(); // Optional: process in order

    // 2. For each unique date, process attendance for all EMPLOYEE
    for (const processDateStr of allDates) {
      // Build attendanceMap for this date
      const attendanceMap = {};

      for (const row of dataRows) {
        const timestampRaw = row[COLS.timestamp];
        if (!timestampRaw) continue;
        const timestamp = parseCustomTimestamp(timestampRaw);
        if (!timestamp) continue;
        const dateStr = getDateStringFromDate(timestamp);

        if (dateStr !== processDateStr) continue; // Only this date

        let name = row[COLS.name]?.trim().toUpperCase();
        let action = row[COLS.action]?.toUpperCase();
        const location = row[COLS.location]?.toUpperCase();
        if (!name || !action || !location) continue;
        if (!EMPLOYEE.includes(name)) continue;

        const photo_url = row[COLS.photo] ?? "";

        if (!attendanceMap[name]) attendanceMap[name] = {};

        if (action === 'IN') {
          if (!attendanceMap[name].check_in_time || parseCustomTimestamp(attendanceMap[name].check_in_time) > timestamp) {
            attendanceMap[name].check_in_time = timestampRaw;
            attendanceMap[name].photo_url = photo_url;
            attendanceMap[name].location = location;
          }
        }
        if (action === 'OUT') {
          if (!attendanceMap[name].check_out_time || parseCustomTimestamp(attendanceMap[name].check_out_time) < timestamp) {
            attendanceMap[name].check_out_time = timestampRaw;
          }
        }
      }

      // Office timings for this day (in IST, same as original logic)
      let [year, month, day] = processDateStr.split('-').map(Number);
      const officeStart = DateTime.fromObject({ year, month, day, hour: 10, minute: 15, second: 0, millisecond: 0 }, { zone: 'Asia/Kolkata' });
      const absentCutoff = DateTime.fromObject({ year, month, day, hour: 12, minute: 0, second: 0, millisecond: 0 }, { zone: 'Asia/Kolkata' });

      // For each employee, upsert their attendance for this date
      for (const name of EMPLOYEE) {
        const empData = attendanceMap[name] || {};
        let check_in_time = empData.check_in_time || null;
        let check_out_time = empData.check_out_time || null;
        let photo_url = empData.photo_url || null;
        let location = empData.location || null;
        let status = 'ABSENT';
        let late_minutes = "0";
        let shift_time = null;

        const where = { name, date: processDateStr, action: 'IN' };
        const existing = await db.Attendance.findOne({ where });

        if (!check_in_time) {
          // Mark absent if no IN record and day is in the past or after absent cutoff if today
          const nowIST = DateTime.now().setZone('Asia/Kolkata');
          const isToday = processDateStr === getDateStringFromDate(nowIST);
          if (!isToday || nowIST >= absentCutoff) {
            const absentStr = `${processDateStr} 00:00:00`;
            if (existing) {
              await existing.update({
                location: null,
                check_in_time: absentStr,
                check_out_time: absentStr,
                shift_time: '00:00:00',
                photo_url: null,
                status: 'ABSENT',
                date: processDateStr,
                late_minutes: null
              });
            } else {
              await db.Attendance.create({
                name,
                action: 'IN',
                location: null,
                check_in_time: absentStr,
                check_out_time: absentStr,
                shift_time: '00:00:00',
                photo_url: null,
                date: processDateStr,
                status: 'ABSENT',
                late_minutes: '00:00:00'
              });
            }
          }
          continue;
        }

        // PRESENT/LATE logic
        const checkInDate = parseCustomTimestamp(check_in_time);
        if (checkInDate > officeStart) {
          const late_time_calculation = Math.round(checkInDate.diff(officeStart, 'minutes').minutes);
          const hours = Math.floor(late_time_calculation / 60);
          const minutes = late_time_calculation % 60;
          late_minutes = `${hours}h ${minutes}min`;
          status = 'LATE';
        } else {
          status = 'PRESENT';
          late_minutes = "00:00:00";
        }

        // Auto check-out at 6 PM for past days if missing
        const nowIST = DateTime.now().setZone('Asia/Kolkata');
        const isToday = processDateStr === getDateStringFromDate(nowIST);
        if (!check_out_time) {
          if (!isToday || nowIST.hour >= 20) {
            check_out_time = `${processDateStr} 18:00:00`;
          }
        }

        if (check_in_time && check_out_time) {
          const checkOutDate = parseCustomTimestamp(check_out_time);
          if (!checkOutDate || !checkInDate) {
            console.warn(`Invalid check_in or check_out for ${name} on ${processDateStr}:`, check_in_time, check_out_time);
            shift_time = null;
          } else {
            shift_time = msToHMS(checkOutDate.toMillis() - checkInDate.toMillis());
          }
        }

        if (existing) {
          await existing.update({
            check_out_time: check_out_time,
            shift_time,
            photo_url,
            status,
            late_minutes,
            date: processDateStr,
          });
        } else {
          await db.Attendance.create({
            name,
            action: 'IN',
            location,
            check_in_time,
            check_out_time: check_out_time || null,
            shift_time,
            photo_url,
            date: processDateStr,
            status,
            late_minutes
          });
        }
      }
      console.log(`Attendance synced & processed for ${processDateStr}`);
    }

    console.log('Attendance synced & processed for all days.');
    console.log('Sync completed in', Date.now() - start, 'ms');
    res.json({ message: "Attendance synced & processed for all days." });

  } catch (error) {
    console.error('Sync failed:', error);
    res.status(500).json({ error: 'Sync failed' });
  } finally {
    isSyncing = false;
  }
};