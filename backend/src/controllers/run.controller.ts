import { Request, Response } from "express";
import { pool } from "../config/db";
import { FunctionProblemMeta } from "../types/problem";
import { parseParameters } from "../utils/codeWrapper";
import { judgeSolution, runCustomCase, runPlayground } from "../utils/judge";
import { judgePythonSolution, runCustomPythonCase, runPlaygroundPython } from "../utils/pythonJudge";

const loadProblem = async (problemId: string) => {
  const result = await pool.query("SELECT * FROM problems WHERE id = $1", [problemId]);
  return result.rows[0] as Record<string, any> | undefined;
};

const toFunctionMeta = (row: Record<string, any>): FunctionProblemMeta => ({
  problem_type: "function",
  function_name: String(row.function_name || ""),
  return_type: String(row.return_type || ""),
  parameters: parseParameters(row.parameters),
});

/**
 * POST /api/problems/:problemId/run
 */
export const runProblemCode = async (req: Request, res: Response) => {
  const problemId = req.params.problemId as string;
  const { code, language, mode = "sample", custom_input, custom_expected } = req.body;

  if (!code) {
    return res.status(400).json({ message: "Code cannot be empty" });
  }
  
  const lang = (language || "c").toLowerCase();
  if (lang !== "c" && lang !== "python") {
    return res.status(400).json({ message: "Unsupported language" });
  }

  try {
    const problemRow = await loadProblem(problemId);
    if (!problemRow) {
      return res.status(404).json({ message: "Problem not found" });
    }

    const meta = toFunctionMeta(problemRow);
    const pythonConfig = problemRow.language_configs?.python || {};

    if (mode === "custom") {
      let result;
      if (lang === "python") {
        result = await runCustomPythonCase(code, meta, pythonConfig, custom_input || "", custom_expected);
      } else {
        result = await runCustomCase(code, meta, custom_input || "", custom_expected);
      }
      return res.json({ mode: "custom", ...result });
    }

    const testcasesRes = await pool.query(
      `SELECT * FROM testcases WHERE problem_id = $1 AND is_hidden = false ORDER BY created_at ASC`,
      [problemId]
    );

    let outcome;
    if (lang === "python") {
      outcome = await judgePythonSolution(code, testcasesRes.rows, meta, pythonConfig, { timeoutMs: 3000 });
    } else {
      outcome = await judgeSolution(code, testcasesRes.rows, meta, { timeoutMs: 2000 });
    }

    return res.json({ mode: "sample", ...outcome });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Run problem error:", err);
    return res.status(500).json({ message: "Execution engine crash: " + message });
  }
};

/**
 * POST /api/run-playground
 */
export const runPlaygroundCode = async (req: Request, res: Response) => {
  const { code, language, stdin = "" } = req.body;

  if (!code) {
    return res.status(400).json({ message: "Code cannot be empty" });
  }
  
  const lang = (language || "c").toLowerCase();
  if (lang !== "c" && lang !== "python") {
    return res.status(400).json({ message: "Unsupported language" });
  }

  try {
    let result;
    if (lang === "python") {
      result = await runPlaygroundPython(code, stdin, 5000);
    } else {
      result = await runPlayground(code, stdin, 5000);
    }
    return res.json(result);
  } catch (err: any) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Playground run error:", err);
    return res.status(500).json({ message: "Execution engine crash: " + message });
  }
};
