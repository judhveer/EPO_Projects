import { Op, QueryTypes } from "sequelize";
import models from "../../models/index.js";
import { nowIST } from "../../utils/attendance/istTime.js";
import { findCurrentShift } from "../attendance/currentShiftService.js";

const { User, LeaveRequest, sequelize } = models;

// Workload weights — one place to tune. Paused counts less than assigned
// because a paused job was already started and is partly done.
export const WORKLOAD_WEIGHTS = Object.freeze({
  running: 5,       // in_progress and not paused
  paused: 2,        // in_progress but is_paused = 1
  assigned: 3,      // assigned, not started yet
  urgentWaiting: 0, // Urgent no longer adds to the workload score (Urgent only decides sweep order)
});

export function computeScore({ running, paused, assigned, urgentWaiting }) {
  return (
    running * WORKLOAD_WEIGHTS.running +
    paused * WORKLOAD_WEIGHTS.paused +
    assigned * WORKLOAD_WEIGHTS.assigned +
    (urgentWaiting > 0 ? WORKLOAD_WEIGHTS.urgentWaiting : 0)
  );
}

/**
 * Who may receive a job right now?
 * Eligible = active account + checked in + not checked out + no approved leave today.
 * Inactive accounts are never fetched, so they never appear anywhere.
 */
export async function getEligibleDesigners(now = nowIST()) {
  const designers = await User.findAll({
    where: { department: "Designer", isActive: true },
    attributes: ["id", "username"],
    order: [["username", "ASC"]],
  });

  if (designers.length === 0) return { eligible: [], excluded: [] };

  const today = now.toISODate(); // "YYYY-MM-DD" in IST
  const ids = designers.map((d) => d.id);

  const [leaves, shifts] = await Promise.all([
    LeaveRequest.findAll({
      where: {
        employee_id: { [Op.in]: ids },
        status: "APPROVED",
        date_from: { [Op.lte]: today },
        date_to: { [Op.gte]: today },
      },
      attributes: ["employee_id"],
    }),
    // Reuses the attendance module's own shift logic (overnight shifts,
    // 6 AM cutoff, stale open shifts) instead of re-implementing it.
    Promise.all(designers.map((d) => findCurrentShift(d.id, now))),
  ]);

  const onLeave = new Set(leaves.map((l) => l.employee_id));
  const eligible = [];
  const excluded = [];

  designers.forEach((designer, i) => {
    const record = shifts[i].record;
    let reason = null;

    if (onLeave.has(designer.id)) reason = "on approved leave today";
    else if (!record?.check_in_time) reason = "not checked in";
    else if (record.check_out_time) reason = "already checked out";

    if (reason) {
      excluded.push({ designer_id: designer.id, name: designer.username, reason });
    } else {
      eligible.push({ id: designer.id, username: designer.username });
    }
  });

  return { eligible, excluded };
}

// ONE grouped query for all designers (the old getDesignerStatus runs
// 3 queries per designer inside a loop).
async function getWorkloads(designerIds) {
  return sequelize.query(
    `SELECT a.designer_id,
            SUM(a.status = 'in_progress' AND a.is_paused = 0)       AS running,
            SUM(a.status = 'in_progress' AND a.is_paused = 1)       AS paused,
            SUM(a.status = 'assigned')                              AS assigned,
            SUM(a.status = 'assigned' AND j.task_priority = 'Urgent') AS urgent_waiting,
            MAX(a.assigned_at)                                      AS last_assigned_at
       FROM jobfms_job_assignments a
       JOIN jobfms_job_cards j ON j.job_no = a.job_no
      WHERE a.designer_id IN (:ids)
      GROUP BY a.designer_id`,
    { replacements: { ids: designerIds }, type: QueryTypes.SELECT },
  );
}

/**
 * Ranks eligible designers, best candidate first.
 * Order: lowest score, then least recently assigned, then name (stable).
 */
export async function rankDesignersForAssignment(now = nowIST()) {
  const { eligible, excluded } = await getEligibleDesigners(now);
  if (eligible.length === 0) return { ranked: [], excluded };

  const rows = await getWorkloads(eligible.map((d) => d.id));
  const byId = new Map(rows.map((r) => [r.designer_id, r]));

  const ranked = eligible.map((d) => {
    const r = byId.get(d.id);
    const load = {
      running: Number(r?.running || 0),
      paused: Number(r?.paused || 0),
      assigned: Number(r?.assigned || 0),
      urgentWaiting: Number(r?.urgent_waiting || 0),
    };
    return {
      designer_id: d.id,
      name: d.username,
      ...load,
      score: computeScore(load),
      // null = never assigned anything → treated as "longest ago" → wins ties
      last_assigned_at: r?.last_assigned_at ? new Date(r.last_assigned_at) : null,
    };
  });

  ranked.sort(
    (a, b) =>
      a.score - b.score ||
      (a.last_assigned_at?.getTime() ?? 0) - (b.last_assigned_at?.getTime() ?? 0) ||
      a.name.localeCompare(b.name),
  );

  return { ranked, excluded };
}