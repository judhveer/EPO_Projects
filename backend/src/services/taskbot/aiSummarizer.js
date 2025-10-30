import axios from "axios";

/**
 * Generate an AI-based performance report for weekly task summary.
 * The AI returns structured JSON with remarks per employee.
 */
export async function generateAIReport(taskSummary) {
  try {
    // 🧠 Step 1: Build strong, explicit prompt
    const userPrompt = `
You are an expert HR performance analyst. Analyze the weekly task summary for multiple employees (doers) and produce a factual, professional report.

Respond strictly in valid JSON format only (no markdown, no prose, no comments).

JSON structure to return:
{
  "summary": "A detailed team performance overview and key insights.",
  "top_performers": ["list of 2-3 best names"],
  "overall_rating": "Excellent | Good | Average | Poor",
  "remarks": {
    "DoerName": "1-2 sentence remark about their performance, punctuality, or consistency."
  }
}

Focus on clarity, fairness, and concise observations.

Data:
${JSON.stringify(taskSummary, null, 2)}
`;

    // 🧩 Step 2: Define payload
    const payload = {
      model: "deepseek-ai/DeepSeek-V3.2-Exp:novita",
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "You are a JSON-only HR assistant. Always return a valid JSON object with no markdown, explanations, or extra text.",
        },
        { role: "user", content: userPrompt },
      ],
    };

    // 📨 Step 3: Send request to Hugging Face Router
    const response = await axios.post(
      "https://router.huggingface.co/v1/chat/completions",
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 60000,
      }
    );

    // 🧹 Step 4: Parse AI output safely
    const output = response.data?.choices?.[0]?.message?.content?.trim() || "";

    // Remove markdown-style wrappers if present
    const jsonMatch = output.match(/\{[\s\S]*\}/)?.[0] || "{}";
    if (!jsonMatch || jsonMatch.length === 0) throw new Error("AI did not return valid JSON.");

    const parsed = JSON.parse(jsonMatch);

    // 🧪 Validate structure (auto-fix missing fields)
    const finalReport = {
      summary: parsed.summary || "No summary generated.",
      top_performers: parsed.top_performers || [],
      overall_rating: parsed.overall_rating || "Unknown",
      remarks: parsed.remarks || {},
    };

    console.log("✅ AI Weekly Report Generated Successfully.");
    return finalReport;
  } catch (err) {
    console.error("❌ AI report generation failed:", err.message);

    // ♻️ Optional: Retry once if network issue
    if (
      err.message.includes("timeout") ||
      err.message.includes("network") ||
      err.message.includes("ENOTFOUND")
    ) {
      console.warn("🔁 Retrying AI report generation...");
      await new Promise((r) => setTimeout(r, 2000));
      return await generateAIReport(taskSummary); // one retry
    }

    // Return fallback response
    return {
      summary: "AI summary not available due to network or parsing error.",
      top_performers: [],
      overall_rating: "Unknown",
      remarks: {},
    };
  }
}

