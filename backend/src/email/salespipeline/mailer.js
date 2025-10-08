import dotenv from 'dotenv';
import sgMail from '@sendgrid/mail';

dotenv.config();

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM = process.env.SENDGRID_VERIFIED_SENDER;

if (!SENDGRID_API_KEY) {
  console.error('Missing SENDGRID_API_KEY in environment');
}
if (!FROM) {
  console.error('Missing SENDGRID_VERIFIED_SENDER in environment (verify this sender in SendGrid)');
}

sgMail.setApiKey(SENDGRID_API_KEY);

// Optional: enable EU data residency if required by your account
if ((process.env.SENDGRID_DATA_RESIDENCY || '').toLowerCase() === 'eu') {
  try {
    if (typeof sgMail.setDataResidency === 'function') {
      sgMail.setDataResidency('eu');
    } else {
      console.warn('sgMail.setDataResidency not available on this SDK version — ignoring');
    }
  } catch (e) {
    console.warn('Failed to set data residency:', e?.message || e);
  }
}

/**
 * sendMail({ to, subject, text, html })
 * Same signature as your nodemailer function.
 * - to: string or array of email addresses
 * - subject: string
 * - text: plain text fallback
 * - html: html body
 */
export async function sendMail({ to, subject, text, html }) {
  if (!SENDGRID_API_KEY) {
    throw new Error('SENDGRID_API_KEY not configured');
  }
  if (!FROM) {
    throw new Error('SENDGRID_VERIFIED_SENDER not configured/verified in SendGrid');
  }

  const toList = Array.isArray(to) ? to : (typeof to === 'string' ? [to] : []);
  if (toList.length === 0) throw new Error('No recipients provided');

  const msg = {
    from: FROM,
    to: toList,
    subject: subject,
    text: text,
    html: html,
  };

  try {
    const res = await sgMail.send(msg);
    // sgMail.send may return an array (per recipient) in some SDK versions
    if (Array.isArray(res) && res[0] && res[0].statusCode) {
      console.log('SendGrid response status:', res[0].statusCode);
    } else if (res && res.statusCode) {
      console.log('SendGrid response status:', res.statusCode);
    } else {
      console.log('SendGrid send response:', Array.isArray(res) ? res.length : res);
    }
    return res;
  } catch (err) {
    // Provide the detailed SendGrid response body if available
    console.error('sendMail SendGrid error:', err?.response?.body ?? err);
    throw err;
  }
}


