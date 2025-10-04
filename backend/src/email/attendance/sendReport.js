// email/sendReport.js
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import sgMail from '@sendgrid/mail';

dotenv.config();

const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const FROM = process.env.SENDGRID_VERIFIED_SENDER;

if (!SENDGRID_API_KEY) {
  console.error('Missing SENDGRID_API_KEY in environment');
  // don't exit here — throw when sending to keep behavior similar to earlier implementation
}

if (!FROM) {
  console.error('Missing SENDGRID_VERIFIED_SENDER in environment (you must verify this sender in SendGrid)');
}

sgMail.setApiKey(SENDGRID_API_KEY);

// optional: use EU data residency endpoint when requested
if ((process.env.SENDGRID_DATA_RESIDENCY || '').toLowerCase() === 'eu') {
  // only enable this if your account/subuser is EU-pinned
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
 * same function name & signature as your nodemailer version
 * @param {{ to: string | string[], subject: string, html: string, attachmentPath?: string }} param0
 */
export async function sendWeeklyAttendanceReport({ to, subject, html, attachmentPath }) {
  console.log('sending Attendance report.......');

  if (!SENDGRID_API_KEY) {
    throw new Error('SENDGRID_API_KEY not configured');
  }
  if (!FROM) {
    throw new Error('SENDGRID_VERIFIED_SENDER not configured/verified');
  }

  // normalize recipients
  const toList = Array.isArray(to) ? to : (typeof to === 'string' ? [to] : []);
  if (toList.length === 0) throw new Error('No recipients provided');

  // Build message
  const msg = {
    from: FROM,
    to: toList,
    subject: subject,
    html: html,
    // you can add cc/bcc as needed
  };

  // attachments (SendGrid expects base64 content)
  if (attachmentPath) {
    try {
      const fileBuf = await fs.readFile(attachmentPath);
      msg.attachments = [
        {
          content: fileBuf.toString('base64'),
          filename: path.basename(attachmentPath),
          type: 'application/octet-stream',
          disposition: 'attachment',
        },
      ];
    } catch (err) {
      console.error('Failed to read attachment', attachmentPath, err);
      throw err;
    }
  }

  try {
    // sgMail.send returns a promise which resolves to an array for each recipient in some SDK versions.
    const response = await sgMail.send(msg);
    // log helpful info
    if (Array.isArray(response) && response[0] && response[0].statusCode) {
      console.log('SendGrid response status:', response[0].statusCode);
    } else if (response && response.statusCode) {
      console.log('SendGrid response status:', response.statusCode);
    } else {
      console.log('SendGrid send responded', Array.isArray(response) ? response.length : response);
    }
    return response;
  } catch (err) {
    // SendGrid surfaces detailed errors in err.response.body
    console.error('sendWeeklyAttendanceReport SendGrid error:', err?.response?.body ?? err);
    // rethrow so callers can catch
    throw err;
  }
}

























// import nodemailer from 'nodemailer';
// import path from 'path';

// const transporter = nodemailer.createTransport({
//   service: 'gmail',
//   auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
// });

// export async function sendWeeklyAttendanceReport({ to, subject, html, attachmentPath }) {
//   console.log("sending Attendance report.......");
//   const mailOptions = {
//     from: `"EPO Attendance System" <${process.env.EMAIL_USER}>`,
//     to,
//     subject,
//     html,
//     attachments: attachmentPath ? [{
//       filename: path.basename(attachmentPath),
//       path: attachmentPath,
//     }] : [],
//   };
//   const info = await transporter.sendMail(mailOptions);
//   return info;
// }
