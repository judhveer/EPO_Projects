// email/sendReport.js
import path from 'path';
import transporter from "../transporter.js";


export async function sendWeeklyAttendanceReport({ to, subject, html, attachmentPath }) {
  console.log('sending Attendance report.......');

  // normalize recipients
  const toList = Array.isArray(to) ? to : (typeof to === 'string' ? [to] : []);
  if (toList.length === 0) throw new Error('No recipients provided');

  const mailOptions = {
    from: `"EPO Attendance System" <${process.env.EMAIL_USER}>`,
    to: toList,
    subject,
    html,
    ...(attachmentPath && {
      attachments: [
        {
          filename: path.basename(attachmentPath),
          path: attachmentPath,
        },
      ],
    }),
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Weekly report sent to ${toList}: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error("❌ Weekly report sending failed:", err.message || err);
    throw err;
  }
}

