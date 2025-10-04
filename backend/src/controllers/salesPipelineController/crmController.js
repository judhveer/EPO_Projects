import db from '../../models/index.js';
import dotenv from 'dotenv';
dotenv.config();
import { transitionStage } from '../../services/salesPipeline/leadService.js';
import { stageMismatch } from '../../middlewares/salesPipeline/error.js';
import { sendMail, tplAssigned } from '../../email/salespipeline/mailer.js';

export async function createCrmFollowup(req, res, next) {
  const {
    ticketId,
    followupNotes,
    status,
    nextFollowUpOn,
    // NEW when CRM reschedules
    meetingType,
    meetingDateTime,
    meetingAssignee
  } = req.body;

  if (!ticketId || !status) return res.status(400).json({ error: 'ticketId, status required' });

  // we'll populate this inside the transaction and use it after commit
  let leadSnapshot = null;

  try {

    const createdBy = req.user.username;

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

      // capture a plain snapshot to use after transaction completes
      leadSnapshot = lead.get({ plain: true });
    });


    if (leadSnapshot && leadSnapshot.outcomeStatus === "CRM_FOLLOW_UP" && leadSnapshot.stage === 'CRM') {


      // find the user by username (or id) — try both if you allow either
      const crmUsers = await db.User.findAll({
        where: {
          department: "Sales Dept",
          role: "CRM"
        },
        attributes: ['email', 'username']
      });

      if (crmUsers && crmUsers.length > 0) {
        const link = `${process.env.BASE_URL}/sales/leads/${encodeURIComponent(ticketId)}`;

        // build lead snapshot that tplAssigned expects (you can pass whole leadSnapshot too)
        const snapshotForEmail = {
          ticketId: leadSnapshot.ticketId,
          company: leadSnapshot.company,
          contactName: leadSnapshot.contactName,
          mobile: leadSnapshot.mobile,
          email: leadSnapshot.email,
          outcomeStatus: leadSnapshot.outcomeStatus,
          nextFollowUpOn: leadSnapshot.nextFollowUpOn,
          outcomeNotes: leadSnapshot.outcomeNotes !== '' ? leadSnapshot.outcomeNotes : leadSnapshot.outcomeNotes,
        };

        await Promise.allSettled(
          crmUsers.map(user => {
            if (!user.email) {
              console.warn("Skipping CRM without email:", user.username);
              return Promise.resolve();
            }

            const { subject, html, text } = tplAssigned({
              lead: snapshotForEmail,
              assigneeName: user.username,
              roleLabel: 'CRM',
              link
            });

            return sendMail({ to: user.email, subject, html, text })
              .then(() => console.log(`Email sent to CRM: ${user.username}`))
              .catch(err => console.error(`Failed to email CRM ${user.username}:`, err));
          })
        );
        console.log("Email sent successfully.");
      } else {
        console.warn('CRM user not found or has no email.');
      }
    }
    else if (leadSnapshot && leadSnapshot.outcomeStatus === "RESCHEDULE_MEETING" && leadSnapshot.stage === 'MEETING') {
      const assignedIdentifier = meetingAssignee;
      // find the user by username (or id) — try both if you allow either
      const user = await db.User.findOne({
        where: {
          username: assignedIdentifier
        },
        attributes: ['email', 'username']
      });

      if (user && user.email) {
        const link = `${process.env.BASE_URL}/sales/leads/${encodeURIComponent(ticketId)}`;

        const snapshotForEmail = {
          ticketId: leadSnapshot.ticketId,
          company: leadSnapshot.company,
          contactName: leadSnapshot.contactName,
          mobile: leadSnapshot.mobile,
          email: leadSnapshot.email,
          approverRemark: leadSnapshot.approverRemark,
          researchDate: leadSnapshot.researchDate,
          region: leadSnapshot.region,
          estimatedBudget: leadSnapshot.estimatedBudget,
          // meeting fields could also be included if present
          meetingType: leadSnapshot.meetingType,
          meetingDateTime: leadSnapshot.meetingDateTime,
          meetingAssignee: leadSnapshot.meetingAssignee,
        };

        const { subject, html, text } = tplAssigned({
          lead: snapshotForEmail,
          assigneeName: user.username,
          roleLabel: 'EXECUTIVE',
          link
        });

        sendMail({
          to: user.email,
          subject,
          html,
          text
        }).catch(err => console.error("Failed to email EXECUTIVE: ", err));

        console.log("Email sent successfully.");
      } else {
        console.warn("EXECUTIVE user not found or has no email: ", assignedIdentifier);
      }

    }


    res.json({ ok: true });
  } catch (e) { next(e); }
}
