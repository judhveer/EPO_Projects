import axios from "axios";

/**
 * Extract task assignment details using local AI (Ollama + Mistral)
 */
export async function extractTaskDetails(text) {
  try {
    const payload = {
      model: "mistral",
      prompt: `
You are an intelligent text parser. 
Your task is to extract task details from natural instructions.

The instruction may start with words like "Assign", "Give", "Tell", etc. 
DO NOT confuse these with the person's name.

Always return valid JSON in this exact structure:
{
  "doer": "Person name who will perform the task",
  "task": "Clear task description",
  "due_date": "Exact due date if mentioned, else null",
  "urgency": "low/medium/high",
  "department": "department if mentioned, else null"
}

### EXAMPLES

Input: "Assign Priya to print 200 brochures by 5 PM today — urgent"
Output:
{
  "doer": "Priya",
  "task": "Print 200 brochures",
  "due_date": "Today 5 PM",
  "urgency": "high",
  "department": "Printing"
}

Input: "Give Rahul the job of cleaning the machine by evening"
Output:
{
  "doer": "Rahul",
  "task": "Clean the machine",
  "due_date": "Evening",
  "urgency": "medium",
  "department": null
}

Now extract details from this new instruction:
"${text}"
`,
    };

    const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";

    // 👇 Important: stream mode (Ollama returns multiple JSON chunks)
    const response = await axios.post(`${OLLAMA_URL}/api/generate`, payload, {
      headers: { "Content-Type": "application/json" },
      responseType: "stream", // so we can read streaming text
    });


    let fullResponse = "";

    // 🔄 Collect the text streamed by Ollama
    await new Promise((resolve, reject) => {
      response.data.on("data", (chunk) => {
        const lines = chunk.toString().trim().split("\n");
        for (const line of lines) {
          try {
            const json = JSON.parse(line);
            if (json.response) fullResponse += json.response;
          } catch (err) {
            // Ignore incomplete JSON lines
          }
        }
      });

      response.data.on("end", resolve);
      response.data.on("error", reject);
    });

    // 🧩 Extract JSON object from AI’s full text
    const jsonText = fullResponse.match(/\{[\s\S]*\}/)?.[0] || "{}";

    const parsed = JSON.parse(jsonText);

    console.log("✅ AI Parsed Data:", parsed);
    return parsed;
  } catch (err) {
    console.error("❌ AI extraction failed:", err.message);
    return {};
  }
}
