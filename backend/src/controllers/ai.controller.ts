import { Request, Response } from "express";
import { pool } from "../config/db";

// Helper to make requests to the Groq API
async function callGroqApi(messages: Array<{ role: string; content: string }>) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not defined in the backend environment. Please add it to your .env file.");
  }

  // Use llama-3.3-70b-versatile for high quality, fallback to llama3-8b-8192
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages,
      temperature: 0.2,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Groq API error response:", errorText);
    throw new Error(`Groq API error: ${response.statusText} (${response.status})`);
  }

  const data = await response.json() as any;
  return data.choices[0]?.message?.content || "";
}

// 1. POST /api/problems/:problemId/ai-overview (or playground)
export const getAiOverview = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { problemId } = req.params;
  const { code, language } = req.body;

  if (!code) {
    return res.status(400).json({ message: "Code content cannot be empty" });
  }

  try {
    let problemDetails: any = null;
    if (problemId && problemId !== "playground") {
      const problemRes = await pool.query(
        "SELECT title, description FROM problems WHERE id = $1",
        [problemId]
      );
      if (problemRes.rows.length > 0) {
        problemDetails = problemRes.rows[0];
      }
    }

    const systemPrompt = `You are an expert AI code reviewer. Analyze the user's code for correctness, logic errors, compile issues, style, efficiency, and edge cases.
Structure your response clearly. You MUST split your response into these two sections:
1. **Code Review & Analysis**: Highlight any bugs, issues, time/space complexity, or general tips.
2. **Optimal Implementation**: Provide the best-practices ${language || "C"} solution with brief comments explaining the optimization. Keep it clean.`;

    const userPrompt = problemDetails
      ? `Problem Title: ${problemDetails.title}
Problem Description:
${problemDetails.description}

User's Code (${language || "C"}):
\`\`\`${language === 'python' ? 'python' : 'c'}
${code}
\`\`\``
      : `Playground Compiler Context.

User's Code (${language || "C"}):
\`\`\`${language === 'python' ? 'python' : 'c'}
${code}
\`\`\``;

    const review = await callGroqApi([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ]);

    return res.json({ review });
  } catch (err: any) {
    console.error("Error generating AI overview:", err);
    return res.status(500).json({ message: err.message || "Failed to generate AI overview" });
  }
};

// 2. POST /api/problems/:problemId/ai-hint
export const getAiHint = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { problemId } = req.params;
  const { prompt, language } = req.body;

  if (!prompt) {
    return res.status(400).json({ message: "Prompt is required" });
  }

  if (!problemId || problemId === "playground") {
    return res.status(400).json({ message: "Hints are only available for specific coding problems." });
  }

  try {
    // Check current prompt count
    const countRes = await pool.query(
      "SELECT COUNT(*)::int as count FROM ai_hints WHERE user_id = $1 AND problem_id = $2",
      [userId, problemId]
    );
    const count = countRes.rows[0].count;

    if (count >= 5) {
      return res.status(400).json({
        message: "You have used all 5 abstract hints allowed for this problem.",
        remainingHints: 0,
      });
    }

    // Fetch problem context
    const problemRes = await pool.query(
      "SELECT title, description FROM problems WHERE id = $1",
      [problemId]
    );
    if (problemRes.rows.length === 0) {
      return res.status(404).json({ message: "Problem not found" });
    }
    const problem = problemRes.rows[0];

    // Fetch message history for this user + problem
    const historyRes = await pool.query(
      "SELECT prompt, response FROM ai_hints WHERE user_id = $1 AND problem_id = $2 ORDER BY created_at ASC",
      [userId, problemId]
    );

    const langName = language || "C";

    // Build chat context
    const systemPrompt = `You are Nexai, a helpful and experienced coding tutor helping a student solve the coding challenge "${problem.title}".

Problem Description:
${problem.description}

STRICT RULE:
- Do NOT provide ANY code solutions, ${langName} code snippets, code blocks, or syntax answers.
- You must ONLY give abstract hints, conceptual diagrams, algorithmic strategies, math, logic, or pseudo-code descriptions.
- Help the student think, guide them toward the solution step-by-step, but let them write the actual code themselves.
- Keep your answers helpful, concise, and abstract. Do not reveal the code.`;

    const messages = [
      { role: "system", content: systemPrompt }
    ];

    // Append prior conversations
    for (const chat of historyRes.rows) {
      messages.push({ role: "user", content: chat.prompt });
      messages.push({ role: "assistant", content: chat.response });
    }

    // Append current user prompt
    messages.push({ role: "user", content: prompt });

    const aiResponse = await callGroqApi(messages);

    // Persist prompt/response to database
    await pool.query(
      "INSERT INTO ai_hints (user_id, problem_id, prompt, response) VALUES ($1, $2, $3, $4)",
      [userId, problemId, prompt, aiResponse]
    );

    const newRemaining = 5 - (count + 1);

    return res.json({
      response: aiResponse,
      remainingHints: newRemaining,
    });
  } catch (err: any) {
    console.error("Error generating AI hint:", err);
    return res.status(500).json({ message: err.message || "Failed to generate AI hint" });
  }
};

// 3. GET /api/problems/:problemId/ai-hints
export const getAiHintsHistory = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { problemId } = req.params;

  if (!problemId || problemId === "playground") {
    return res.json({ history: [], remainingHints: 5 });
  }

  try {
    const historyRes = await pool.query(
      "SELECT prompt, response, created_at FROM ai_hints WHERE user_id = $1 AND problem_id = $2 ORDER BY created_at ASC",
      [userId, problemId]
    );

    const count = historyRes.rows.length;
    const remaining = Math.max(0, 5 - count);

    return res.json({
      history: historyRes.rows.map((row: any) => ({
        prompt: row.prompt,
        response: row.response,
        createdAt: row.created_at,
      })),
      remainingHints: remaining,
    });
  } catch (err: any) {
    console.error("Error retrieving AI hints history:", err);
    return res.status(500).json({ message: "Failed to fetch AI hints history" });
  }
};
