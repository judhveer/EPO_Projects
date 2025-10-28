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
