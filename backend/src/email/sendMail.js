import dotenv from "dotenv";

dotenv.config();
// src/utils/mail/sendMail.js
import { createTransporter } from "./transporter.js";

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

  for (const email of recipients) {
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
export async function sendMailForCreateUser({
  to,
  subject,
  text,
  html,
  attachments = [],
}) {
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
export async function sendMailForReports({
  to,
  subject,
  text,
  html,
  attachments = [],
}) {
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

  // ── Helper: send ONE email with up to maxAttempts retries ──────────────
  // A fresh transporter is created per attempt so OAuth token is always current.
  // Exponential backoff: 2s → 4s → 8s between attempts.
  async function sendOneEmail(email, attempt = 1, maxAttempts = 3) {
    let transporter;
    try {
      transporter = await createTransporter(); // fresh token every attempt
    } catch (err) {
      console.error(
        `❌ [Attempt ${attempt}] Failed to create transporter for ${email}:`,
        err.message,
      );
      if (attempt < maxAttempts) {
        const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
        console.log(`🔄 Retrying ${email} in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
        return sendOneEmail(email, attempt + 1, maxAttempts);
      }
      return { email, success: false, error: err.message };
    }

    try {
      const info = await transporter.sendMail({
        from: `"EPO FMS" <${process.env.EMAIL_USER}>`,
        to: email,
        subject,
        html,
        ...(attachments.length > 0 && { attachments }),
      });
      console.log(`✅ Email sent to ${email} (ID: ${info.messageId})`);
      return { email, success: true, messageId: info.messageId };
    } catch (err) {
      console.error(
        `❌ [Attempt ${attempt}] Failed to send to ${email}:`,
        err.message,
      );

      const isRetryable =
        err.message.includes("SSL") ||
        err.message.includes("TLS") ||
        err.message.includes("ECONNRESET") ||
        err.message.includes("ETIMEDOUT") ||
        err.message.includes("rate") ||
        (err.responseCode >= 421 && err.responseCode < 500); // SMTP soft failures

      if (isRetryable && attempt < maxAttempts) {
        const delay = Math.pow(2, attempt) * 1000;
        console.log(
          `🔄 Retrying ${email} in ${delay / 1000}s (reason: ${err.message})...`,
        );
        await new Promise((r) => setTimeout(r, delay));
        return sendOneEmail(email, attempt + 1, maxAttempts);
      }

      return { email, success: false, error: err.message };
    } finally {
      // Always close — fresh transporter per email means no resource leak
      try {
        transporter.close();
      } catch (_) {}
    }
  }

  // ── Send all emails: small batches in parallel, batches run sequentially ──
  // Why: purely sequential (one-by-one) is slow for 20 emails.
  //      Purely parallel risks hitting Gmail's rate limiter.
  //      Batches of 3 with a gap between batches is the safe middle ground.
  const BATCH_SIZE = 3;
  const BATCH_DELAY_MS = 5000; // 5s between batches (vs 10s per email before)
  const results = [];

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const batch = recipients.slice(i, i + BATCH_SIZE);

    if (i > 0) {
      console.log(`⏳ Waiting ${BATCH_DELAY_MS / 1000}s before next batch...`);
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }

    console.log(
      `📨 Sending batch ${Math.floor(i / BATCH_SIZE) + 1}: [${batch.join(", ")}]`,
    );

    // Send the batch in parallel
    const batchResults = await Promise.allSettled(
      batch.map((email) => sendOneEmail(email)),
    );

    batchResults.forEach((result) => {
      if (result.status === "fulfilled") {
        results.push(result.value);
      } else {
        // Promise.allSettled never rejects — but guard anyway
        results.push({
          email: "unknown",
          success: false,
          error: result.reason,
        });
      }
    });
  }

  // ── Summary log ──────────────────────────────────────────────────────────
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success);

  console.log(
    `📊 Email summary: ${succeeded}/${results.length} sent successfully`,
  );

  if (failed.length > 0) {
    console.error(
      `⚠️ Failed recipients:`,
      failed.map((r) => `${r.email} → ${r.error}`).join(" | "),
    );
  }

  // Return results so the caller can log or alert if needed
  return results;
}
