// import dotenv from 'dotenv';
// dotenv.config();
// import db from '../../models/index.js';
// import  {getSheetData}  from '../../utils/attendance/sheets.js';
// import { Op } from 'sequelize';
// import { DateTime } from 'luxon';

// import EMPLOYEE from '../../config/attendance/employees.js'

import models from '../../models/index.js';
import { Op } from 'sequelize';
import { todayISTDateOnly, monthRangeIST } from '../../utils/attendance/istTime.js';

const { Attendance, User } = models;


// ------------- LIST ATTENDANCE (with filters/pagination) -------------
async function listAttendance(req, res) {
  try {
    let { date, name, showLate, page = 1, limit = 50, month } = req.query;
    page = parseInt(page);
    limit = parseInt(limit);

    const where = {};
    if (date) {
      // where.date = (typeof date === 'string') ? date : toString(date);
      where.shift_date = date;
    }
    else if (month) {
      const { start, end } = monthRangeIST(month);
      where.shift_date = { [Op.between]: [start, end] }; // ← was Op.like
    }
    else {
      // Default: fetch today (IST)
      // const nowIST = DateTime.now().setZone('Asia/Kolkata');
      // const todayStr = getDateStringFromDate(nowIST);
      // where.date = todayStr;

      where.shift_date = todayISTDateOnly();
    }


    // if (name) {
    //   where.name = { [Op.like]: `%${name.trim().toUpperCase()}%` };
    // }

    if (showLate === 'true') {
      where.status = 'LATE';
    }
    else {
      where.status = { [Op.ne]: 'ABSENT' };  // Exclude absents
    }

    // Only show action: 'IN' (one row per emp/date)
    // where.action = 'IN';

    // Name search now filters on the joined User record, not a raw string column — this is the actual point of the whole rebuild: attendance is tied to a real account, not free text.
    const employeeWhere = name 
      ? { username: { [Op.like]: `%${name.trim()}%` } }
      : undefined;

    const { rows, count } = await Attendance.findAndCountAll({
      where,
      include: [{
        model: User,
        as: "employee",
        attributes: ['id', 'username', 'office', 'department'],
        where: employeeWhere,
        required: !!employeeWhere, // INNER JOIN only when actually filtering by name
      }],
      offset: (page - 1) * limit,
      limit,
      order: [
        ['check_in_time', 'DESC'],
        [{ model: User, as: 'employee' }, 'username', 'ASC'],
      ],
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
    // const nowIST = DateTime.now().setZone('Asia/Kolkata');
    // const date = req.query.date || getDateStringFromDate(nowIST);

    // const totalEmployees = EMPLOYEE.length;

    const shiftDate = req.query.date || todayISTDateOnly();

    // Replaces the hardcoded EMPLOYEE array with a live count of trackable users — the exact duplication this rebuild exists to eliminate. "Trackable" = active, not BOSS, has an office assigned.
    const totalEmployees = await User.count({
      where: {
        role: { [Op.ne]: 'BOSS' },
        office: { [Op.ne]: null },
        isActive: true,
      },
    });

    // Get all attendance for date
    const records = await Attendance.findAll({
      where: { 
        shift_date: shiftDate,
       }
    });

    let onTimeCount = 0, lateCount = 0, absentCount = 0,
        holidayCount = 0, weekOffCount = 0, leaveCount = 0;

    // for (const rec of records) {
    //   if (rec.status === 'PRESENT') onTimeCount++;
    //   if (rec.status === 'LATE') lateCount++;
    //   if (rec.status === 'ABSENT') absentCount++;
    // }
    // absentCount = totalEmployees - records.length;

    for(const rec of records){
      switch(rec.status){
        case 'PRESENT':  onTimeCount++;   break;
        case 'LATE':     lateCount++;     break;
        case 'ABSENT':   absentCount++;   break;
        case 'HOLIDAY':  holidayCount++;  break;
        case 'WEEK_OFF': weekOffCount++;  break;
        case 'LEAVE':    leaveCount++;    break;
        // UNRESOLVED intentionally not counted — it means "not yet decided," not a real outcome to report on.
      }
    }

    res.json({
      totalEmployees, onTimeCount, lateCount, absentCount, holidayCount, weekOffCount, leaveCount,
    });
  } catch (error) {
    console.error('Summary error:', error);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
};


// ------------- ABSENT EMPLOYEES LIST -------------
async function absentList(req, res) {
  try {

    const shiftDate = req.query.date || todayISTDateOnly();
    const month = req.query.month || null;
    const name = req.query.name || null;


    // const nowIST = DateTime.now().setZone('Asia/Kolkata');
    // const date = req.query.date || getDateStringFromDate(nowIST);
    // const month = req.query.month || null;
    // const name = req.query.name || null;

    let where = { status: 'ABSENT' };

    // if (name) {
    //   where.name = { [Op.like]: `%${name.trim().toUpperCase()}%` };
    // }

    if (month) {
      const { start, end } = monthRangeIST(month);
      where.shift_date = { [Op.between]: [start, end] }; // ← was Op.like
    }
    else {
      where.shift_date = shiftDate;
    }

    const employeeWhere = name
      ? { username: { [Op.like]: `%${name.trim()}%` } }
      : undefined;

    // Get attendance for this date
    const records = await Attendance.findAll({
      where,
      include: [{
        model: User,
        as: 'employee',
        attributes: ['id', 'username', 'office'],
        where: employeeWhere,
        required: !!employeeWhere,
      }],
    });

    res.json(records.map(r => ({
      name: r.employee?.username,
      office: r.employee?.office,
      date: r.shift_date,     // <-- gets the correct date for each record
      status: 'ABSENT'
    })));

  } catch (error) {
    console.error('Absent error:', error);
    res.status(500).json({ error: 'Failed to fetch absent list' });
  }
};


// ------------- EMPLOYEE LIST (for search/dropdown) -------------
// Replaces config/attendance/employees.js entirely — this is the live User table now, not a hardcoded array that can drift out of sync with who's actually employed.
async function getEmployees(req, res) {
  // res.json(EMPLOYEE);
  try{  
      const employees = await User.findAll({
        where: {
          role: { [Op.ne]: 'BOSS' },
          office: { [Op.ne]: null },
          isActive: true,
        },
        attributes: ['id', 'username', 'office', 'department'],
        order: [['username', 'ASC' ]],
      });

      return res.json(employees);
  }
  catch(error){
    console.error('Employees list error:', error);
    return res.status(500).json({ error: 'Failed to fetch employee list' });
  }

};


export default {
  listAttendance,
  attendanceSummary,
  absentList,
  getEmployees,
};
