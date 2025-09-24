import { Op } from 'sequelize';
import db from '../../models/index.js';
import { generateNextTicketId } from '../../services/salesPipeline/leadService.js';
import jwt from 'jsonwebtoken';

export async function listLeads(req, res, next) {
  try {
    // Parse & validate query params
    const q = String(req.query.q || '').trim();
    const stage = String(req.query.stage || '').trim();
    const clientStatus = String(req.query.clientStatus || '').trim();
    let limit = Number(req.query.limit || 50);
    let page = Number(req.query.page || 1);

    const MAX_LIMIT = 200;
    if (!Number.isInteger(limit) || limit <= 0) limit = 50;
    if (!Number.isInteger(page) || page <= 0) page = 1;
    limit = Math.min(limit, MAX_LIMIT);


    const where = {};
    if (stage) where.stage = stage;
    if (clientStatus) where.clientStatus = clientStatus;

    if (q) {
      const like = `%${q}%`;
      where[Op.or] = [
        { company: { [Op.like]: like } },
        { region: { [Op.like]: like } },
      ];
    }

    const user = req.user || null;

    if (user) {
      const dept = String(user.department || '').toLowerCase();
      const role = String(user.role || '').toUpperCase();

      if (dept === 'sales dept') {
        if (role === 'TELECALLER') {
          where.telecallerAssignedTo = user.username;
        }
        else if (role === 'EXECUTIVE') {
          where.meetingAssignee = user.username;
        }
      }
    }

    const offset = (page - 1) * limit;

    const result = await db.Lead.findAndCountAll({
      where,
      order: [['updatedAt', 'DESC']],
      limit,
      offset,
    });

    const totalPages = Math.max(1, Math.ceil((Array.isArray(result) ? (result.count || 0) : result.count) / limit));

    res.json({
      rows: result.rows,
      count: result.count,
      page,
      limit,
      totalPages
    });
  } catch (e) { next(e); }
}

export async function getLead(req, res, next) {
  try {
    const lead = await db.Lead.findByPk(req.params.ticketId, {
      include: [
        { association: 'history', order: [['createdAt', 'DESC']] },
        { association: 'researchEntries' },
        { association: 'approvalEntries' },
        { association: 'telecallEntries' },
        { association: 'meetingEntries' },
        { association: 'crmEntries' },
      ]
    });
    if (!lead) return res.status(404).json({ error: 'not found' });
    res.json(lead);
  } catch (e) { next(e); }
}


export async function getNextTicketId(req, res, next) {
  try {
    // run inside a tx so we read consistently
    const ticketId = await db.sequelize.transaction(async (t) => {
      return generateNextTicketId(t);
    });
    res.json({ ticketId });
  } catch (e) { next(e); }
}