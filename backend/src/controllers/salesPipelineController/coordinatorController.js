// backend/controllers/coordinatorController.js
import { Op, fn, col, literal } from 'sequelize';
import db from '../../models/index.js';
const { User, ResearchEntry, TelecallEntry, MeetingEntry, CrmEntry } = db;

/**
 * Maps role to model + user/date fields
 */
function roleToModel(role) {
  switch ((role || '').toUpperCase()) {
    case 'RESEARCHER':
      return { model: ResearchEntry, modelUserAttr: 'createdBy', modelDateAttr: 'researchDate' };
    case 'TELECALLER':
      return { model: TelecallEntry, modelUserAttr: 'meetingAssignee', modelDateAttr: 'meetingDateTime' };
    case 'SALES_EXECUTIVE':
      return { model: MeetingEntry, modelUserAttr: 'createdBy', modelDateAttr: 'createdAt' };
    case 'CRM':
      return { model: CrmEntry, modelUserAttr: 'createdBy', modelDateAttr: 'nextFollowUpOn' };
    default:
      return null;
  }
}

/**
 * Helper: date range filter
 */
function dateRangeWhere(colName, from, to) {
  return {
    [colName]: {
      [Op.between]: [new Date(from), new Date(to)],
    },
  };
}

/**
 * GET /users
 */
export async function getUsersStats(req, res) {
  return res.json("sucess");
  // try {
  //   const { role, from: fromISO, to: toISO } = req.query;
  //   if (!role || !fromISO || !toISO) return res.status(400).json({ message: 'role, from and to are required' });

  //   const mapping = roleToModel(role);
  //   if (!mapping) return res.status(400).json({ message: 'Unsupported role' });

  //   const { model, modelUserAttr, modelDateAttr } = mapping;

  //   // Fetch users from User table
  //   let users = await User.findAll({
  //     where:
  //       role.toUpperCase() === 'SALES_EXECUTIVE'
  //         ? { role: { [Op.in]: ['EXECUTIVE', 'SALES EXECUTIVE'] } }
  //         : { role: role.toUpperCase() },
  //     attributes: ['username', 'email'],
  //     raw: true,
  //   });

  //   // If no users, get usernames from entries
  //   if (!users || users.length === 0) {
  //     const rows = await model.findAll({
  //       attributes: [[col(userCol), 'username']],
  //       where: dateRangeWhere(modelDateAttr, fromISO, toISO),
  //       group: [col(userCol)],
  //       raw: true,
  //     });

  //     users = rows.map((r) => ({ username: r.username, email: '' }));
  //   } else {
  //     users = users.map((u) => ({ username: u.username, email: u.email || '' }));
  //   }

  //   // Date bounds
  //   const from = new Date(fromISO);
  //   const to = new Date(toISO);
  //   to.setHours(23, 59, 59, 999);
  //   const msPerDay = 24 * 60 * 60 * 1000;
  //   const daysInRange = Math.max(1, Math.round((to - from) / msPerDay) + 1);

  //   // resolve column names
  //   const userCol = model.rawAttributes[modelUserAttr]?.field || modelUserAttr;
  //   const dateCol = model.rawAttributes[modelDateAttr]?.field || modelDateAttr;

  //   // total counts
  //   const totalCounts = await model.findAll({
  //     attributes: [[col(userCol), 'username'], [fn('COUNT', col('*')), 'count']],
  //     where: {
  //       ...dateRangeWhere(modelDateAttr, from, to),
  //       [modelUserAttr]: { [Op.ne]: null },
  //     },
  //     group: [col(userCol)],
  //     raw: true,
  //   });

  //   // Today's counts
  //   const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  //   const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);

  //   // today counts
  //   const todayCounts = await model.findAll({
  //     attributes: [[col(userCol), 'username'], [fn('COUNT', col('*')), 'count']],
  //     where: {
  //       [modelDateAttr]: { [Op.between]: [startOfToday, endOfToday] },
  //       [modelUserAttr]: { [Op.ne]: null },
  //     },
  //     group: [col(userCol)],
  //     raw: true,
  //   });
  //   // Pending counts per role
  //   let pendingCounts = [];
  //   if (role.toUpperCase() === 'TELECALLER') {
  //     pendingCounts = await TelecallEntry.findAll({
  //       attributes: [[col('meeting_assignee'), 'username'], [fn('COUNT', col('*')), 'count']],
  //       where: { meeting_assignee: { [Op.ne]: null }, meeting_datetime: { [Op.gte]: new Date() } },
  //       group: [col('meeting_assignee')],
  //       raw: true,
  //     });
  //   } else if (role.toUpperCase() === 'SALES_EXECUTIVE') {
  //     pendingCounts = await MeetingEntry.findAll({
  //       attributes: [[col('created_by'), 'username'], [fn('COUNT', col('*')), 'count']],
  //       where: { created_by: { [Op.ne]: null }, status: { [Op.notIn]: ['APPROVE', 'REJECT'] } },
  //       group: [col('created_by')],
  //       raw: true,
  //     });
  //   } else if (role.toUpperCase() === 'CRM') {
  //     pendingCounts = await CrmEntry.findAll({
  //       attributes: [[col('created_by'), 'username'], [fn('COUNT', col('*')), 'count']],
  //       where: { created_by: { [Op.ne]: null }, status: { [Op.notIn]: ['APPROVE', 'REJECT'] } },
  //       group: [col('created_by')],
  //       raw: true,
  //     });
  //   }

  //   const totalMap = Object.fromEntries(totalCounts.map((r) => [String(r.username), Number(r.count)]));
  //   const todayMap = Object.fromEntries(todayCounts.map((r) => [String(r.username), Number(r.count)]));
  //   const pendingMap = Object.fromEntries(pendingCounts.map((r) => [String(r.username), Number(r.count)]));

  //   const out = users.map((u) => {
  //     const username = u.username;
  //     const totalCount = totalMap[username] ?? 0;
  //     const todayCount = todayMap[username] ?? 0;
  //     const pendingCount = pendingMap[username] ?? 0;
  //     const avgPerDay = totalCount / daysInRange;
  //     return {
  //       userId: username,
  //       name: username,
  //       email: u.email ?? '',
  //       todayCount,
  //       avgPerDay: Number(avgPerDay.toFixed(2)),
  //       totalCount,
  //       pendingCount,
  //     };
  //   });

  //   return res.json(out);
  // } catch (err) {
  //   console.error('coordinatorController.getUsersStats error:', err);
  //   return res.status(500).json({ message: 'Server error' });
  // }
}

