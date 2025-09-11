import db from '../../models/index.js';
import { transitionStage } from '../../services/salesPipeline/leadService.js';
import { stageMismatch } from '../../middlewares/salesPipeline/error.js';

export async function createTelecall(req, res, next) {
  const { ticketId, meetingType, meetingDateTime, meetingAssignee, createdBy } = req.body;
  if (!ticketId) return res.status(400).json({ error: 'ticketId required' });

  try {
    await db.sequelize.transaction(async (t) => {
      const lead = await db.Lead.findByPk(ticketId, { transaction: t });
      if (!lead) throw Object.assign(new Error('Lead not found'), { status: 404 });

      // ⛔ enforce correct stage
      if (lead.stage !== 'TELECALL') {
        throw stageMismatch({ ticketId, expected: 'TELECALL', current: lead.stage });
      }

      await db.TelecallEntry.create({
        ticketId,
        meetingType,
        meetingDateTime: meetingDateTime ? new Date(meetingDateTime) : null,
        meetingAssignee: meetingAssignee || null,
        createdBy: createdBy || 'telecaller'
      }, { transaction: t });

      lead.set({
        meetingType,
        meetingDateTime: meetingDateTime ? new Date(meetingDateTime) : null,
        meetingAssignee: meetingAssignee || null
      });
      await transitionStage(lead, 'MEETING', 'Telecall scheduled', 'telecaller', t);
      await lead.save({ transaction: t });
    });

    res.json({ ok: true });
  } catch (e) { next(e); }
}
