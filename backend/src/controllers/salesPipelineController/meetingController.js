import db from '../../models/index.js';
import { transitionStage } from '../../services/salesPipeline/leadService.js';
import { stageMismatch } from '../../middlewares/SalesPipeline/error.js';

export async function createMeetingOutcome(req, res, next) {
  const {
    ticketId,
    outcomeNotes,
    status,
    newActualBudget,
    // new for CRM follow-up
    nextFollowUpOn,
    // new for reschedule meeting
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
      if (lead.stage !== 'MEETING') {
        throw stageMismatch({ ticketId, expected: 'MEETING', current: lead.stage });
      }

      const norm = String(status).toUpperCase();

      // Validate special cases
      if (norm === 'CRM_FOLLOW_UP' && !nextFollowUpOn) {
        const err = new Error('Please provide "Next Follow-up On" when sending to CRM Follow-up.');
        err.status = 400; throw err;
      }
      if (norm === 'RESCHEDULE_MEETING' && (!meetingType || !meetingDateTime)) {
        const err = new Error('For "RESCHEDULE_MEETING", Meeting Type and Meeting Date & Time are required.');
        err.status = 400; throw err;
      }



      await db.MeetingEntry.create({
        ticketId,
        outcomeNotes: outcomeNotes || '',
        status: norm,
        newActualBudget: newActualBudget ?? null,
        rescheduleMeetingType: norm === 'RESCHEDULE_MEETING' ? meetingType : null,
        rescheduleMeetingDateTime: norm === 'RESCHEDULE_MEETING' ? (meetingDateTime ? new Date(meetingDateTime) : null) : null,
        rescheduleMeetingAssignee: norm === 'RESCHEDULE_MEETING' ? (meetingAssignee || null) : null,
        nextFollowUpOn: norm === 'CRM_FOLLOW_UP' ? (nextFollowUpOn ? new Date(nextFollowUpOn) : null) : null,
        createdBy: createdBy || 'exec'
      }, { transaction: t });

      lead.set({
        outcomeNotes: outcomeNotes || '',
        outcomeStatus: norm,
        newActualBudget: newActualBudget ?? lead.newActualBudget
      });


      if (norm === 'CRM_FOLLOW_UP') {
        lead.set({ stage: 'CRM', clientStatus: 'OPEN', nextFollowUpOn: new Date(nextFollowUpOn) });
        await transitionStage(lead, 'CRM', 'Meeting → CRM_FOLLOW_UP', 'exec', t);
      }
      else if (norm === 'RESCHEDULE_MEETING') {
        // keep stage at MEETING, but update next meeting details
        lead.set({
          meetingType: meetingType,
          meetingDateTime: meetingDateTime ? new Date(meetingDateTime) : null,
          meetingAssignee: meetingAssignee || null,
          stage: 'MEETING'
        });
        // we keep stage the same; no transition record needed unless you want one
      }
      else if (norm === 'APPROVE') {
        lead.set({ clientStatus: 'WON', stage: 'CLOSED' });
        await transitionStage(lead, 'CLOSED', 'Meeting → APPROVE', 'exec', t);
      } else if (norm === 'REJECT') {
        lead.set({ clientStatus: 'LOST', stage: 'CLOSED' });
        await transitionStage(lead, 'CLOSED', 'Meeting → REJECT', 'exec', t);
      }
      await lead.save({ transaction: t });
    });

    res.json({ ok: true });
  } catch (e) { next(e); }
}
