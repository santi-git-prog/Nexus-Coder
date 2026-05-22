import { Request, Response } from "express";
import { pool } from "../config/db";
import { FunctionProblemMeta } from "../types/problem";
import { parseParameters } from "../utils/codeWrapper";
import { judgeSolution } from "../utils/judge";

export const submitProblemSolution = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const problemId = req.params.problemId as string;
  const { code, language } = req.body;

  if (!code) {
    return res.status(400).json({ message: "Code cannot be empty" });
  }

  if (!language || language.toLowerCase() !== "c") {
    return res.status(400).json({ message: "Currently only C language is supported" });
  }

  try {
    const problemRes = await pool.query("SELECT * FROM problems WHERE id = $1", [problemId]);
    if (problemRes.rows.length === 0) {
      return res.status(404).json({ message: "Problem not found" });
    }

    const problemRow = problemRes.rows[0];
    const meta: FunctionProblemMeta = {
      problem_type: problemRow.problem_type || "function",
      function_name: problemRow.function_name || "",
      return_type: problemRow.return_type || "",
      parameters: parseParameters(problemRow.parameters),
    };

    const testcasesRes = await pool.query(
      "SELECT * FROM testcases WHERE problem_id = $1 ORDER BY is_hidden ASC, created_at ASC",
      [problemId]
    );

    const testcases = testcasesRes.rows;
    if (testcases.length === 0) {
      return res.status(400).json({
        message: "No testcases defined for this problem. Please notify the administrator.",
      });
    }

    const outcome = await judgeSolution(code, testcases, meta);

    if (outcome.status === "Compile Error") {
      await saveSubmissionMetrics(
        userId,
        problemId,
        "c",
        code,
        outcome.status,
        0,
        testcases.length,
        outcome.compile_error || outcome.output_summary
      );
      await updateProblemProgress(userId, problemId, "Attempted");
      return res.json({
        status: outcome.status,
        passed_count: 0,
        total_count: testcases.length,
        compile_error: outcome.compile_error,
        output_summary: outcome.output_summary,
        testcase_results: [],
      });
    }

    await saveSubmissionMetrics(
      userId,
      problemId,
      "c",
      code,
      outcome.status,
      outcome.passed_count,
      testcases.length,
      outcome.output_summary
    );

    const overallStatus = outcome.status === "Success" ? "Solved" : "Attempted";
    await updateProblemProgress(userId, problemId, overallStatus);

    return res.json({
      status: outcome.status,
      passed_count: outcome.passed_count,
      total_count: outcome.total_count,
      output_summary: outcome.output_summary,
      testcase_results: outcome.testcase_results,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Submission crash error:", err);
    return res.status(500).json({ message: "Execution engine crash: " + message });
  }
};

const saveSubmissionMetrics = async (
  userId: string,
  problemId: string,
  language: string,
  code: string,
  status: string,
  passedCount: number,
  totalCount: number,
  outputSummary: string
) => {
  try {
    await pool.query(
      `INSERT INTO submissions (
        user_id, problem_id, language, code, status, 
        passed_count, total_count, output_summary, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
      [userId, problemId, language, code, status, passedCount, totalCount, outputSummary]
    );
  } catch (err) {
    console.error("DB error saving submission metrics:", err);
  }
};

const updateProblemProgress = async (
  userId: string,
  problemId: string,
  status: "Attempted" | "Solved"
) => {
  try {
    if (status === "Attempted") {
      const checkRes = await pool.query(
        "SELECT status FROM problem_progress WHERE user_id = $1 AND problem_id = $2",
        [userId, problemId]
      );
      if (checkRes.rows.length > 0 && checkRes.rows[0].status === "Solved") {
        return;
      }
    }

    await pool.query(
      `INSERT INTO problem_progress (user_id, problem_id, status, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (user_id, problem_id)
       DO UPDATE SET status = EXCLUDED.status, updated_at = NOW()`,
      [userId, problemId, status]
    );
  } catch (err) {
    console.error("DB error updating problem progress status:", err);
  }
};
