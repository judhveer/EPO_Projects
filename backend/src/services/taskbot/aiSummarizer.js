import axios from "axios";

export async function generateAIReport(taskSummary){
    try{
        const userPrompt = `
    
        You are an HR assistant. Analyze the following task data and write a detailed performance report.
        Include:
        - Overview per employee (Doer)
        - Completed vs pending stats
        - Efficiency and consistency analysis
        - Highlight top performers
        - Include overall summary and suggestios

        Return only JSON:
        {
            "summary": "Detailed performance summary (text)"
            "top_performers": ["list of names"],
            "overall_rating": "Excellent/Good/Average/Poor"
        }

        Data:
        ${JSON.stringify(taskSummary, null, 2)}        
        `;

        const response = await axios.post(
            "https://router.huggingface.co/v1/chat/completions",
            {
                model: "deepseek-ai/DeepSeek-V3.2-Exp:novita",
                stream: false,
                messages: [
                    { role: "system", content: "You are a helpful assistant that outputs strict JSON only."},
                    { role: "user", content: userPrompt },
                ],
            },
            {
                headers: {
                    Authorization: `Bearer ${process.env.HF_API_KEY }`,
                    "Content-Type": "application/json",
                },
                timeout: 90000,
            }
        );

        const output = response.data?.choices?.[0]?.message?.content || "";
        const jsonText = output.match(/\{[\s\S]*\}/)?.[0] || "{}";
        const parsed = JSON.parse(jsonText);

        console.log("AI weekly report generated.");
        return parsed;
    } catch (err){
        console.error(" AI report generation failed: ", err.message);
        return {
            summary: "AI summary not available due to network error.",
            top_performers: [],
            overall_rating: "Unknown",
        };
    }
}