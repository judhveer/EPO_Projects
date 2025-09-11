import db from '../../models/index.js';
import { Op } from 'sequelize';

export async function ensureLead(ticketId, base = {}, t) {
  let lead = await db.Lead.findByPk(ticketId, { transaction: t });
  if (lead) return lead;
  lead = await db.Lead.create({
    ticketId,
    stage: base.stage || 'RESEARCH',
    approveStatus: base.approveStatus || 'PENDING',
    clientStatus: base.clientStatus || 'OPEN',
    ...base
  }, { transaction: t });
  return lead;
}

export async function transitionStage(lead, toStage, notes, by, t) {
  const fromStage = lead.stage;
  if (fromStage === toStage) return;
  lead.stage = toStage;
  await db.StageHistory.create(
    { ticketId: lead.ticketId, fromStage, toStage, notes: notes || '', by: by || 'system' },
    { transaction: t }
  );
}


// format: T-YYYYMMDD-0001
export async function generateNextTicketId(t) {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const prefix = `T-${yyyy}${mm}${dd}-`;

  const last = await db.Lead.findOne({
    where: { ticketId: { [Op.like]: `${prefix}%` } },
    order: [['ticketId', 'DESC']],
    transaction: t
  });

  let nextNum = 1;
  if (last) {
    const m = last.ticketId.match(/-(\d{4})$/);
    if (m) nextNum = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(nextNum).padStart(4, '0')}`;
}