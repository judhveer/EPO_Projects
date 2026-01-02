// src/utils/mail/sendMail.js
import transporter from "./transporter.js";

/**
 * sendMail({ to, subject, text, html, attachments })
 * - to: string or array
 * - subject: string
 * - text: plain text version
 * - html: HTML body
 * - attachments: optional array of attachments [{ filename, path | content }]
 */
// For Sales Pipeline related emails
export async function sendMail({ to, subject, text, html, attachments = [] }) {
  const toList = Array.isArray(to) ? to.join(", ") : to;
  if (!toList) throw new Error("No recipients provided");
  if (!subject) throw new Error("Subject is required");

  const mailOptions = {
    from: `"Sales Pipeline" <${process.env.EMAIL_USER}>`,
    to: toList,
    subject,
    text,
    html,
    ...(attachments.length > 0 && { attachments }),
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${toList}: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error("❌ Email sending failed:", err.message || err);
    throw err;
  }
}

// For User Creation related emails
export async function sendMailForCreateUser({ to, subject, text, html }) {
  try {
    await transporter.sendMail({
      from: `"EPO ADMIN" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });
    console.log(`📧 Email sent successfully to ${to}`);
  } catch (err) {
    console.error(`❌ Failed to send email to ${to}:`, err.message);
  }
}

// For Reports related emails (Attendance and Telegram Task Bot reports etc)
export async function sendMailForReports({ to, subject, text, html, attachments = [] }) {
  const toList = Array.isArray(to) ? to.join(", ") : to;
  if (!toList) throw new Error("No recipients provided");
  if (!subject) throw new Error("Subject is required");

  const mailOptions = {
    from: `"EPO Automation" <${process.env.EMAIL_USER}>`,
    to: toList,
    subject,
    text,
    html,
    ...(attachments.length > 0 && { attachments }),
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${toList}: ${info.messageId}`);
    return info;
  } catch (err) {
    console.error("❌ Email sending failed:", err.message || err);
    throw err;
  }
}

// For FMS related emails
export async function sendMailForFMS({ to, subject, html, attachments = [] }) {
  const toList = Array.isArray(to) ? to.join(", ") : to;
  try {
    await transporter.sendMail({
      from: `"EPO FMS" <${process.env.EMAIL_USER}>`,
      to: toList,
      subject,
      html,
      ...(attachments.length > 0 && { attachments }),
    });
    console.log(`📧 Email sent successfully to ${to}`);
  } catch (err) {
    console.error(`❌ Failed to send email to ${to}:`, err.message);
  }
}


// For multiple to recipients
