import db from '../../models/index.js';
import { transitionStage } from '../../services/salesPipeline/leadService.js';
import { stageMismatch } from '../../middlewares/SalesPipeline/error.js';

export async function createApproval(req, res, next) {
  const { ticketId, approveStatus, approverRemark, telecallerAssignedTo, approvedBy } = req.body;
  if (!ticketId || !approveStatus) {
    return res.status(400).json({
      error: 'ticketId, approveStatus required'
    });
  }

  try {
    await db.sequelize.transaction(async (t) => {
      // Ensure parent exists (approval should happen after research, but be safe)
      const lead = await db.Lead.findByPk(ticketId, { transaction: t });
      if (!lead) throw Object.assign(new Error('Lead not found'), { status: 404 });

      // ⛔ enforce correct stage
      if (lead.stage !== 'APPROVAL') {
        throw stageMismatch({ ticketId, expected: 'APPROVAL', current: lead.stage });
      }


      const norm = String(approveStatus).toUpperCase();

      // If accepting, telecallerAssignedTo is required
      if (norm === 'ACCEPTED' && !telecallerAssignedTo) {
        const err = new Error('When status is ACCEPTED, "Telecaller Assigned To" is required.');
        err.status = 400; throw err;
      }

      // Insert child first? No — parent already exists; but we still do both in tx
      await db.ApprovalEntry.create({
        ticketId,
        approveStatus: norm,
        approverRemark: approverRemark || '',
        telecallerAssignedTo: norm === 'ACCEPTED' ? (telecallerAssignedTo || null) : null,
        approvedBy: approvedBy || 'coordinator'
      }, { transaction: t });

      const prevStage = lead.stage;


      if (norm === 'REJECTED') {
        lead.set({ approveStatus: 'REJECTED', approverRemark, telecallerAssignedTo: null, stage: 'CLOSED', clientStatus: 'LOST' });
      } else if (norm === 'ACCEPTED') {
        lead.set({ approveStatus: 'ACCEPTED', approverRemark, telecallerAssignedTo, stage: 'TELECALL' });
      } else {
        lead.set({ approveStatus: 'PENDING', approverRemark, telecallerAssignedTo: null, stage: 'APPROVAL' });
      }

      if (prevStage !== lead.stage) {
        await transitionStage(lead, lead.stage, 'Coordinator decision', 'coordinator', t);
      }
      await lead.save({ transaction: t });
    });

    res.json({ ok: true });
  } catch (e) { next(e); }
}
