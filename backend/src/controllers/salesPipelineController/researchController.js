import db from '../../models/index.js';
import { ensureLead, transitionStage, generateNextTicketId } from '../../services/salesPipeline/leadService.js';
// Create a new research entry, and update the parent lead's snapshot + stage
export async function createResearch(req, res, next) {
  let { ticketId, researchDate, company, contactName, mobile, email, region, estimatedBudget, createdBy } = req.body;
  if (!company || !contactName || !mobile) {
    return res.status(400).json({ error: 'company, contactName, mobile are required' });
  }

  try {
    let finalTicketId = ticketId && ticketId !== 'AUTO' ? String(ticketId).trim() : '';

    await db.sequelize.transaction(async (t) => {
      if (!finalTicketId) {
        finalTicketId = await generateNextTicketId(t);
      } else {
        // If client supplied a ticketId, ensure it's not already taken
        const exists = await db.Lead.findByPk(finalTicketId, { transaction: t });
        if (exists) {
          const err = new Error('Ticket ID already exists, please refresh to get a new one.');
          err.status = 409;
          throw err;
        }
      }

      // 1) Ensure parent lead exists
      const lead = await ensureLead(finalTicketId, {}, t);

      // 2) Insert child
      await db.ResearchEntry.create({
        ticketId: finalTicketId,
        researchDate: researchDate ? new Date(researchDate) : null,
        company, contactName, mobile, email, region,
        estimatedBudget: estimatedBudget ?? null,
        createdBy: createdBy || 'research'
      }, { transaction: t });

      // 3) Update snapshot + stage
      lead.set({
        researchDate: researchDate ? new Date(researchDate) : lead.researchDate,
        company, contactName, mobile, email, region,
        estimatedBudget: estimatedBudget ?? lead.estimatedBudget,
        approveStatus: 'PENDING',
        clientStatus: 'OPEN'
      });

      await transitionStage(lead, 'APPROVAL', 'Research submitted', 'research', t);
      await lead.save({ transaction: t });
    });

    res.json({ ok: true, ticketId: finalTicketId, stage: 'APPROVAL' });
  } catch (e) { next(e); }
}

