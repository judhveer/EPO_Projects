// controllers/coordinatorController.js
// ESM controller adapted to use ResearchEntry, Approval, TelecallEntry, MeetingEntry models.
// Assumes ../models/index.js exports default db = { ResearchEntry, Approval, TelecallEntry, MeetingEntry, User, ... }

import { Op } from 'sequelize';
import db from '../../models/index.js'; // adjust path if needed
import Debug from 'debug';
const debug = Debug('app:coordinatorController');

const { User } = db;

// Try to resolve models with several common names; returns model or null
function getModel(names = []) {
  for (const n of names) {
    if (n && db[n]) return db[n];
  }
  return null;
}

const ResearchModel = getModel(['ResearchEntry', 'Research', 'researchEntries', 'ResearchEntries']);
const ApprovalModel = getModel(['Approval', 'Approvals', 'approval']);
const TelecallModel = getModel(['TelecallEntry', 'Telecall', 'Telecalls', 'TelecallEntries']);
const MeetingModel = getModel(['MeetingEntry', 'Meeting', 'Meetings', 'MeetingForm', 'meetingEntries']);
const FinalStatuses = ['COMPLETED', 'DONE', 'CLOSED', 'CANCELLED', 'RESOLVED']; // adjust if you use different labels

// Research target logic (used previously in UI) — 5 per day Mon-Sat
const RESEARCH_TARGET_PER_DAY = 5;

/**
 * Helper: get user primary key value from user instance or object
 */
function getUserPk(user) {
  if (!user) return null;
  return user.id ?? user.userId ?? user.uid ?? user.username ?? user.usernameId ?? null;
}

/**
 * Normalize user row
 */
function normalizeUserRow(user, stats = {}) {
  return {
    userId: getUserPk(user),
    name: user.username,
    email: user.email ?? '',
    todayCount: Number(stats.todayCount || 0),
    totalCount: Number(stats.totalCount || 0),
    pendingCount: Number(stats.pendingCount || 0),
    raw: user,
  };
}

/**
 * GET /users?role=<ROLE>
 *
 * Role handling:
 * - RESEARCHER: counts from ResearchModel where createdBy = user identifier
 *   todayCount uses createdAt between todayStart/todayEnd.
 *   pendingCount = max(0, RESEARCH_TARGET_PER_DAY - todayCount) <-- this matches the UI target behavior.
 *
 * - TELECALLER:
 *   totalCount and todayCount from TelecallModel where createdBy = user identifier (telecall forms done by telecaller)
 *   pendingCount from ApprovalModel where assignee/telecaller assigned and status NOT in FINAL_STATUSES
 *
 * - SALES_EXECUTIVE:
 *   totalCount and todayCount from MeetingModel where createdBy = user identifier (meeting forms created by exec)
 *   pendingCount from TelecallModel where meetingAssignee (field name guessed) equals user identifier and meeting not completed
 *
 * - CRM:
 *   totalCount and todayCount from MeetingModel where createdBy = user identifier AND is_followup / followup flag (guessed)
 *   pendingCount: aggregated pending followups across MeetingModel (same number shown against every CRM user)
 *
 * NOTES: field names like `createdBy`, `createdAt`, `assignedTo`, `assignee`, `meetingAssignee`, `followupRequired`
 * are guessed — adjust the where clauses below to match your schema.
 */
