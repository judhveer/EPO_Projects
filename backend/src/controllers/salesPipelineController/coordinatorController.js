// controllers/coordinatorController.js
// ESM controller that uses these predefined models exported from ../models/index.js:
//   ResearchEntry, TelecallEntry, MeetingEntry, CrmEntry, Lead, User
//
// IMPORTANT: adjust the FIELD NAME constants below to match your exact schema
// (createdBy, createdAt, telecallerId, meetingAssignee, stage, ticketId, etc.)

import { Op } from 'sequelize';
import db from '../../models/index.js'; // adjust path if needed

const {
  ResearchEntry,
  TelecallEntry,
  ApprovalEntry,
  MeetingEntry,
  CrmEntry,
  Lead,
  User,
} = db;

/* ----------------- CONFIG / FIELD NAMES (edit these if your schema differs) ----------------- */
// Field on entry models that stores the creator's user identifier:
const CREATED_BY_FIELD = 'createdBy'; // ResearchEntry.createdBy, TelecallEntry.createdBy, MeetingEntry.createdBy, CrmEntry.createdBy

// Common timestamp field name:
const CREATED_AT_FIELD = 'createdAt';

// Lead model fields:
const LEAD_STAGE_FIELD = 'stage';                 // Lead.stage
const LEAD_TICKET_FIELD = 'ticketId';            // Lead.ticketId or Lead.id
const LEAD_TELECALLER_FIELD = 'telecallerAssignedTo';    // Lead.telecallerId (assigned telecaller)
const LEAD_MEETING_EXEC_FIELD = 'meetingAssignee'; // Lead.meetingAssignee (assigned executive)

// Stage values used in your app (change if your app uses different strings)
const STAGE_TELECALL = 'TELECALL';
const STAGE_MEETING = 'MEETING';
const STAGE_CRM = 'CRM';

// Research target:
const RESEARCH_TARGET_PER_DAY = 5;



/* Helper: extract user primary key value */
function getUserPk(user) {
  if (!user) return null;
  return user.username ?? user.id ?? user.userId ?? null;
}

/* Normalize user row returned by /users endpoint */
function normalizeUserRow(user, stats = {}) {
  return {
    userId: getUserPk(user),
    name: user.username,
    email: user.email ?? '',
    todayCount: Number(stats.todayCount || 0),
    totalCount: Number(stats.totalCount || 0),
    pendingCount: Number(stats.pendingCount || 0),
    pendingMessage: stats.pendingMessage ?? undefined,
    raw: user,
  };
}

/**
 * GET /users?role=<ROLE>
 *
 * Roles supported:
 *  - RESEARCHER         -> ResearchEntry (createdBy)
 *  - TELECALLER         -> TelecallEntry (createdBy) + pending from Lead(stage=TELECALL & telecaller)
 *  - SALES_EXECUTIVE    -> MeetingEntry (createdBy) + pending from Lead(stage=MEETING & meetingAssignee)
 *  - CRM                -> CrmEntry (createdBy) + aggregated pending leads in CRM stage (no assignee)
 */
