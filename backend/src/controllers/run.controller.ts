import { Request, Response } from "express";
import { pool } from "../config/db";
import { FunctionProblemMeta } from "../types/problem";
import { parseParameters } from "../utils/codeWrapper";
import { judgeSolution, runCustomCase, runPlayground } from "../utils/judge";

const loadProblem = async (problemId: string) => {
  const result = await pool.query("SELECT * FROM problems WHERE id = $1", [problemId]);
  return result.rows[0] as Record<string, unknown> | undefined;
};

const toFunctionMeta = (row: Record<string, unknown>): FunctionProblemMeta => ({
  problem_type: "function",
  function_name: String(row.function_name || ""),
  return_type: String(row.return_type || ""),
  parameters: parseParameters(row.parameters),
});

/**
 * POST /api/problems/:problemId/run
 * mode: "sample" — public testcases only (LeetCode Run)
 * mode: "custom" — user-provided input (+ optional expected for compare)
 */
export const runProblemCode = async (req: Request, res: Response) => {
  const problemId = req.params.problemId as string;
  const { code, language, mode = "sample", custom_input, custom_expected } = req.body;

  if (!code) {
    return res.status(400).json({ message: "Code cannot be empty" });
  }
  if (!language || language.toLowerCase() !== "c") {
    return res.status(400).json({ message: "Currently only C language is supported" });
  }

  try {
    const problemRow = await loadProblem(problemId);
    if (!problemRow) {
      return res.status(404).json({ message: "Problem not found" });
    }

    const meta = toFunctionMeta(problemRow);

    if (mode === "custom") {
      const result = await runCustomCase(
        code,
        meta,
        custom_input || "",
        custom_expected
      );
      return res.json({
        mode: "custom",
        ...result,
      });
    }

    const testcasesRes = await pool.query(
      `SELECT * FROM testcases 
       WHERE problem_id = $1 AND is_hidden = false 
       ORDER BY created_at ASC`,
      [problemId]
    );

    const outcome = await judgeSolution(code, testcasesRes.rows, meta, {
      timeoutMs: 2000,
    });

    return res.json({
      mode: "sample",
      ...outcome,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Run problem error:", err);
    return res.status(500).json({ message: "Execution engine crash: " + message });
  }
};

/**
 * POST /api/run-playground
 * Compiles and runs arbitrary user code with optional raw stdin. No problem context needed.
 */
export const runPlaygroundCode = async (req: Request, res: Response) => {
  const { code, language, stdin = "" } = req.body;

  if (!code) {
    return res.status(400).json({ message: "Code cannot be empty" });
  }
  if (!language || language.toLowerCase() !== "c") {
    return res.status(400).json({ message: "Currently only C language is supported" });
  }

  try {
    const result = await runPlayground(code, stdin);
    return res.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Playground run error:", err);
    return res.status(500).json({ message: "Execution engine crash: " + message });
  }
};
