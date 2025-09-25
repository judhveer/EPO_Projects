import db from '../../models/index.js';
import { transitionStage } from '../../services/salesPipeline/leadService.js';
import { stageMismatch } from '../../middlewares/salesPipeline/error.js';
import { sendMail, tplAssigned } from '../../email/salespipeline/mailer.js';

export async function createTelecall(req, res, next) {
  const { ticketId, meetingType, meetingDateTime, meetingAssignee, createdBy } = req.body;
  if (!ticketId) return res.status(400).json({ error: 'ticketId required' });

  // we'll populate this inside the transaction and use it after commit
  let leadSnapshot = null;

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

      // capture a plain snapshot to use after transaction completes
      leadSnapshot = lead.get({ plain: true });
    });

    if (leadSnapshot && leadSnapshot.meetingAssignee && leadSnapshot.stage === 'MEETING') {
      const assignedIdentifier = leadSnapshot.meetingAssignee;

      // find the user by username (or id) — try both if you allow either
      const user = await db.User.findOne({
        where: {
          username: assignedIdentifier
        },
        attributes: ['email', 'username']
      });

      if (user && user.email) {
        const link = `/sales/leads/${encodeURIComponent(ticketId)}`;

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
      }else{
        console.warn("EXECUTIVE user not found or has no email: ", assignedIdentifier);
      }
    }

    res.json({ ok: true });
  } catch (e) { next(e); }
}