export async function getUsers(req, res) {
  const role = (req.query.role || '').toUpperCase();
  if (!role) {
    return res.status(400).json({
      message: 'Missing role parameter'
    });
  }

  // Today's range (server local timezone)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  try {
    // Fetch users who have this role
    const users = await User.findAll({ where: { role } });

    const rows = await Promise.all(users.map(async (u) => {
      const uid = getUserPk(u);
      
      if (!uid) {
        return normalizeUserRow(u, { totalCount: 0, todayCount: 0, pendingCount: 0 });
      }

      // RESEARCHER
      if (role === 'RESEARCHER') {
        if (!ResearchEntry) return normalizeUserRow(u, { totalCount: 0, todayCount: 0, pendingCount: 0 });

        const totalCount = await ResearchEntry.count({ where: { [CREATED_BY_FIELD]: uid } });
        const todayCount = await ResearchEntry.count({
          where: { [CREATED_BY_FIELD]: uid, [CREATED_AT_FIELD]: { [Op.between]: [todayStart, todayEnd] } },
        });

        const pendingCount = Math.max(0, RESEARCH_TARGET_PER_DAY - todayCount);
        const pendingMessage = pendingCount === 0 ? 'Bravo! You completed your daily target.' : `${pendingCount} remaining to reach daily target (${RESEARCH_TARGET_PER_DAY})`;

        return normalizeUserRow(u, { totalCount, todayCount, pendingCount, pendingMessage });
      }

      // TELECALLER
      if (role === 'TELECALLER') {
        if (!TelecallEntry) return normalizeUserRow(u, { totalCount: 0, todayCount: 0, pendingCount: 0 });

        const totalCount = await TelecallEntry.count({ where: { [CREATED_BY_FIELD]: uid } });
        const todayCount = await TelecallEntry.count({
          where: { [CREATED_BY_FIELD]: uid, [CREATED_AT_FIELD]: { [Op.between]: [todayStart, todayEnd] } },
        });

        // Pending leads: those leads currently in TELECALL stage and assigned to this telecaller
        const pendingCount = await Lead.count({
          where: {
            [LEAD_STAGE_FIELD]: STAGE_TELECALL,
            [LEAD_TELECALLER_FIELD]: uid,
          },
        });

        return normalizeUserRow(u, { totalCount, todayCount, pendingCount });
      }

      // SALES_EXECUTIVE
      if (role === 'EXECUTIVE') {
        const totalCount = MeetingEntry ? await MeetingEntry.count({ where: { [CREATED_BY_FIELD]: uid } }) : 0;
        const todayCount = MeetingEntry ? await MeetingEntry.count({ where: { [CREATED_BY_FIELD]: uid, [CREATED_AT_FIELD]: { [Op.between]: [todayStart, todayEnd] } } }) : 0;

        const pendingCount = await Lead.count({
          where: {
            [LEAD_STAGE_FIELD]: STAGE_MEETING,
            [LEAD_MEETING_EXEC_FIELD]: uid,
          },
        });

        return normalizeUserRow(u, { totalCount, todayCount, pendingCount });
      }

      // CRM
      if (role === 'CRM') {
        const totalCount = CrmEntry ? await CrmEntry.count({ where: { [CREATED_BY_FIELD]: uid } }) : 0;
        const todayCount = CrmEntry ? await CrmEntry.count({ where: { [CREATED_BY_FIELD]: uid, [CREATED_AT_FIELD]: { [Op.between]: [todayStart, todayEnd] } } }) : 0;

        // Aggregated pending leads for CRM stage (no assignee)
        const aggregatedPending = await Lead.count({
          where: { [LEAD_STAGE_FIELD]: STAGE_CRM },
        });

        console.log("pending crms: ", aggregatedPending);

        return normalizeUserRow(u, { totalCount, todayCount, pendingCount: aggregatedPending });
      }

      // default fallback if role not matched
      return normalizeUserRow(u, {
        totalCount: 0,
        todayCount: 0,
        pendingCount: 0
      });

    }));

    return res.json(rows);
  } catch (err) {
    console.error('coordinator.getUsers error', err);
    return res.status(500).json({ message: err.message ?? 'Failed to fetch users' });
  }
}

/**
 * GET /user/:userId/pending?metric=<metric>
 *
 * metric: 'research' | 'telecall' | 'meeting' | 'followup'
 *
 * Returns:
 *  - research: { summary: { totalCount, todayCount, remaining, message }, items: [ResearchEntry...] }
 *  - telecall: { items: [Lead...] }  (leads in TELECALL stage assigned to user)
 *  - meeting:  { items: [Lead...] }  (leads in MEETING stage assigned to user)
 *  - followup: { items: [Lead...] }  (leads in CRM stage)
 */
