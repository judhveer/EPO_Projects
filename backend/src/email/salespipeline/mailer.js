import nodemailer from 'nodemailer';
import path from 'path';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

export async function sendMail({ to, subject, text, html }) {
  if (!transporter) {
    throw new Error('SMTP transporter not configured');
  }

  const mailOptions = {
    from: `"EPO Sales Team" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
    html,
  };
  const info = await transporter.sendMail(mailOptions);
  return info;
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
    return dt.toLocaleDateString('en-GB');
  };

  // prefer values from lead object (if passed), fallback to fields
  const ticketId = escHtml(lead.ticketId || lead.ticket_id || '');
  const company = escHtml(lead.company || '');
  const contactName = escHtml(lead.contactName || lead.contact_name || '');
  const researchDate = fmtDate(lead.researchDate || lead.research_date || lead.researchDateRaw || '');
  const mobile = esc(lead.mobile || '');
  const email = escHtml(lead.email || '');
  const region = escHtml(lead.region || '');
  const estimatedBudget = (lead.estimatedBudget != null) ? esc(String(lead.estimatedBudget)) : '-';

  const greeting = assigneeName ? `Hello ${escHtml(assigneeName)},` : 'Hello Sales Coordinator,';

  const subject = `New Research: ${ticketId} — ${company || '-'}`;

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial; color:#111827; line-height:1.45;">
      <h2 style="margin:0 0 8px;font-size:18px;color:#0b4a8a;">New Research Submitted</h2>

      <p style="margin:0 0 12px;">${greeting}</p>

      <p style="margin:0 0 14px;color:#374151;">
        A new research entry has been submitted and is awaiting your review and approval. See the key details below.
      </p>

      <div style="border:1px solid #e6e9ee;border-radius:8px;padding:12px;background:#fff;max-width:680px;">
        <table style="width:100%;border-collapse:collapse;font-size:14px;color:#111827;">
          <tbody>
            <tr><td style="padding:8px 6px;font-weight:600;width:160px;">Ticket</td><td style="padding:8px 6px;font-family:monospace;color:#0b4a8a;">${ticketId}</td></tr>
            <tr><td style="padding:8px 6px;font-weight:600;">Company</td><td style="padding:8px 6px;">${company}</td></tr>
            <tr><td style="padding:8px 6px;font-weight:600;">Research Date</td><td style="padding:8px 6px;">${researchDate}</td></tr>
            <tr><td style="padding:8px 6px;font-weight:600;">Contact</td><td style="padding:8px 6px;">${contactName}</td></tr>
            <tr><td style="padding:8px 6px;font-weight:600;">Mobile</td><td style="padding:8px 6px;">${mobile ? `<a href="tel:${(mobile || '').replace(/[^+\\d]/g, '')}" style="color:#0b4a8a;text-decoration:none;font-weight:600;">${escHtml(mobile)}</a>` : '-'}</td></tr>
            <tr><td style="padding:8px 6px;font-weight:600;">Email</td><td style="padding:8px 6px;">${email ? `<a href="mailto:${email}" style="color:#0b4a8a;text-decoration:none;">${email}</a>` : '-'}</td></tr>
            <tr><td style="padding:8px 6px;font-weight:600;">Region</td><td style="padding:8px 6px;">${region}</td></tr>
            <tr><td style="padding:8px 6px;font-weight:600;">Est. Budget</td><td style="padding:8px 6px;">${estimatedBudget}</td></tr>
          </tbody>
        </table>
      </div>

      <div style="margin-top:14px;">
        <a href="${link}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 16px;border-radius:8px;background:linear-gradient(90deg,#0b4a8a,#6c5ce7);color:#fff;text-decoration:none;font-weight:600;">Open Lead & Review</a>
      </div>

      <p style="margin:18px 0 0;color:#6b7280;font-size:13px;">This is an automated notification from Sales Pipeline.</p>
    </div>
  `;

  const textLines = [
    `New Research: ${ticketId}`,
    `Company: ${company}`,
    `Research Date: ${researchDate}`,
    `Contact: ${contactName}`,
    `Mobile: ${mobile}`,
    `Email: ${email}`,
    `Region: ${region}`,
    `Est. Budget: ${estimatedBudget}`,
    '',
    `Open: ${link}`
  ].filter(Boolean);

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
    return dt.toLocaleDateString('en-GB');
  };
  const fmtDateTime = (d) => {
    if (!d) return '-';
    const dt = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dt)) return '-';
    return dt.toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
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