export function tplNewResearch({ lead = {}, assigneeName = '', link }) {
  // small utilities
  const esc = (v) => (v == null ? '' : String(v));
  const escHtml = (v) => esc(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const fmtDate = (d) => {
    if (!d) return '-';
    const dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt)) return '-';
    // Use en-IN to get DD/MM/YYYY ordering
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  };

  // derive financial period display (YYYY-MM)
  const fmtFinancialPeriod = (leadObj) => {

    const y = leadObj.financialPeriodYear ?? null;
    const m2 = leadObj.financialPeriodMonth ?? null;
    if (y && m2) {
      const mm = String(m2).padStart(2, '0');
      return `${mm}-${y}`;
    }
    return '-';
  };

  // prefer values from lead object (if passed), fallback to fields
  const ticketId = escHtml(lead.ticketId || lead.ticket_id || '');
  const company = escHtml(lead.company || '');
  const contactName = escHtml(lead.contactName || lead.contact_name || '');
  const researchDate = fmtDate(lead.researchDate || '');
  const mobile = esc(lead.mobile || '');
  const email = escHtml(lead.email || '');
  const region = escHtml(lead.region || '');
  const estimatedBudget = (lead.estimatedBudget != null) ? esc(String(lead.estimatedBudget)) : '-';
  const requirements = escHtml(lead.requirements || '');
  const remarks = escHtml(lead.remarks || '');
  const researchType = String(lead.researchType || 'GENERAL').toUpperCase();

  const tenderOpening = fmtDate(lead.tenderOpeningDate || '');
  const tenderClosing = fmtDate(lead.tenderClosingDate || '');
  const financialPeriod = fmtFinancialPeriod(lead);

  const greeting = assigneeName ? `Hello ${escHtml(assigneeName)},` : 'Hello Sales Coordinator,';
  const subject = `New Research: ${ticketId} — ${company || '-'}`;

  // build table rows for HTML and plain text lines for text version
  const rows = []; // { label, htmlValue, textValue }

  // always include these general fields
  rows.push({
    label: 'Ticket',
    htmlValue: `<span style="font-family:monospace;color:#0b4a8a;">${ticketId}</span>`,
    textValue: `Ticket: ${ticketId || '-'}`,
  });
  rows.push({ label: 'Company', htmlValue: company || '-', textValue: `Company: ${company || '-'}` });
  rows.push({ label: 'Research Date', htmlValue: researchDate, textValue: `Research Date: ${researchDate}` });
  rows.push({ label: 'Contact', htmlValue: contactName || '-', textValue: `Contact: ${contactName || '-'}` });
  rows.push({
    label: 'Mobile',
    htmlValue: mobile ? `<a href="tel:${(mobile || '').replace(/[^+\\d]/g, '')}" style="color:#0b4a8a;text-decoration:none;font-weight:600;">${escHtml(mobile)}</a>` : '-',
    textValue: `Mobile: ${mobile || '-'}`,
  });
  rows.push({
    label: 'Email',
    htmlValue: email ? `<a href="mailto:${email}" style="color:#0b4a8a;text-decoration:none;">${email}</a>` : '-',
    textValue: `Email: ${email || '-'}`,
  });
  rows.push({ label: 'Region', htmlValue: region || '-', textValue: `Region: ${region || '-'}` });
  rows.push({ label: 'Est. Budget', htmlValue: estimatedBudget, textValue: `Est. Budget: ${estimatedBudget}` });

  // include requirements & remarks for both types if present (but keep them last for GENERAL)
  // for TENDER we'll include them after tender-specific rows
  if (researchType === 'TENDER') {
    // tender-specific rows
    rows.push({ label: 'Tender Opening', htmlValue: tenderOpening, textValue: `Tender Opening: ${tenderOpening}` });
    rows.push({ label: 'Tender Closing', htmlValue: tenderClosing, textValue: `Tender Closing: ${tenderClosing}` });
    rows.push({ label: 'Financial Period', htmlValue: escHtml(financialPeriod), textValue: `Financial Period: ${financialPeriod}` });
    rows.push({ label: 'Requirements', htmlValue: requirements || '-', textValue: `Requirements: ${lead.requirements ?? '-'}` });
    rows.push({ label: 'Remarks', htmlValue: remarks || '-', textValue: `Remarks: ${lead.remarks ?? '-'}` });
  } else {
    // GENERAL: requirements and remarks included already in the end
    rows.push({ label: 'Requirements', htmlValue: requirements || '-', textValue: `Requirements: ${lead.requirements ?? '-'}` });
    rows.push({ label: 'Remarks', htmlValue: remarks || '-', textValue: `Remarks: ${lead.remarks ?? '-'}` });
  }

  // Build HTML table rows markup
  const tableRowsHtml = rows.map(r => `<tr><td style="padding:8px 6px;font-weight:600;width:160px;">${escHtml(r.label)}</td><td style="padding:8px 6px;">${r.htmlValue}</td></tr>`).join('\n');


  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial; color:#111827; line-height:1.45;">
      <h2 style="margin:0 0 8px;font-size:18px;color:#0b4a8a;">New Research Submitted (${escHtml(researchType)})</h2>

      <p style="margin:0 0 12px;">${greeting}</p>

      <p style="margin:0 0 14px;color:#374151;">
        A new research entry has been submitted and is awaiting your review and approval. See the key details below.
      </p>

      <div style="border:1px solid #e6e9ee;border-radius:8px;padding:12px;background:#fff;max-width:680px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#111827;">
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
      </div>

      <div style="margin-top:14px;">
        <a href="${escHtml(link)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 16px;border-radius:8px;background:linear-gradient(90deg,#0b4a8a,#6c5ce7);color:#fff;text-decoration:none;font-weight:600;">Open Lead & Review</a>
      </div>

      <p style="margin:18px 0 0;color:#6b7280;font-size:13px;">This is an automated notification from Sales Pipeline.</p>
    </div>
  `;

  // plain-text version
  const textLines = [
    `New Research: ${ticketId}`,
    `Type: ${researchType}`,
    `Company: ${company || '-'}`,
    `Research Date: ${researchDate}`,
    `Contact: ${contactName || '-'}`,
    `Mobile: ${mobile || '-'}`,
    `Email: ${email || '-'}`,
    `Region: ${region || '-'}`,
    `Est. Budget: ${estimatedBudget}`,
  ];

  if (researchType === 'TENDER') {
    textLines.push(`Tender Opening: ${tenderOpening}`);
    textLines.push(`Tender Closing: ${tenderClosing}`);
    textLines.push(`Financial Period: ${financialPeriod}`);
  }

  textLines.push(`Requirements: ${lead.requirements ?? '-'}`);
  textLines.push(`Remarks: ${lead.remarks ?? '-'}`);
  textLines.push('');
  textLines.push(`Open: ${link}`);

  return { subject, html, text: textLines.join('\n') };
}


export function tplAssigned({ lead = {}, assigneeName, roleLabel, link }) {
  const role = String(roleLabel || '').trim().toUpperCase();

  // small utilities
  const esc = (v) => (v == null ? '' : String(v));
  const escHtml = (v) => esc(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // helper date formatting (date-only or datetime)
  const fmtDate = (d) => {
    if (!d) return '-';
    const dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt)) return '-';
    return dt.toLocaleDateString('en-IN');
  };
  const fmtDateTime = (d) => {
    if (!d) return '-';
    const dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt)) return '-';
    return dt.toLocaleString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
  };

  // extract from lead (snapshot fields)
  const ticketId = escHtml(lead.ticketId || lead.ticket_id || '');
  const company = escHtml(lead.company || '');
  const approverRemark = escHtml(lead.approverRemark || lead.approver_remark || '');
  const researchDate = fmtDate(lead.researchDate || lead.research_date);
  const contactName = escHtml(lead.contactName || lead.contact_name || '');
  const mobile = esc(lead.mobile || '');
  const email = escHtml(lead.email || '');
  const region = escHtml(lead.region || '');
  const estimatedBudget = (lead.estimatedBudget != null) ? esc(String(lead.estimatedBudget)) : '-';

  const meetingType = escHtml(lead.meetingType || lead.meeting_type || '');
  const location = escHtml(lead.location || '');
  const meetingDateTime = fmtDateTime(lead.meetingDateTime || lead.meeting_datetime);
  const meetingAssignee = escHtml(lead.meetingAssignee || lead.meeting_assignee || '');
  const outcomeNotes = escHtml(lead.outcomeNotes || lead.outcome_notes || '');
  const outcomeStatus = escHtml(lead.outcomeStatus || lead.outcome_status || '');
  const nextFollowUpOn = fmtDate(lead.nextFollowUpOn || lead.next_follow_up_on);

  const subject = `Action required: ${roleLabel || 'Assignee'} assigned for ${ticketId || escHtml(lead.ticketId || '')}`;

  // TELECALLER template
  if (role === 'TELECALLER') {
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial; color:#111827; line-height:1.45;">
        <h2 style="margin:0 0 8px;font-size:18px;color:#0b4a8a;">New Tele-call Assignment</h2>
        <p style="margin:0 0 12px;">Hello ${escHtml(assigneeName || '')},</p>
        <p style="margin:0 0 14px;color:#374151;">You have been assigned a tele-call. Please contact the prospect and update the lead after the call.</p>

        <div style="border:1px solid #e6e9ee;border-radius:8px;padding:12px;background:#fff;max-width:600px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;color:#111827;">
            <tbody>
              <tr><td style="padding:8px 6px;font-weight:600;width:170px;">Ticket</td><td style="padding:8px 6px;font-family:monospace;color:#0b4a8a;">${ticketId}</td></tr>
              <tr><td style="padding:8px 6px;font-weight:600;">Company</td><td style="padding:8px 6px;">${company}</td></tr>
              <tr><td style="padding:8px 6px;font-weight:600;">Research Date</td><td style="padding:8px 6px;">${researchDate}</td></tr>
              <tr><td style="padding:8px 6px;font-weight:600;">Contact</td><td style="padding:8px 6px;">${contactName}</td></tr>
              <tr><td style="padding:8px 6px;font-weight:600;">Mobile</td><td style="padding:8px 6px;">${mobile ? `<a href="tel:${encodeURIComponent(mobile)}" style="color:#0b4a8a;text-decoration:none;font-weight:600;">${escHtml(mobile)}</a>` : '-'}</td></tr>
              <tr><td style="padding:8px 6px;font-weight:600;">Email</td><td style="padding:8px 6px;">${email ? `<a href="mailto:${email}" style="color:#0b4a8a;text-decoration:none;">${email}</a>` : '-'}</td></tr>
              <tr><td style="padding:8px 6px;font-weight:600;">Region</td><td style="padding:8px 6px;">${region}</td></tr>
              <tr><td style="padding:8px 6px;font-weight:600;">Estimated Budget</td><td style="padding:8px 6px;">${estimatedBudget}</td></tr>
              ${approverRemark ? `<tr><td style="padding:8px 6px;font-weight:600;vertical-align:top;">Approver Remark</td><td style="padding:8px 6px;">${approverRemark}</td></tr>` : ''}
            </tbody>
          </table>
        </div>

        <div style="margin-top:14px;">
          <a href="${link}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#0b4a8a;color:#fff;text-decoration:none;font-weight:600;">Open Lead & Update</a>
          ${mobile ? `&nbsp;&nbsp;<a href="tel:${encodeURIComponent(mobile)}" style="display:inline-block;padding:8px 12px;border-radius:8px;border:1px solid #e6e9ee;background:#fff;color:#0b4a8a;text-decoration:none;font-weight:600;">Call Now</a>` : ''}
        </div>

        <p style="margin:18px 0 0;color:#6b7280;font-size:13px;">Automated message from Sales Pipeline.</p>
      </div>
    `;

    const text = [
      `New Tele-call Assignment: ${ticketId}`,
      `Company: ${company}`,
      `Research Date: ${researchDate}`,
      `Contact: ${contactName}`,
      `Mobile: ${mobile}`,
      `Email: ${email}`,
      `Region: ${region}`,
      `Estimated Budget: ${estimatedBudget}`,
      approverRemark ? `Approver Remark: ${approverRemark}` : '',
      '',
      `Open: ${link}`
    ].filter(Boolean).join('\n');

    return { subject, html, text };
  }

  // MEETING / EXECUTIVE template (telecaller details + meeting specifics)
  if (role === 'EXECUTIVE') {
    const isMeetingTypeVisit = meetingType === 'VISIT';
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#111827;line-height:1.45;">
        <h2 style="margin:0 0 8px;font-size:18px;color:#0b4a8a;">New Meeting Assigned</h2>
        <p style="margin:0 0 12px;">Hello ${escHtml(assigneeName || '')},</p>
        <p style="margin:0 0 14px;color:#374151;">You have been assigned a meeting. Please review the details and follow up.</p>

        <div style="border:1px solid #e6e9ee;border-radius:8px;padding:12px;background:#fff;max-width:680px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;color:#111827;">
            <tbody>
              <tr><td style="padding:8px 6px;font-weight:600;width:170px;">Ticket</td><td style="padding:8px 6px;font-family:monospace;color:#0b4a8a;">${ticketId}</td></tr>
              <tr><td style="padding:8px 6px;font-weight:600;">Company</td><td style="padding:8px 6px;">${company}</td></tr>
              <tr><td style="padding:8px 6px;font-weight:600;">Contact</td><td style="padding:8px 6px;">${contactName}</td></tr>
              <tr><td style="padding:8px 6px;font-weight:600;">Mobile</td><td style="padding:8px 6px;">${mobile ? `<a href="tel:${encodeURIComponent(mobile)}" style="color:#0b4a8a;text-decoration:none;">${escHtml(mobile)}</a>` : '-'}</td></tr>
              <tr><td style="padding:8px 6px;font-weight:600;">Email</td><td style="padding:8px 6px;">${email ? `<a href="mailto:${email}" style="color:#0b4a8a;text-decoration:none;">${email}</a>` : '-'}</td></tr>
              <tr><td style="padding:8px 6px;font-weight:600;">Meeting Type</td><td style="padding:8px 6px;">${meetingType}</td></tr>
              ${isMeetingTypeVisit ? `<tr><td style="padding:8px 6px;font-weight:600;">Location</td><td style="padding:8px 6px;">${location || '-'}</td></tr>` : ''}
              <tr><td style="padding:8px 6px;font-weight:600;">Meeting Date & Time</td><td style="padding:8px 6px;">${meetingDateTime}</td></tr>
              <tr><td style="padding:8px 6px;font-weight:600;">Meeting Assignee</td><td style="padding:8px 6px;">${meetingAssignee || '-'}</td></tr>
              ${approverRemark ? `<tr><td style="padding:8px 6px;font-weight:600;vertical-align:top;">Approver Remark</td><td style="padding:8px 6px;">${approverRemark}</td></tr>` : ''}
            </tbody>
          </table>
        </div>

        <div style="margin-top:14px;">
          <a href="${link}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#0b4a8a;color:#fff;text-decoration:none;font-weight:600;">Open Lead & Manage</a>
        </div>

        <p style="margin:18px 0 0;color:#6b7280;font-size:13px;">Automated message from Sales Pipeline.</p>
      </div>
    `;

    const text = [
      `New Meeting Assigned: ${ticketId}`,
      `Company: ${company}`,
      `Contact: ${contactName}`,
      `Mobile: ${mobile}`,
      `Email: ${email}`,
      `Meeting Type: ${meetingType}`,
      `Location: ${location}`,
      `Meeting DateTime: ${meetingDateTime}`,
      `Meeting Assignee: ${meetingAssignee || '-'}`,
      approverRemark ? `Approver Remark: ${approverRemark}` : '',
      '',
      `Open: ${link}`
    ].filter(Boolean).join('\n');

    return { subject, html, text };
  }

  // CRM template (contact details + meeting outcome)
  if (role === 'CRM') {
    const html = `
      <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial;color:#111827;line-height:1.45;">
        <h2 style="margin:0 0 8px;font-size:18px;color:#0b4a8a;">CRM Action Assigned</h2>
        <p style="margin:0 0 12px;">Hello ${escHtml(assigneeName || '')},</p>
        <p style="margin:0 0 14px;color:#374151;">Please follow up with the prospect and update the CRM details.</p>

        <div style="border:1px solid #e6e9ee;border-radius:8px;padding:12px;background:#fff;max-width:700px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;color:#111827;">
            <tbody>
              <tr><td style="padding:8px 6px;font-weight:600;width:160px;">Ticket</td><td style="padding:8px 6px;color:#0b4a8a;font-family:monospace;">${ticketId}</td></tr>
              <tr><td style="padding:8px 6px;font-weight:600;">Company</td><td style="padding:8px 6px;">${company}</td></tr>
              <tr><td style="padding:8px 6px;font-weight:600;">Contact</td><td style="padding:8px 6px;">${contactName}</td></tr>
              <tr><td style="padding:8px 6px;font-weight:600;">Mobile</td><td style="padding:8px 6px;">${mobile ? `<a href="tel:${encodeURIComponent(mobile)}" style="color:#0b4a8a;text-decoration:none;">${escHtml(mobile)}</a>` : '-'}</td></tr>
              <tr><td style="padding:8px 6px;font-weight:600;">Email</td><td style="padding:8px 6px;">${email ? `<a href="mailto:${email}" style="color:#0b4a8a;text-decoration:none;">${email}</a>` : '-'}</td></tr>
              <tr><td style="padding:8px 6px;font-weight:600;">Outcome Status</td><td style="padding:8px 6px;">${outcomeStatus || '-'}</td></tr>
              <tr><td style="padding:8px 6px;font-weight:600;">Next Follow-up</td><td style="padding:8px 6px;">${nextFollowUpOn}</td></tr>
              ${outcomeNotes ? `<tr><td style="padding:8px 6px;font-weight:600;vertical-align:top;">Outcome Notes</td><td style="padding:8px 6px;">${outcomeNotes}</td></tr>` : ''}
            </tbody>
          </table>
        </div>

        <div style="margin-top:14px;">
          <a href="${link}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#0b4a8a;color:#fff;text-decoration:none;font-weight:600;">Open Lead & Update CRM</a>
        </div>

        <p style="margin:18px 0 0;color:#6b7280;font-size:13px;">Automated message from Sales Pipeline.</p>
      </div>
    `;

    const text = [
      `CRM Action Assigned: ${ticketId}`,
      `Company: ${company}`,
      `Contact: ${contactName}`,
      `Mobile: ${mobile}`,
      `Email: ${email}`,
      `Outcome Status: ${outcomeStatus || '-'}`,
      `Next Follow-up: ${nextFollowUpOn}`,
      outcomeNotes ? `Outcome Notes: ${outcomeNotes}` : '',
      '',
      `Open: ${link}`
    ].filter(Boolean).join('\n');

    return { subject, html, text };
  }

  // default generic
  const html = `
    <p>Hello ${escHtml(assigneeName || '')},</p>
    <p>You have been assigned a next action for the following lead:</p>
    <ul>
      <li><strong>Ticket</strong>: ${ticketId}</li>
      <li><strong>Company</strong>: ${company}</li>
    </ul>
    <p><a href="${link}" target="_blank" rel="noopener noreferrer">Open lead</a></p>
    <p>Regards,<br/>Sales Pipeline</p>
  `;

  const text = `${subject}\nCompany: ${company}\nLink: ${link}`;

  return { subject, html, text };
}
