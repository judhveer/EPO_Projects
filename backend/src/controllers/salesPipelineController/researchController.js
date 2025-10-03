import db from '../../models/index.js';
import { ensureLead, transitionStage, generateNextTicketId } from '../../services/salesPipeline/leadService.js';
import { sendMail, tplNewResearch } from '../../email/salespipeline/mailer.js';
import { Op } from 'sequelize';
// Create a new research entry, and update the parent lead's snapshot + stage
export async function createResearch(req, res, next) {
  console.log("create Research called:");
  let { ticketId, researchDate, company, contactName, mobile, email, region, estimatedBudget, createdBy } = req.body;
  if (!company || !contactName || !mobile) {
    return res.status(400).json({ error: 'company, contactName, mobile are required' });
  }

  try {
    let finalTicketId = ticketId && ticketId !== 'AUTO' ? String(ticketId).trim() : '';

    if(createdBy === null || createdBy === undefined){
      const user = req.user;
      createdBy = user.username;
    }

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

      // At this point transaction committed successfully.
      // Now notify Sales Coordinators (non-blocking)


      (async () => {
        try {
          const coordinators = await db.User.findAll({
            where: {
              department: "Sales dept",   // adapt casing to your DB
              role: "COORDINATOR"
            },
            attributes: ['email', 'username',],
          });

          if (!coordinators || coordinators.length === 0) {
            console.warn('No sales coordinators found to notify.');
            return;
          }

          const link = `/sales/leads/${encodeURIComponent(finalTicketId)}`;

          // prepare a basic lead snapshot (tplNewResearch accepts lead object)
          const leadSnapshot = {
            ticketId: finalTicketId,
            company,
            contactName,
            researchDate,
            mobile,
            email,
            region,
            estimatedBudget
          };

          const tasks = coordinators.map(coord => {
            if (!coord.email) {
              console.warn('Skipping coordinator with no email:', coord.username);
              return Promise.resolve({ skipped: true, user: coord.username });
            }
            const assigneeName = coord.username || '';
            const { subject, html, text } = tplNewResearch({
              lead: leadSnapshot,
              assigneeName,
              link
            });

            return sendMail({ to: coord.email, subject, html, text })
              .then(info => ({ ok: true, user: assigneeName, info }))
              .catch(err => ({ ok: false, user: assigneeName, error: String(err) }));
          });

          const results = await Promise.allSettled(tasks);
          results.forEach((r, i) => {
            const u = coordinators[i];
            if (r.status === 'fulfilled') {
              console.log('Email task fulfilled for', u.username , r.value);
            } else {
              console.error('Email task rejected for', u.username, r.reason);
            }
          });
        } catch (err) {
          console.error('Notify coordinators failed:', err);
        }
      })();

    });

    res.json({ ok: true, ticketId: finalTicketId, stage: 'APPROVAL' });
  } catch (e) { next(e); }
}

