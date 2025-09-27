// email/sendReport.js
import nodemailer from 'nodemailer';
import path from 'path';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

export async function sendWeeklyAttendanceReport({ to, subject, html, attachmentPath }) {
  console.log("sending Attendance report.......");
  const mailOptions = {
    from: `"EPO Attendance System" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
    attachments: attachmentPath ? [{
      filename: path.basename(attachmentPath),
      path: attachmentPath,
    }] : [],
  };
  const info = await transporter.sendMail(mailOptions);
  return info;
}