export async function getUsers(req, res) {
  const role = req.query.role;
  if (!role) return res.status(400).json({ message: 'Missing role parameter' });

  // today boundaries (server local timezone)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  try {
    // fetch users with this role
    const users = await User.findAll({ where: { role } });

    // If no records in models, warn once
    if (role === 'RESEARCHER' && !ResearchModel) debug('Warning: ResearchModel not found in db exports.');
    if (role === 'TELECALLER' && !TelecallModel) debug('Warning: TelecallModel not found in db exports.');
    if (role === 'TELECALLER' && !ApprovalModel) debug('Warning: ApprovalModel not found in db exports.');
    if (role === 'SALES_EXECUTIVE' && !MeetingModel) debug('Warning: MeetingModel not found in db exports.');
    if (role === 'SALES_EXECUTIVE' && !TelecallModel) debug('Warning: TelecallModel not found in db exports (needed for pending meetings).');
    if (role === 'CRM' && !MeetingModel) debug('Warning: MeetingModel not found for CRM followups.');

    const rows = await Promise.all(users.map(async (u) => {
      const uid = getUserPk(u);
      if (!uid) return normalizeUserRow(u);

      if (role === 'RESEARCHER') {
        // Research entries created by researcher
        const createdByFieldCandidates = ['createdBy', 'created_by', 'creatorId', 'creator', 'userId'];
        const createdAtField = 'createdAt'; // common
        const whereBase = {};
        // build where using first matching createdBy field present in model attributes (best-effort)
        // Sequelize model rawAttributes may be available: ResearchModel.rawAttributes
        if (!ResearchModel) {
          // fallback empty counts
          return normalizeUserRow(u, { totalCount: 0, todayCount: 0, pendingCount: 0 });
        }
        // Helper to pick field name existing in model
        let createdByField = createdByFieldCandidates.find((f) => ResearchModel.rawAttributes && ResearchModel.rawAttributes[f]);
        if (!createdByField) createdByField = 'createdBy'; // keep guess

        const totalCount = await ResearchModel.count({ where: { [createdByField]: uid } });
        const todayCount = await ResearchModel.count({
          where: { [createdByField]: uid, [createdAtField]: { [Op.between]: [todayStart, todayEnd] } },
        });
        // pending for researcher: target difference (UI shows a target of 5/day Mon-Sat)
        const pendingCount = Math.max(0, RESEARCH_TARGET_PER_DAY - todayCount);

        return normalizeUserRow(u, { totalCount, todayCount, pendingCount });
      }

      if (role === 'TELECALLER') {
        // total/today from TelecallModel createdBy; pending from ApprovalModel where assigned telecaller has pending assignments
        if (!TelecallModel) {
          return normalizeUserRow(u, { totalCount: 0, todayCount: 0, pendingCount: 0 });
        }

        // detect createdBy field
        const tcCreatedBy = TelecallModel.rawAttributes && TelecallModel.rawAttributes.createdBy ? 'createdBy'
          : (TelecallModel.rawAttributes && TelecallModel.rawAttributes.created_by ? 'created_by' : 'createdBy');

        const totalCount = await TelecallModel.count({ where: { [tcCreatedBy]: uid } });
        const todayCount = await TelecallModel.count({
          where: { [tcCreatedBy]: uid, createdAt: { [Op.between]: [todayStart, todayEnd] } },
        });

        // pendingCount from ApprovalModel where assignee = uid and status NOT final
        let pendingCount = 0;
        if (ApprovalModel) {
          // common assignee field guesses
          const assigneeFields = ['assignee', 'assignedTo', 'telecallerId', 'assigneeId'];
          let assigneeField = assigneeFields.find((f) => ApprovalModel.rawAttributes && ApprovalModel.rawAttributes[f]);
          if (!assigneeField) assigneeField = 'assignee';

          // status field guess
          const statusField = (ApprovalModel.rawAttributes && ApprovalModel.rawAttributes.status) ? 'status' : 'status';
          pendingCount = await ApprovalModel.count({
            where: {
              [assigneeField]: uid,
              [statusField]: { [Op.notIn]: FinalStatuses },
            },
          });
        } else {
          // fallback: try TelecallModel for pendingFlag (if TelecallModel holds assignment)
          const meetingAssigneeField = TelecallModel.rawAttributes && (TelecallModel.rawAttributes.assignee || TelecallModel.rawAttributes.assignedTo || TelecallModel.rawAttributes.telecallerId) ? 'assignee' : null;
          if (meetingAssigneeField) {
            pendingCount = await TelecallModel.count({
              where: {
                [meetingAssigneeField]: uid,
                status: { [Op.notIn]: FinalStatuses },
              },
            });
          } else {
            pendingCount = 0;
          }
        }

        return normalizeUserRow(u, { totalCount, todayCount, pendingCount });
      }

      if (role === 'SALES_EXECUTIVE') {
        // total/today from MeetingModel createdBy (executive creates meeting entries when they complete them)
        // pending from TelecallModel where meeting assignee is this user and meeting not completed
        let totalCount = 0;
        let todayCount = 0;
        let pendingCount = 0;

        if (MeetingModel) {
          const meetingCreatedBy = (MeetingModel.rawAttributes && (MeetingModel.rawAttributes.createdBy || MeetingModel.rawAttributes.created_by)) ? (MeetingModel.rawAttributes.createdBy ? 'createdBy' : 'created_by') : 'createdBy';
          totalCount = await MeetingModel.count({ where: { [meetingCreatedBy]: uid } });
          todayCount = await MeetingModel.count({
            where: { [meetingCreatedBy]: uid, createdAt: { [Op.between]: [todayStart, todayEnd] } },
          });
        }

        if (TelecallModel) {
          // guess meeting-assignee field names set by telecaller on telecall form
          const assigneeCandidates = ['meetingAssignee', 'assignee', 'assignedTo', 'meeting_assignee'];
          let assigneeField = assigneeCandidates.find((f) => TelecallModel.rawAttributes && TelecallModel.rawAttributes[f]);
          if (!assigneeField) assigneeField = 'meetingAssignee'; // guess

          // guess meeting status or meeting_confirmed flag
          const meetingStatusField = 'meetingStatus'; // guessed
          // We'll try to count telecall records assigned for meeting to this exec and whose meeting status is not final
          // If TelecallModel doesn't have meetingStatus, we'll count where meetingAssignee = uid and status != final
          const wherePending = {};
          wherePending[assigneeField] = uid;
          if (TelecallModel.rawAttributes && TelecallModel.rawAttributes[meetingStatusField]) {
            wherePending[meetingStatusField] = { [Op.notIn]: FinalStatuses };
          } else {
            wherePending.status = { [Op.notIn]: FinalStatuses };
          }
          pendingCount = await TelecallModel.count({ where: wherePending });
        }

        return normalizeUserRow(u, { totalCount, todayCount, pendingCount });
      }

      if (role === 'CRM') {
        // For CRM, followups live in MeetingModel (meeting forms) — total when crm filled entry form (createdBy)
        // Pending followups: meeting entries with followup required and status not final.
        let totalCount = 0;
        let todayCount = 0;
        // Pending computed globally later (we still compute per user placeholder)
        let pendingCount = 0;

        if (MeetingModel) {
          // guess createdBy field
          const mCreatedBy = (MeetingModel.rawAttributes && MeetingModel.rawAttributes.createdBy) ? 'createdBy' : 'createdBy';
          // guess followup flag or type
          const followupFlagCandidates = ['isFollowup', 'followupRequired', 'followup', 'needsFollowup'];
          const followupFlagField = followupFlagCandidates.find((f) => MeetingModel.rawAttributes && MeetingModel.rawAttributes[f]) ?? null;

          const followupWhere = {};
          followupWhere[mCreatedBy] = uid;
          if (followupFlagField) followupWhere[followupFlagField] = true;

          totalCount = await MeetingModel.count({ where: followupWhere });
          todayCount = await MeetingModel.count({
            where: { ...followupWhere, createdAt: { [Op.between]: [todayStart, todayEnd] } },
          });

          // pending for this user we set to 0 placeholder — we'll compute aggregated pending for all CRM users below
          pendingCount = 0;
        }

        return normalizeUserRow(u, { totalCount, todayCount, pendingCount });
      }

      // default fallback
      return normalizeUserRow(u, { totalCount: 0, todayCount: 0, pendingCount: 0 });
    }));

    // For CRM role: aggregate pending followups across MeetingModel and set same pendingCount for every CRM user
    if (role === 'CRM') {
      let aggregatedPending = 0;
      if (MeetingModel) {
        // guess followup flag or followup-type detection
        const followupFlagCandidates = ['isFollowup', 'followupRequired', 'followup', 'needsFollowup'];
        const followupFlagField = followupFlagCandidates.find((f) => MeetingModel.rawAttributes && MeetingModel.rawAttributes[f]) ?? null;

        const where = {};
        if (followupFlagField) where[followupFlagField] = true;
        // pending where status not final
        where.status = { [Op.notIn]: FinalStatuses };

        aggregatedPending = await MeetingModel.count({ where });
      }
      // set pendingCount for each CRM user row
      for (const r of rows) {
        if (r) r.pendingCount = aggregatedPending;
      }
    }

    return res.json(rows);
  } catch (err) {
    console.error('coordinator.getUsers error', err);
    return res.status(500).json({ message: err.message ?? 'Failed to fetch users' });
  }
}

