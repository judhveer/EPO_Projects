import db from '../../models/index.js';
import dotenv from 'dotenv';
dotenv.config();
import { transitionStage } from '../../services/salesPipeline/leadService.js';
import { stageMismatch } from '../../middlewares/salesPipeline/error.js';

import { sendMail, tplAssigned } from '../../email/salespipeline/mailer.js';

export async function createApproval(req, res, next) {
  const { ticketId, approveStatus, approverRemark, telecallerAssignedTo, approvedBy } = req.body;
  if (!ticketId || !approveStatus) {
    return res.status(400).json({
      error: 'ticketId, approveStatus required'
    });
  }

  // we'll populate this inside the transaction and use it after commit
  let leadSnapshot = null;

  try {

    let approvedByName = null;

    if (approvedBy === null || approvedBy === undefined) {
      const user = req.user;
      approvedByName = user.username;
    }

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
        approvedBy: approvedBy || approvedByName || 'coordinator'
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

      // capture a plain snapshot to use after transaction completes
      leadSnapshot = lead.get({ plain: true });
    });

    // If telecaller was assigned AND the new state is TELECALL, notify the telecaller
    if (leadSnapshot && leadSnapshot.telecallerAssignedTo && leadSnapshot.stage === 'TELECALL') {
      const assignedIdentifier = leadSnapshot.telecallerAssignedTo;

      // find the user by username (or id) — try both if you allow either
      const user = await db.User.findOne({
        where: {
          username: assignedIdentifier
        },
        attributes: ['email', 'username']
      });

      if (user && user.email) {
        const link = `${process.env.LEADS_URL}/sales/leads/${encodeURIComponent(ticketId)}`;

        // build lead snapshot that tplAssigned expects (you can pass whole leadSnapshot too)
        const snapshotForEmail = {
          ticketId: leadSnapshot.ticketId,
          company: leadSnapshot.company,
          researchDate: leadSnapshot.researchDate,
          contactName: leadSnapshot.contactName,
          mobile: leadSnapshot.mobile,
          email: leadSnapshot.email,
          region: leadSnapshot.region,
          estimatedBudget: leadSnapshot.estimatedBudget,
          approverRemark: leadSnapshot.approverRemark,
        };

        const { subject, html, text } = tplAssigned({
          lead: snapshotForEmail,
          assigneeName: user.username,
          roleLabel: 'TELECALLER',
          link
        });

        // fire-and-forget (non-blocking). In production consider queueing this.
        sendMail({ to: user.email, subject, html, text })
          .catch(err => console.error('Failed to email telecaller:', err));

        console.log("Email sent successfully.");
      } else {
        console.warn('Telecaller user not found or has no email:', assignedIdentifier);
      }
    }

    res.json({ ok: true });
  } catch (e) { next(e); }
}
