import { Op } from 'sequelize';
import db from '../../models/index.js';
import { generateNextTicketId } from '../../services/salesPipeline/leadService.js';

export async function listLeads(req, res, next){
  try {
    const { q='', stage='', clientStatus='', limit=50, page=1 } = req.query;
    const where = {};
    if (stage) where.stage = stage;
    if (clientStatus) where.clientStatus = clientStatus;
    if (q) where.company = { [Op.like]: `%${q}%` };

    const rows = await db.Lead.findAndCountAll({
      where, limit:+limit, offset:(+page-1)*(+limit), order:[['updatedAt','DESC']]
    });
    res.json(rows);
  } catch (e) { next(e); }
}

export async function getLead(req, res, next){
  try {
    const lead = await db.Lead.findByPk(req.params.ticketId, {
      include: [
        { association: 'history', order: [['createdAt','DESC']] },
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


export async function getNextTicketId(req, res, next){
  try {
    // run inside a tx so we read consistently
    const ticketId = await db.sequelize.transaction(async (t) => {
      return generateNextTicketId(t);
    });
    res.json({ ticketId });
  } catch (e) { next(e); }
}