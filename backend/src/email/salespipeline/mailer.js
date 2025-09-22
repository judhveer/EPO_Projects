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


export function tplNewResearch({ ticketId, company, contactName, researchDate, link }) {
    const subj = `New Research: ${ticketId} - ${company}`;
    const html = `
    <p>Hello,</p>
    <p>A new research entry has been submitted:</p>
    <ul>
      <li><strong>Ticket</strong>: ${ticketId}</li>
      <li><strong>Company</strong>: ${company}</li>
      <li><strong>Contact</strong>: ${contactName}</li>
      <li><strong>Research Date</strong>: ${researchDate || '-'}</li>
    </ul>
    <p><a href="${link}" target="_blank">Open lead</a></p>
    <p>Regards,<br/>Sales Pipeline</p>
  `;
    return { subject: subj, html, text: `${subj}\nCompany: ${company}\nContact: ${contactName}\nLink: ${link}` };
}

export function tplAssigned({ ticketId, company, assigneeName, roleLabel, link }) {
    const subj = `Action required: ${roleLabel} assigned for ${ticketId}`;
    const html = `
    <p>Hello ${assigneeName || ''},</p>
    <p>You have been assigned a next action for the following lead:</p>
    <ul>
      <li><strong>Ticket</strong>: ${ticketId}</li>
      <li><strong>Company</strong>: ${company}</li>
    </ul>
    <p><a href="${link}" target="_blank">Open lead</a></p>
    <p>Regards,<br/>Sales Pipeline</p>
  `;
    return { subject: subj, html, text: `${subj}\nCompany: ${company}\nLink: ${link}` };
}