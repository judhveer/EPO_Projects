import db from '../../models/index.js';
import { transitionStage } from '../../services/salesPipeline/leadService.js';
import { stageMismatch } from '../../middlewares/salesPipeline/error.js';

export async function createCrmFollowup(req, res, next) {
  const {
    ticketId,
    followupNotes,
    status,
    nextFollowUpOn,
    // NEW when CRM reschedules
    meetingType,
    meetingDateTime,
    meetingAssignee,
    createdBy
  } = req.body;

  if (!ticketId || !status) return res.status(400).json({ error: 'ticketId, status required' });

  try {
    await db.sequelize.transaction(async (t) => {
      const lead = await db.Lead.findByPk(ticketId, { transaction: t });
      if (!lead) throw Object.assign(new Error('Lead not found'), { status: 404 });

      // ⛔ enforce correct stage
      if (lead.stage !== 'CRM') {
        throw stageMismatch({ ticketId, expected: 'CRM', current: lead.stage });
      }

      const norm = String(status).toUpperCase();

      if (norm === 'RESCHEDULE_MEETING') {
        if (!meetingType || !meetingDateTime) {
          const err = new Error('For "RESCHEDULE_MEETING", Meeting Type and Meeting Date & Time are required.');
          err.status = 400; throw err;
        }
      }


      await db.CrmEntry.create({
        ticketId,
        followupNotes: followupNotes || '',
        status: norm,
        nextFollowUpOn: nextFollowUpOn ? new Date(nextFollowUpOn) : null,
        rescheduleMeetingType: norm === 'RESCHEDULE_MEETING' ? meetingType : null,
        rescheduleMeetingDateTime: norm === 'RESCHEDULE_MEETING' ? (meetingDateTime ? new Date(meetingDateTime) : null) : null,
        rescheduleMeetingAssignee: norm === 'RESCHEDULE_MEETING' ? (meetingAssignee || null) : null,
        createdBy: createdBy || 'crm'
      }, { transaction: t });

      lead.set({
        outcomeNotes: followupNotes || '',
        outcomeStatus: norm,
        lastFollowUpOn: new Date(),
        nextFollowUpOn: nextFollowUpOn ? new Date(nextFollowUpOn) : null
      });

      if (norm === 'HOLD') {
        // await transitionStage(lead, 'CRM', 'CRM → HOLD', 'crm', t);
        // lead.clientStatus = 'OPEN';
        lead.set({ stage: 'CRM', clientStatus: 'OPEN' });

      } else if (norm === 'APPROVE') {
        lead.set({ clientStatus: 'WON', stage: 'CLOSED' });
        await transitionStage(lead, 'CLOSED', 'CRM → APPROVE', 'crm', t);
        // lead.clientStatus = 'WON';
      } else if (norm === 'REJECT') {
        lead.set({ clientStatus: 'LOST', stage: 'CLOSED' });
        await transitionStage(lead, 'CLOSED', 'CRM → REJECT', 'crm', t);
        // lead.clientStatus = 'LOST';
      }
      else if (norm === 'RESCHEDULE_MEETING') {
        // move back to MEETING with new schedule details
        lead.set({
          meetingType,
          meetingDateTime: meetingDateTime ? new Date(meetingDateTime) : null,
          meetingAssignee: meetingAssignee || null,
          stage: 'MEETING',
          clientStatus: 'OPEN'
        });
        await transitionStage(lead, 'MEETING', 'CRM → Rescheduled Meeting', 'crm', t);
      }

      await lead.save({ transaction: t });
    });

    res.json({ ok: true });
  } catch (e) { next(e); }
}
