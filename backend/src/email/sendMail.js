import dotenv from "dotenv";

dotenv.config();
// src/utils/mail/sendMail.js
import  { createTransporter } from "./transporter.js";

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
  if (!to) throw new Error("No recipients provided");
  if (!subject) throw new Error("Subject is required");
  const transporter = await createTransporter();
  const recipients = Array.isArray(to) ? to : [to];

  for(const email of recipients) {
    try {
      const info = await transporter.sendMail({
        from: `"Sales Pipeline" <${process.env.EMAIL_USER}>`,
        to: email,
        subject,
        text,
        html,
        ...(attachments.length > 0 && { attachments }),
      });
      console.log(`✅ Email sent to ${email}: ${info.messageId}`);
      return info;
    } catch (err) {
      console.error("❌ Email sending failed:", err.message || err);
      throw err;
    }
  }
}

// For User Creation related emails
export async function sendMailForCreateUser({ to, subject, text, html, attachments = [] }) {
  const transporter = await createTransporter();
  try {
    await transporter.sendMail({
      from: `"EPO ADMIN" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
      ...(attachments.length > 0 && { attachments }),
    });
    console.log(`📧 Email sent successfully to ${to}`);
  } catch (err) {
    console.error(`❌ Failed to send email to ${to}:`, err.message);
  }
}

// For Reports related emails (Attendance and Telegram Task Bot reports etc)
export async function sendMailForReports({ to, subject, text, html, attachments = [] }) {
  if (!subject) throw new Error("Subject is required");
  const transporter = await createTransporter();

  const mailOptions = {
    from: `"EPO Automation" <${process.env.EMAIL_USER}>`,
    to: to,
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
  console.log("Sending FMS email to:", to);
  if (!to) {
    console.error("❌ No recipients provided");
    return;
  }
  const recipients = Array.isArray(to) ? to : [to];
  
  // Create a fresh transporter for EACH BATCH (not for each email)
  // Create transporter once for all recipients
  let transporter;
  try {
    transporter = await createTransporter();
    console.log("✅ Transporter created successfully");
  } catch (error) {
    console.error("❌ Failed to create transporter:", error.message);
    return;
  }

 
  // Send emails with delay between them
  for (const [index, email] of recipients.entries()) {
    try {
      // Add 10 second delay between emails (except first)
      if (index > 0) {
        await new Promise(resolve => setTimeout(resolve, 10000));
      }

      console.log(`📨 Attempting to send to ${email}...`);
      
      const mailOptions = {
        from: `"EPO FMS" <${process.env.EMAIL_USER}>`,
        to: email,
        subject,
        html,
        ...(attachments.length > 0 && { attachments }),
      };

      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ Email sent to ${email} (Message ID: ${info.messageId})`);
      
    } catch (err) {
      console.error(`❌ Failed to send email to ${email}:`, err.message);
      
      // If it's an SSL/TLS error, try with a fresh transporter
      if (err.message.includes("SSL") || err.message.includes("TLS")) {
        console.log(`🔄 SSL/TLS error for ${email}, creating new transporter...`);
        try {
          // Close old transporter
          transporter.close();
          // Create new transporter
          transporter = await createTransporter();
          
          // Retry with new transporter
          await transporter.sendMail({
            from: `"EPO FMS" <${process.env.EMAIL_USER}>`,
            to: email,
            subject,
            html,
            ...(attachments.length > 0 && { attachments }),
          });
          console.log(`✅ Retry successful for ${email}`);
        } catch (retryErr) {
          console.error(`❌ Retry failed for ${email}:`, retryErr.message);
        }
      }
    }
  }

  // Close the transporter
  try {
    if (transporter) {
      transporter.close();
      console.log("🔒 Transporter connection closed");
    }
  } catch (closeErr) {
    // Ignore close errors
  }
}