/**
 * GET /user/:userId/pending?metric=<metric>
 *
 * metric parameter helps determine which pending list to return. We'll map metric names:
 * - research -> return Research entries for the researcher that are maybe draft/missing? (here returning recent research entries)
 * - telecall -> return pending approvals assigned to telecaller (ApprovalModel)
 * - meeting -> return pending meetings assigned to exec (TelecallModel rows that have meetingAssignee = user)
 * - followup -> return meeting entries that need followup (MeetingModel)
 *
 * If metric is not provided we'll infer from role query param (optional).
 */
export async function getUserPending(req, res) {
  const userId = req.params.userId;
  const metric = (req.query.metric || req.query.type || '').toLowerCase();

  if (!userId) return res.status(400).json({ message: 'Missing userId param' });
  if (!metric) return res.status(400).json({ message: 'Missing metric query param' });

  try {
    // RESEARCHER pending: return research entries by the user (could be drafts or recent research)
    if (metric === 'research') {
      if (!ResearchModel) return res.json([]);
      // We'll return research entries created by user (you can adjust where clause to return only incomplete ones)
      const createdByField = ResearchModel.rawAttributes && ResearchModel.rawAttributes.createdBy ? 'createdBy' : 'createdBy';
      const items = await ResearchModel.findAll({
        where: { [createdByField]: userId },
        order: [['createdAt', 'DESC']],
        limit: 2000,
      });
      const normalized = items.map((r) => ({
        id: r.id ?? r.entryId ?? null,
        title: r.title ?? r.subject ?? 'Research',
        status: r.status ?? 'CREATED',
        assignedAt: r.createdAt ?? null,
        dueDate: r.dueDate ?? null,
        raw: r,
      }));
      return res.json(normalized);
    }

    // TELECALLER pending: approvals assigned to telecaller
    if (metric === 'telecall') {
      if (!ApprovalModel) return res.json([]);
      // try to find assignee field
      const assigneeField = (ApprovalModel.rawAttributes && (ApprovalModel.rawAttributes.assignee || ApprovalModel.rawAttributes.assignedTo || ApprovalModel.rawAttributes.telecallerId)) ? (ApprovalModel.rawAttributes.assignee ? 'assignee' : (ApprovalModel.rawAttributes.assignedTo ? 'assignedTo' : 'telecallerId')) : 'assignee';
      const items = await ApprovalModel.findAll({
        where: {
          [assigneeField]: userId,
          status: { [Op.notIn]: FinalStatuses },
        },
        order: [['createdAt', 'DESC']],
        limit: 2000,
      });
      const normalized = items.map((a) => ({
        id: a.id ?? a.approvalId ?? null,
        title: a.title ?? a.taskName ?? 'Telecall Task',
        status: a.status,
        assignedAt: a.assignedAt ?? a.createdAt ?? null,
        dueDate: a.dueDate ?? null,
        raw: a,
      }));
      return res.json(normalized);
    }

    // MEETING pending: telecall entries that created meeting assignment to this exec (meetingAssignee)
    if (metric === 'meeting') {
      if (!TelecallModel) return res.json([]);
      // guess field name set by telecaller while assigning meeting
      const assigneeCandidates = ['meetingAssignee', 'assignee', 'assignedTo', 'meeting_assignee'];
      const assigneeField = assigneeCandidates.find((f) => TelecallModel.rawAttributes && TelecallModel.rawAttributes[f]) ?? 'meetingAssignee';
      // meeting status candidate
      const meetingStatusField = TelecallModel.rawAttributes && TelecallModel.rawAttributes.meetingStatus ? 'meetingStatus' : 'status';
      const where = {
        [assigneeField]: userId,
        [meetingStatusField]: { [Op.notIn]: FinalStatuses },
      };
      const items = await TelecallModel.findAll({ where, order: [['createdAt', 'DESC']], limit: 2000 });
      const normalized = items.map((t) => ({
        id: t.id ?? t.entryId ?? null,
        title: t.title ?? t.subject ?? 'Telecall (meeting assigned)',
        status: t[meetingStatusField] ?? t.status ?? 'PENDING',
        assignedAt: t.createdAt ?? null,
        dueDate: t.dueDate ?? null,
        raw: t,
      }));
      return res.json(normalized);
    }

    // FOLLOWUP pending: meeting entries that require followup (CRM)
    if (metric === 'followup' || metric === 'crm' || metric === 'followups') {
      if (!MeetingModel) return res.json([]);
      // try to find followup flag field
      const followupFlagCandidates = ['isFollowup', 'followupRequired', 'followup', 'needsFollowup'];
      const followupFlag = followupFlagCandidates.find((f) => MeetingModel.rawAttributes && MeetingModel.rawAttributes[f]) ?? null;

      const where = {};
      if (followupFlag) where[followupFlag] = true;
      where.status = { [Op.notIn]: FinalStatuses };

      // If userId param is 'all' or the request is for global CRM list, return all. Otherwise return createdBy = userId (but UI expects aggregated list for CRM)
      const items = await MeetingModel.findAll({ where, order: [['dueDate', 'ASC']], limit: 5000 });
      const normalized = items.map((m) => ({
        id: m.id ?? m.entryId ?? null,
        title: m.title ?? m.subject ?? 'Meeting / Followup',
        status: m.status,
        assignedAt: m.createdAt ?? null,
        dueDate: m.dueDate ?? null,
        assignedTo: m.assignedTo ?? m.assignee ?? null,
        raw: m,
      }));
      return res.json(normalized);
    }

    // default: return empty
    return res.json([]);
  } catch (err) {
    console.error('coordinator.getUserPending error', err);
    return res.status(500).json({ message: err.message ?? 'Failed to fetch pending items' });
  }
}

