import dotenv from 'dotenv';
dotenv.config();
import db from '../../models/index.js';
import  {getSheetData}  from '../../utils/attendance/sheets.js';
import { Op } from 'sequelize';
import { DateTime } from 'luxon';


import EMPLOYEE from '../../config/Attendance/employees.js'


// Utility
function parseCustomTimestamp(ts) {
  if (!ts) return null;
  const [datePart, timePart] = ts.split(' ');
  if (!datePart || !timePart) return null;
  const [day, month, year] = datePart.split('/').map(Number);
  const [hour, minute, second] = timePart.split(':').map(Number);
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


async function syncAttendance(req, res) {
  // check execution time
  const start = Date.now();

  console.log('Syncing attendance data...');
  if (isSyncing) {
    return res.status(429).json({
      error: "Sync in progress"
    });
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


    // Map for each employee's attendance (per day)
    const attendanceMap = {};
    // Current IST date/time
    let nowIST = DateTime.now().setZone('Asia/Kolkata');
    console.log("nowIST: ", nowIST);


    const todayStr = getDateStringFromDate(nowIST);


    // 1. Process existing IN/OUT rows (today only, for valid EMPLOYEE)
    for (const row of dataRows) {
      // console.log("row: ", row);
      const timestampRaw = row[COLS.timestamp];
      // console.log("timestampRaw: ", timestampRaw);
      if (!timestampRaw) continue;

      const timestamp = parseCustomTimestamp(timestampRaw);
      if (!timestamp) continue;


      const dateStr = getDateStringFromDate(timestamp);

      if (dateStr !== todayStr) continue; // Process ONLY today's records

      let name = row[COLS.name]?.trim().toUpperCase();
      console.log("name: ", name);
      let action = row[COLS.action]?.toUpperCase();
      const location = row[COLS.location]?.toUpperCase();
      console.log("action: ", action);
      if (!name || !action || !location) {
        // skip
        continue;
      }

      if (!EMPLOYEE.includes(name)) {   // Only valid employees
        // skip
        continue;
      }


      const photo_url = row[COLS.photo] ?? "";

      // Initialize map entry if needed
      if (!attendanceMap[name]) attendanceMap[name] = {};


      if (action === 'IN') {
        // Only keep earliest IN
        if (!attendanceMap[name].check_in_time || parseCustomTimestamp(attendanceMap[name].check_in_time) > timestamp) {
          attendanceMap[name].check_in_time = timestampRaw;
          attendanceMap[name].photo_url = photo_url;
          attendanceMap[name].location = location;
        }
      }
      if (action === 'OUT') {
        // Only keep latest OUT
        if (!attendanceMap[name].check_out_time || parseCustomTimestamp(attendanceMap[name].check_out_time) < timestamp) {
          attendanceMap[name].check_out_time = timestampRaw;
        }
      }
      console.log("attendanceMap[name]: ", attendanceMap[name]);
    }

    // 2. AUTO-MARK ABSENT, LATE, AND SHIFT CALCULATION
    // 2. Fill/Upsert Attendance Table per employee for today (IST)
    // Define office timings in IST
    const officeStart = nowIST.set({ hour: 10, minute: 15, second: 0, millisecond: 0 }); // 10:00 AM
    const absentCutoff = nowIST.set({ hour: 12, minute: 0, second: 0, millisecond: 0 }); // 12:00 PM

    for (const name of EMPLOYEE) {
      const empData = attendanceMap[name] || {};
      let check_in_time = empData.check_in_time || null;
      let check_out_time = empData.check_out_time || null;
      let photo_url = empData.photo_url || null;
      let location = empData.location || null;
      let status = 'ABSENT';
      let late_minutes = "0";
      let shift_time = null;

      const where = { name, date: todayStr, action: 'IN' };
      const existing = await db.Attendance.findOne({ where });

      if (!check_in_time) {
        if (nowIST >= absentCutoff) {
          // Already marked absent for today? Skip
          if (existing && existing.status === 'ABSENT') {
            continue;
          }
          const absentStr = nowIST.toFormat('dd/LL/yyyy') + ' 00:00:00';
          if (existing) {
            await existing.update({
              location: null,
              check_in_time: absentStr,
              check_out_time: absentStr,
              shift_time: '00:00:00',
              photo_url: null,
              status: 'ABSENT',
              date: (typeof todayStr === 'string') ? todayStr : toString(todayStr),
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
              date: (typeof todayStr === 'string') ? todayStr : toString(todayStr),
              status: 'ABSENT',
              late_minutes: '00:00:00'
            });
          }
        }
        continue;
      }

      // PRESENT/LATE
      const checkInDate = parseCustomTimestamp(check_in_time);
      // console.log("checkInDate: ", checkInDate);
      if (checkInDate > officeStart) {
        const late_time_calculation = Math.round(checkInDate.diff(officeStart, 'minutes').minutes);
        // Convert minutes to hours and remaining minutes
        const hours = Math.floor(late_time_calculation / 60);  // Full hours
        const minutes = late_time_calculation % 60;
        late_minutes = `${hours}h ${minutes}min`;
        status = 'LATE';
      } else {
        status = 'PRESENT';
        late_minutes = "00:00:00";
      }

      // Auto check-out at 6 PM if not out and now is after 10 PM
      console.log("nowIST.hour: ", nowIST.hour);
      console.log(typeof nowIST.hour);
      if (!check_out_time && nowIST.hour >= 20) {
        check_out_time = nowIST.toFormat('dd/LL/yyyy') + ' 18:00:00';
      }

      // Calculate shift time if check-out exists
      if (check_in_time && check_out_time) {
        const checkOutDate = parseCustomTimestamp(check_out_time);
        shift_time = msToHMS(checkOutDate.toMillis() - checkInDate.toMillis());
      }

      if (existing) {
        if (check_out_time) {
          await existing.update({
            check_out_time: check_out_time,
            shift_time,
            photo_url,
            status,
            late_minutes,
            date: (typeof todayStr === 'string') ? todayStr : toString(todayStr),
          });
        }
      } else {
        await db.Attendance.create({
          name,
          action: 'IN',
          location,
          check_in_time,
          check_out_time: check_out_time || null,
          shift_time,
          photo_url,
          date: (typeof todayStr === 'string') ? todayStr : toString(todayStr),
          status,
          late_minutes
        });
      }
    }

    console.log('Attendance synced & processed for today.',);
    // execution time tracking
    console.log('Sync completed in', Date.now() - start, 'ms');

    res.json({ message: "Attendance synced & processed for today." });

  } catch (error) {
    console.error('Sync failed:', error);
    res.status(500).json({ error: 'Sync failed' });
  } finally {
    isSyncing = false;
  }
};




// ------------- LIST ATTENDANCE (with filters/pagination) -------------
async function listAttendance(req, res) {
  try {
    let { date, name, showLate, page = 1, limit = 50, month } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const where = {};
    if (date) {
      where.date = (typeof date === 'string') ? date : toString(date);
    }
    else if (month) {
      where.date = { [Op.like]: `${month}-%` }; // always use -%!
    }
    else {
      // Default: fetch today (IST)
      const nowIST = DateTime.now().setZone('Asia/Kolkata');
      const todayStr = getDateStringFromDate(nowIST);
      console.log("todayStr: ", todayStr);
      where.date = todayStr;
    }
    if (name) {
      where.name = { [Op.like]: `%${name.trim().toUpperCase()}%` };
    }

    if (showLate === 'true') {
      where.status = 'LATE';
    }
    else {
      where.status = { [Op.ne]: 'ABSENT' };  // Exclude absents
    }

    // Only show action: 'IN' (one row per emp/date)
    where.action = 'IN';


    const { rows, count } = await db.Attendance.findAndCountAll({
      where,
      offset: (page - 1) * limit,
      limit,
      order: [['check_in_time', 'DESC'], ['name', 'ASC']]
    });

    res.json({
      data: rows,
      total: count,
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    console.error('List error:', error);
    res.status(500).json({ error: 'Failed to fetch attendance records' });
  }
};


// ------------- SUMMARY (for StatsSummary) -------------
async function attendanceSummary(req, res) {
  try {
    const nowIST = DateTime.now().setZone('Asia/Kolkata');
    const date = req.query.date || getDateStringFromDate(nowIST);

    const totalEmployees = EMPLOYEE.length;

    // Get all attendance for date
    const records = await db.Attendance.findAll({
      where: { date }
    });

    let onTimeCount = 0, lateCount = 0, absentCount = 0;
    for (const rec of records) {
      if (rec.status === 'PRESENT') onTimeCount++;
      if (rec.status === 'LATE') lateCount++;
      if (rec.status === 'ABSENT') absentCount++;
    }
    // absentCount = totalEmployees - records.length;

    res.json({
      totalEmployees, onTimeCount, lateCount, absentCount
    });
  } catch (error) {
    console.error('Summary error:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
};


// ------------- ABSENT EMPLOYEES LIST -------------
async function absentList(req, res) {
  try {

    const nowIST = DateTime.now().setZone('Asia/Kolkata');
    const date = req.query.date || getDateStringFromDate(nowIST);
    console.log("Date: ", req.query.date);
    const month = req.query.month || null;
    console.log("Month: ", month);
    const name = req.query.name || null;

    let where = { status: 'ABSENT' };

    if (name) {
      where.name = { [Op.like]: `%${name.trim().toUpperCase()}%` };
    }

    if (month) {
      where.date = { [Op.like]: `${month}-%` }; // always use -%!
    }
    else {
      where.date = date;
    }

    // Get attendance for this date
    const records = await db.Attendance.findAll({
      where
    });
    // const absentNames = records.map(r => r.name);
    // res.json(absentNames.map(name => ({ name, status: 'ABSENT' })));
    res.json(records.map(r => ({
      name: r.name,
      date: r.date,     // <-- gets the correct date for each record
      status: 'ABSENT'
    })));

    // const absent = EMPLOYEE.filter(e => !presentNames.includes(e));
    // Send as array of { name, status }
  } catch (error) {
    console.error('Absent error:', error);
    res.status(500).json({ error: 'Failed to fetch absent list' });
  }
};


// ------------- EMPLOYEE LIST (for search/dropdown) -------------
async function getEmployees(req, res) {
  res.json(EMPLOYEE);
};



// bulkInsertAttendance
async function bulkInsertAttendance(req, res) {
  try {
    const data = req.body.data || bulkData;
    if (!Array.isArray(data) || !data.length) {
      return res.status(400).json({ error: 'Invalid data format' });
    }

    // You may add validations/format conversion here as needed
    await db.Attendance.bulkCreate(data, { ignoreDuplicates: true });   // or updateOnDuplicate: [...fields]
    res.json({
      message: 'Bulk insert successful',
      count: data.length
    });
  } catch (error) {
    console.error('Bulk insert error:', error);
    res.status(500).json({ error: 'Bulk insert failed' });
  }
};

export default {
  syncAttendance,
  listAttendance,
  attendanceSummary,
  absentList,
  getEmployees,
  bulkInsertAttendance
};
