import db from "../../models/index.js";
import { Op } from "sequelize";
import { generateAIReport } from "../../services/taskbot/aiSummarizer.js";
import { sendMail } from "../../email/sendMail.js";
import bot from "../../controllers/taskbotController/bot.js";
import dotenv from "dotenv";
dotenv.config();

export async function generateWeeklyTaskReport() {
  console.log("Generating week task report...");

  const today = new Date();
  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 7);

  // Fetch last week's tasks
  const tasks = await db.Task.findAll({
    where: {
      createdAt: { [Op.between]: [lastWeek, today] },
    },
  });

  if (!tasks.length) {
    console.log("No tasks found this week.");
    return;
  }

  const summary = {};
  for (const t of tasks) {
    const doer = t.doer;
    if (!summary[doer]) {
      summary[doer] = {
        total: 0,
        completed: 0,
        pending: 0,
        revised: 0,
        canceled: 0,
      };
    }
    summary[doer].total++;
    summary[doer][t.status]++;
  }

  console.log("Task summary:", summary);

  // get AI report
  const aiReport = await generateAIReport(summary);

  // Build message content
  const formattedSummary = Object.entries(summary)
    .map(
      ([name, s]) =>
        `👤 *${name}*\n• Total: ${s.total}\n• ✅ Completed: ${s.completed}\n• 🕒 Pending: ${s.pending}\n• 🔁 Revised: ${s.revised}\n• ❌ Canceled: ${s.canceled}`
    )
    .join("\n\n");

  const telegramText = `
📊 *Weekly Task Performance Report*
_Period: ${lastWeek.toDateString()} → ${today.toDateString()}_

${formattedSummary}

🧠 *AI Analysis Summary:*
${aiReport.summary}

🏅 *Top Performers:* ${aiReport.top_performers?.join(", ") || "None"}
⭐ *Overall Rating:* ${aiReport.overall_rating}
`;

  // email
  const htmlReport = `
    <h2>📊 Weekly Task Performance Report</h2>
    <p><b>Period:</b> ${lastWeek.toDateString()} - ${today.toDateString()}</p>
    <hr/>
    <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse;">
      <tr><th>Doer</th><th>Total</th><th>Completed</th><th>Pending</th><th>Revised</th><th>Canceled</th></tr>
      ${Object.entries(summary)
        .map(
          ([doer, s]) => `
          <tr>
            <td>${doer}</td>
            <td>${s.total}</td>
            <td>${s.completed}</td>
            <td>${s.pending}</td>
            <td>${s.revised}</td>
            <td>${s.canceled}</td>
          </tr>`
        )
        .join("")}
    </table>
    <hr/>
    <h3>🧠 AI Insights</h3>
    <p>${aiReport.summary}</p>
    <p><b>Top Performers:</b> ${
      aiReport.top_performers?.join(", ") || "None"
    }</p>
    <p><b>Overall Rating:</b> ${aiReport.overall_rating}</p>
  `;

  await sendMail({
    to: process.env.TASK_REPORT_EMAIL,
    subject: "📅 Weekly Task Performance Report",
    text: telegramText.replace(/\*/g, ""),
    html: htmlReport,
  });

  console.log("📧 Weekly Task Report emailed successfully!");

  // send telegram message
  await sendTelegramMessage(telegramText);
}

// --- Helper: Send Telegram Message ---
async function sendTelegramMessage(text) {
  try {
    const bossChatId = process.env.BOSS_TELEGRAM_ID;
    if (!bossChatId) {
      throw new Error("Missing BOSS_TELEGRAM_ID in .env");
    }

    await bot.telegram.sendMessage(bossChatId, text, {
      parse_mode: "Markdown",
    });
    console.log("💬 Weekly Telegram report sent to boss successfully!");
  } catch (error) {
    console.error("❌ Failed to send Telegram report:", error.message);
  }
}