/**
 * GET /user/:userId/daily
 */
export const getUserDaily = async (req, res) => {

  return res.json("success");
    // try {
    //     const { from, to, metric } = req.query;
    //     console.log(req.params);
    //     const { userId } = req.params; // <--- use route param instead of query

    //     const username = userId;

    //     if (!username) {
    //       console.log("here");
    //       return res.status(400).json({ error: 'Username is required' });
    //     }

    //     // Map metric to model and attributes
    //     let model, dateAttr, userAttr;
    //     if (metric === 'research') {
    //         model = ResearchEntry;
    //         dateAttr = 'researchDate'; // Sequelize attribute
    //         userAttr = 'createdBy';    // Sequelize attribute
    //     } else {
    //       // console.log("here");
    //         return res.status(400).json({ error: 'Invalid metric' });
    //     }

    //     // Get actual DB column names
    //     const tableName = model.getTableName();
    //     const dateCol = model.rawAttributes[dateAttr].field;  // e.g. 'researchDate'
    //     const userCol = model.rawAttributes[userAttr].field;  // e.g. 'created_by'

    //     // Query: group by DATE
    //     const dailyData = await model.findAll({
    //         where: {
    //             [userCol]: username,
    //             [dateAttr]: { [Op.between]: [from, to] }
    //         },
    //     });

    //     console.log("response: ", dailyData);
    //     res.json(dailyData);

    // } catch (error) {
    //     console.error('coordinatorController.getUserDaily error:', error);
    //     res.status(500).json({ error: error.message });
    // }
};