export async function getUserPending(req, res) {
  const userId = req.params.userId;
  const metric = (req.query.metric || req.query.type || '').toLowerCase();

  if (!userId) return res.status(400).json({ message: 'Missing userId param' });
  if (!metric) return res.status(400).json({ message: 'Missing metric query param' });

  try {
    // RESEARCH
    if (metric === 'research') {
      if (!ResearchEntry) return res.json({ summary: { totalCount: 0, todayCount: 0, remaining: RESEARCH_TARGET_PER_DAY, message: '' }, items: [] });

      const totalCount = await ResearchEntry.count({ where: { [CREATED_BY_FIELD]: userId } });
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
      const todayCount = await ResearchEntry.count({ where: { [CREATED_BY_FIELD]: userId, [CREATED_AT_FIELD]: { [Op.between]: [todayStart, todayEnd] } } });

      const remaining = Math.max(0, RESEARCH_TARGET_PER_DAY - todayCount);
      const message = remaining === 0 ? 'Bravo! You completed your daily target.' : `${remaining} remaining to reach daily target (${RESEARCH_TARGET_PER_DAY})`;

      const items = await ResearchEntry.findAll({
        where: { [CREATED_BY_FIELD]: userId },
        order: [[CREATED_AT_FIELD, 'DESC']],
        limit: 2000,
      });

      const normalized = items.map((r) => ({
        id: r.id ?? r.entryId ?? null,
        title: r.title ?? r.subject ?? 'Research',
        status: r.status ?? null,
        createdAt: r[CREATED_AT_FIELD] ?? null,
        raw: r,
      }));

      return res.json({ summary: { totalCount, todayCount, remaining, message }, items: normalized });
    }

    // TELECALL
    if (metric === 'telecall') {
      const items = await Lead.findAll({
        where: {
          [LEAD_STAGE_FIELD]: STAGE_TELECALL,
          [LEAD_TELECALLER_FIELD]: userId,
        },
        order: [['updatedAt', 'DESC']],
        limit: 2000,
      });


      const normalized = items.map((l) => ({
        ticketId: l[LEAD_TICKET_FIELD] ?? l.id ?? null,
        title: l.title ?? l.name ?? l.company ?? 'Lead',
        stage: l[LEAD_STAGE_FIELD],
        assignedTo: l[LEAD_TELECALLER_FIELD] ?? null,
        updatedAt: l.updatedAt ?? null,
        raw: l,
      }));

      return res.json({ items: normalized });
    }

    // MEETING
    if (metric === 'meeting') {
      const items = await Lead.findAll({
        where: {
          [LEAD_STAGE_FIELD]: STAGE_MEETING,
          [LEAD_MEETING_EXEC_FIELD]: userId,
        },
        order: [['updatedAt', 'DESC']],
        limit: 2000,
      });

      const normalized = items.map((l) => ({
        ticketId: l[LEAD_TICKET_FIELD] ?? l.id ?? null,
        title: l.title ?? l.name ?? l.company ?? 'Lead',
        stage: l[LEAD_STAGE_FIELD],
        assignedTo: l[LEAD_MEETING_EXEC_FIELD] ?? null,
        updatedAt: l.updatedAt ?? null,
        raw: l,
      }));

      console.log("normalized: ", normalized);

      return res.json({ items: normalized });
    }

    // // FOLLOWUP / CRM
    // if (metric === 'followup' || metric === 'crm' || metric === 'followups') {
    //   console.log("crm pending1");
    //   const items = await Lead.findAll({
    //     where: { [LEAD_STAGE_FIELD]: STAGE_CRM },
    //     order: [['updatedAt', 'DESC']],
    //     limit: 5000,
    //   });

    //   const normalized = items.map((l) => ({
    //     ticketId: l[LEAD_TICKET_FIELD] ?? l.id ?? null,
    //     title: l.title ?? l.name ?? l.company ?? 'Lead',
    //     stage: l[LEAD_STAGE_FIELD],
    //     updatedAt: l.updatedAt ?? null,
    //     raw: l,
    //   }));

    //   return res.json({ items: normalized });
    // }

    // default
    return res.json({ items: [] });
  } catch (err) {
    console.error('coordinator.getUserPending error', err);
    return res.status(500).json({ message: err.message ?? 'Failed to fetch pending items' });
  }
}

/**
 * GET /pending/crm
 * Returns aggregated pending leads in CRM stage.
 */
export async function getCrmPending(req, res) {
  try {
    console.log("crm pending2");
    const items = await Lead.findAll({
      where: { [LEAD_STAGE_FIELD]: STAGE_CRM },
      order: [['updatedAt', 'DESC']],
      limit: 5000,
    });

    const normalized = items.map((l) => ({
      ticketId: l[LEAD_TICKET_FIELD] ?? l.id ?? null,
      title: l.title ?? l.name ?? l.company ?? 'Lead',
      stage: l[LEAD_STAGE_FIELD],
      updatedAt: l.updatedAt ?? null,
      raw: l,
    }));

    return res.json(normalized);
  } catch (err) {
    console.error('coordinator.getCrmPending error', err);
    return res.status(500).json({ message: err.message ?? 'Failed to fetch CRM pending items' });
  }
}
