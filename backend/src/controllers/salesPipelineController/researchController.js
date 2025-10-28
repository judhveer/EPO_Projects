import db from '../../models/index.js';
import dotenv from 'dotenv';
dotenv.config();
import { ensureLead, transitionStage, generateNextTicketId } from '../../services/salesPipeline/leadService.js';
import {  tplNewResearch } from '../../email/salespipeline/template.js';
import { sendMail } from "../../email/sendMail.js"
import { Op } from 'sequelize';

// Create a new research entry, and update the parent lead's snapshot + stage
export async function createResearch(req, res, next) {
  console.log("create Research called:");
  try {
    // Accept new fields: researchType, tenderOpeningDate, tenderClosingDate, financialPeriod (YYYY-MM)
    let {
      ticketId,
      researchType = 'GENERAL',
      researchDate,
      company,
      contactName,
      mobile,
      email,
      region,
      estimatedBudget,
      createdBy,
      tenderOpeningDate,
      tenderClosingDate,
      financialPeriod, // expected 'YYYY-MM' from frontend month picker,
      requirements,
      remarks
    } = req.body;


    // basic required fields
    if (!company || !contactName || !mobile) {
      return res.status(400).json({ error: 'company, contactName, mobile are required' });
    }

    // If TENDER type, require tender fields + financialPeriod
    const isTender = String(researchType || '').toUpperCase() === 'TENDER';
    if (isTender) {
      if (!tenderOpeningDate || !tenderClosingDate) {
        return res.status(400).json({ error: 'Tender opening and closing dates are required for TENDER research type.' });
      }
      if (!financialPeriod) {
        return res.status(400).json({ error: 'financialPeriod (YYYY-MM) is required for TENDER research type.' });
      }
    }


    if (createdBy === null || createdBy === undefined) {
      const user = req.user;
      createdBy = user?.username ?? 'unknown';
    }

    // parse estimatedBudget into number or null
    const eb = (estimatedBudget === null || estimatedBudget === undefined || estimatedBudget === '') ? null : Number(estimatedBudget);
    const estimatedBudgetVal = Number.isFinite(eb) ? eb : null;

    // parse financialPeriod (YYYY-MM or YYYY-MM-DD) into month/year integers
    let financialPeriodMonth = null;
    let financialPeriodYear = null;
    if (financialPeriod) {
      // accepted formats: 'YYYY-MM' or 'YYYY-MM-DD'
      const fp = String(financialPeriod).trim();
      const m1 = fp.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
      if (m1) {
        financialPeriodYear = parseInt(m1[1], 10);
        financialPeriodMonth = parseInt(m1[2], 10);
        if (Number.isNaN(financialPeriodYear) || Number.isNaN(financialPeriodMonth) || financialPeriodMonth < 1 || financialPeriodMonth > 12) {
          return res.status(400).json({ error: 'Invalid financialPeriod format. Expect YYYY-MM.' });
        }
      } else {
        return res.status(400).json({ error: 'Invalid financialPeriod format. Expect YYYY-MM.' });
      }
    }

    // parse tender dates into Date only for validation (if present)
    if (isTender && tenderOpeningDate && tenderClosingDate) {
      const openD = new Date(tenderOpeningDate);
      const closeD = new Date(tenderClosingDate);
      if (isNaN(openD.getTime()) || isNaN(closeD.getTime())) {
        return res.status(400).json({ error: 'Invalid tenderOpeningDate or tenderClosingDate' });
      }
      if (openD > closeD) {
        return res.status(400).json({ error: 'Tender Opening Date must be on or before Tender Closing Date' });
      }
    }


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

      // 2) Insert research entry with new fields
      await db.ResearchEntry.create({
        ticketId: finalTicketId,
        researchType: String(researchType).toUpperCase(),
        researchDate: researchDate ? new Date(researchDate) : null,
        company,
        contactName,
        mobile,
        email,
        region,
        estimatedBudget: estimatedBudgetVal,
        requirements,
        remarks,
        // tender-specific fields
        tenderOpeningDate: tenderOpeningDate ? tenderOpeningDate : null,
        tenderClosingDate: tenderClosingDate ? tenderClosingDate : null,
        financialPeriodMonth,
        financialPeriodYear,
        createdBy: createdBy || 'research',
      }, { transaction: t });

      // 3) Update snapshot + stage
      lead.set({
        researchType: String(researchType).toUpperCase(),
        researchDate: researchDate ? new Date(researchDate) : lead.researchDate,
        company,
        contactName,
        mobile,
        email,
        region,
        estimatedBudget: estimatedBudgetVal ?? lead.estimatedBudget,
        approveStatus: 'PENDING',
        clientStatus: 'OPEN',
        tenderOpeningDate,
        tenderClosingDate,
        financialPeriodMonth,
        financialPeriodYear,
        requirements,
        remarks
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

          const link = `${process.env.LEADS_URL}/sales/leads/${encodeURIComponent(finalTicketId)}`;

          // prepare a basic lead snapshot (tplNewResearch accepts lead object)
          const leadSnapshot = {
            ticketId: finalTicketId,
            researchType,
            company,
            contactName,
            researchDate,
            mobile,
            email,
            region,
            estimatedBudget: estimatedBudgetVal,
            researchType: String(researchType).toUpperCase(),
            tenderOpeningDate: tenderOpeningDate || null,
            tenderClosingDate: tenderClosingDate || null,
            financialPeriodMonth,
            financialPeriodYear,
            requirements,
            remarks
          };

          const tasks = coordinators.map((coord) => {
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
              console.log('Email task fulfilled for', u.username, r.value);
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
  } catch (e) {
    return next(e);
  }
}

