import db from "../../models/index.js";
import { Op } from "sequelize";
import { generateAIReport } from "../../services/taskbot/aiSummarizer.js";
import { sendMail } from "../../email/sendMail.js";
import bot from "../../controllers/taskbotController/bot.js";
import dotenv from "dotenv";
dotenv.config();


export async function generateWeeklyTaskReport() {
  console.log("📊 Generating Overall Task Performance Report...");

  try {
    // 🧩 1️⃣ Fetch all tasks (no time filter)
    const tasks = await db.Task.findAll();

    if (!tasks.length) {
      console.log("⚠️ No tasks found in the database.");
      return;
    }

    // 🧮 2️⃣ Build summary per doer
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
      if (summary[doer][t.status] !== undefined) {
        summary[doer][t.status]++;
      }
    }

    console.log("📈 Aggregated Task Summary:", summary);

    // 🧠 3️⃣ Generate AI Analysis (overall report + remarks)
    const aiReport = await generateAIReport(summary);
    const aiRemarks = aiReport.remarks || {};

    // 🧮 4️⃣ Add completion %, benchmark, and AI remark
    for (const doer of Object.keys(summary)) {
      const s = summary[doer];
      s.completion_rate = s.total
        ? ((s.completed / s.total) * 100).toFixed(1)
        : "0.0";

      if (s.completion_rate >= 90) s.benchmark_rating = "🌟 Excellent";
      else if (s.completion_rate >= 75) s.benchmark_rating = "👍 Good";
      else if (s.completion_rate >= 50) s.benchmark_rating = "⚠️ Average";
      else s.benchmark_rating = "❌ Poor";

      s.remarks =
        aiRemarks[doer] ||
        "No AI remark available — insufficient data or new employee.";
    }

    // 🧾 5️⃣ Telegram message summary
    const formattedSummary = Object.entries(summary)
      .map(
        ([name, s]) => `
👤 *${name}*
• Total: ${s.total}
• ✅ Completed: ${s.completed}
• 🕒 Pending: ${s.pending}
• 🔁 Revised: ${s.revised}
• ❌ Canceled: ${s.canceled}
• 📈 Completion Rate: ${s.completion_rate}%
• 🏅 Benchmark: ${s.benchmark_rating}
🗒️ Remark: _${s.remarks}_
`
      )
      .join("\n");

    const telegramText = `
📊 *Overall Task Performance Report*
_(All-time performance of every doer)_

${formattedSummary}

🧠 *AI Analysis Summary:*
${aiReport.summary}

🏆 *Top Performers:* ${aiReport.top_performers?.join(", ") || "None"}
⭐ *Overall Rating:* ${aiReport.overall_rating}
`;

    // 📧 6️⃣ Build HTML Report for email
    const htmlReport = `
      <h2>📊 Overall Task Performance Report</h2>
      <p><b>Data Range:</b> All-time tasks from database</p>
      <hr/>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse: collapse; width: 100%; font-family: Arial;">
        <thead style="background-color: #f8f9fa;">
          <tr>
            <th>Doer</th>
            <th>Total</th>
            <th>Completed</th>
            <th>Pending</th>
            <th>Revised</th>
            <th>Canceled</th>
            <th>Completion %</th>
            <th>Benchmark Rating</th>
            <th>AI Remark</th>
          </tr>
        </thead>
        <tbody>
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
                <td>${s.completion_rate}%</td>
                <td>${s.benchmark_rating}</td>
                <td>${s.remarks}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
      <hr/>
      <h3>🧠 AI Insights</h3>
      <p>${aiReport.summary}</p>
      <p><b>Top Performers:</b> ${
        aiReport.top_performers?.join(", ") || "None"
      }</p>
      <p><b>Overall Rating:</b> ${aiReport.overall_rating}</p>
    `;

    // ✉️ 7️⃣ Send email
    await sendMail({
      to: process.env.TASK_REPORT_EMAIL,
      subject: "📈 Overall Task Performance Report",
      text: telegramText.replace(/\*/g, ""),
      html: htmlReport,
    });

    console.log("📧 Overall Task Report emailed successfully!");

    // 💬 8️⃣ Send Telegram message
    await sendTelegramMessage(telegramText);
  } catch (error) {
    console.error("❌ Error generating overall report:", error.message);
  }
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