/**
 * GET /pending/crm
 * returns aggregated pending followups from MeetingModel (same list shown for all CRMs)
 */
export async function getCrmPending(req, res) {
  try {
    if (!MeetingModel) return res.json([]);

    const followupFlagCandidates = ['isFollowup', 'followupRequired', 'followup', 'needsFollowup'];
    const followupFlag = followupFlagCandidates.find((f) => MeetingModel.rawAttributes && MeetingModel.rawAttributes[f]) ?? null;

    const where = {};
    if (followupFlag) where[followupFlag] = true;
    where.status = { [Op.notIn]: FinalStatuses };

    const items = await MeetingModel.findAll({ where, order: [['dueDate', 'ASC']], limit: 5000 });

    const normalized = items.map((m) => ({
      id: m.id ?? m.entryId ?? null,
      title: m.title ?? m.subject ?? 'Meeting / Followup',
      status: m.status,
      assignedAt: m.createdAt ?? null,
      dueDate: m.dueDate ?? null,
      assignedTo: m.assignedTo ?? m.assignee ?? null,
      raw: m,
    }));

    return res.json(normalized);
  } catch (err) {
    console.error('coordinator.getCrmPending error', err);
    return res.status(500).json({ message: err.message ?? 'Failed to fetch CRM pending items' });
  }
}
