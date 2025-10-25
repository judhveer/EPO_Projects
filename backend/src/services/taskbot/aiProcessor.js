import axios from "axios";

/**
 * Extract task assignment details using Hugging Face Router Chat Completions API
 * Model: deepseek-ai/DeepSeek-V3.2-Exp:novita  (free-tier capable)
 */
export async function extractTaskDetails(text) {

  console.log("task Ai text: ", text);

  try {
    const userPrompt = `
Extract task assignment details from the following text and return ONLY valid JSON in this exact format:
{
  "doer": "person name",
  "task": "task description",
  "due_date": "date or null",
  "urgency": "low/medium/high",
  "department": "department or null"
}

Text: "${text}"

JSON:
`;

    // ✅ Send to Hugging Face router (same as your curl)
    const response = await axios.post(
      "https://router.huggingface.co/v1/chat/completions",
      {
        model: "deepseek-ai/DeepSeek-V3.2-Exp:novita",
        stream: false,
        messages: [
          { role: "system", content: "You are a helpful assistant that outputs strict JSON only." },
          { role: "user", content: userPrompt },
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.HF_API_KEY}`,
          "Content-Type": "application/json",
        },
        timeout: 90000,
      }
    );

    // 🧠 Extract assistant’s text
    const output = response.data?.choices?.[0]?.message?.content || "";
    console.log("Raw AI Response:", output);

    // 🧩 Extract JSON safely
    const jsonText = output.match(/\{[\s\S]*\}/)?.[0] || "{}";
    const parsed = JSON.parse(jsonText);

    console.log("✅ AI Parsed Data:", parsed);
    return parsed;
  } catch (err) {
    console.error("❌ AI extraction failed:", err.message);

    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Response:", err.response.data);
    }

    // Return fallback if something goes wrong
    return {
      doer: null,
      task: text,
      due_date: null,
      urgency: "medium",
      department: null,
    };
  }
}
