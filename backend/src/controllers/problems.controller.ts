import { Request, Response } from "express";
import { pool } from "../config/db";
import {
  generateStarterCode,
  isFunctionProblem,
  parseParameters,
} from "../utils/codeWrapper";
import {
  formatArgsDisplay,
  formatOutputDisplay,
  normalizeTestcaseInput,
  canonicalizeExpectedOutput,
} from "../utils/leetcodeDisplay";
import { FunctionProblemMeta } from "../types/problem";

// 1. GET /api/problem-sets
export const getProblemSets = async (req: Request, res: Response) => {
  try {
    const query = `
      SELECT 
        ps.id, 
        ps.title, 
        ps.description, 
        ps.created_at,
        COUNT(p.id)::int as total_problems,
        SUM(CASE WHEN p.difficulty = 'Easy' THEN 1 ELSE 0 END)::int as easy_count,
        SUM(CASE WHEN p.difficulty = 'Medium' THEN 1 ELSE 0 END)::int as medium_count,
        SUM(CASE WHEN p.difficulty = 'Hard' THEN 1 ELSE 0 END)::int as hard_count
      FROM problem_sets ps
      LEFT JOIN problems p ON p.problem_set_id = ps.id
      GROUP BY ps.id
      ORDER BY ps.created_at ASC
    `;
    const result = await pool.query(query);
    return res.json(result.rows);
  } catch (err: any) {
    console.error("Error fetching problem sets:", err);
    return res.status(500).json({ message: "Failed to fetch problem sets" });
  }
};

// 2. POST /api/admin/problem-sets
export const createProblemSet = async (req: Request, res: Response) => {
  const { title, description } = req.body;
  const adminId = (req as any).userId;

  if (!title) {
    return res.status(400).json({ message: "Title is required" });
  }

  try {
    const result = await pool.query(
      `INSERT INTO problem_sets (title, description, created_by)
       VALUES ($1, $2, $3) RETURNING *`,
      [title, description, adminId]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err: any) {
    console.error("Error creating problem set:", err);
    return res.status(500).json({ message: "Failed to create problem set" });
  }
};

// 3. GET /api/problem-sets/:setId/problems
export const getProblemsBySet = async (req: Request, res: Response) => {
  const { setId } = req.params;
  const userId = (req as any).userId;

  try {
    const query = `
      SELECT 
        p.id, 
        p.title, 
        p.difficulty, 
        p.tags, 
        p.created_at,
        COALESCE(pp.status, 'Not Started') as status
      FROM problems p
      LEFT JOIN problem_progress pp ON pp.problem_id = p.id AND pp.user_id = $2
      WHERE p.problem_set_id = $1
      ORDER BY p.created_at ASC
    `;
    const result = await pool.query(query, [setId, userId]);
    return res.json(result.rows);
  } catch (err: any) {
    console.error("Error fetching problems in set:", err);
    return res.status(500).json({ message: "Failed to fetch problems" });
  }
};

// 4. GET /api/problems/:problemId
export const getProblemById = async (req: Request, res: Response) => {
  const { problemId } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM problems WHERE id = $1",
      [problemId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Problem not found" });
    }

    return res.json(result.rows[0]);
  } catch (err: any) {
    console.error("Error fetching problem detail:", err);
    return res.status(500).json({ message: "Failed to fetch problem details" });
  }
};

// 5. POST /api/admin/problems
export const createProblem = async (req: Request, res: Response) => {
  const {
    problem_set_id,
    title,
    description,
    difficulty,
    tags,
    input_format,
    output_format,
    constraints,
    starter_code,
    problem_type,
    function_name,
    return_type,
    parameters,
  } = req.body;
  const adminId = (req as any).userId;

  if (!problem_set_id || !title || !description || !difficulty) {
    return res.status(400).json({ message: "Set ID, title, description, and difficulty are required" });
  }

  const resolvedType = (problem_type || "stdio").toLowerCase();
  const parsedParams = parseParameters(parameters);
  const meta: FunctionProblemMeta = {
    problem_type: resolvedType,
    function_name: function_name || "",
    return_type: return_type || "",
    parameters: parsedParams,
  };

  let resolvedStarter = starter_code || "";
  if (isFunctionProblem(meta) && !resolvedStarter.trim()) {
    resolvedStarter = generateStarterCode(meta);
  }

  try {
    const result = await pool.query(
      `INSERT INTO problems (
        problem_set_id, title, description, difficulty, tags, 
        input_format, output_format, constraints, starter_code, created_by,
        problem_type, function_name, return_type, parameters
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
      [
        problem_set_id,
        title,
        description,
        difficulty,
        tags || [],
        input_format || "",
        output_format || "",
        constraints || "",
        resolvedStarter,
        adminId,
        resolvedType,
        function_name || null,
        return_type || null,
        JSON.stringify(parsedParams),
      ]
    );
    return res.status(201).json(result.rows[0]);
  } catch (err: any) {
    console.error("Error creating problem:", err);
    if (err.message?.includes("problem_type")) {
      return res.status(500).json({
        message:
          "Database missing function-problem columns. Run backend/scripts/add_function_problems.sql",
      });
    }
    return res.status(500).json({ message: "Failed to create problem" });
  }
};

// 6. POST /api/admin/problems/:problemId/testcases
export const createTestcase = async (req: Request, res: Response) => {
  const { problemId } = req.params;
  const { input, expected_output, is_hidden } = req.body;

  if (expected_output === undefined) {
    return res.status(400).json({ message: "Expected output is required" });
  }

  try {
    const storedInput = normalizeTestcaseInput(input || "");
    const storedOutput = canonicalizeExpectedOutput(expected_output.toString());

    const result = await pool.query(
      `INSERT INTO testcases (problem_id, input, expected_output, is_hidden)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [problemId, storedInput, storedOutput, is_hidden || false]
    );
    const row = result.rows[0];
    return res.status(201).json({
      ...row,
      input_display: formatArgsDisplay(row.input),
      expected_output_display: formatOutputDisplay(row.expected_output),
    });
  } catch (err: any) {
    console.error("Error adding testcase:", err);
    return res.status(500).json({ message: "Failed to add testcase" });
  }
};

// 7. GET /api/problems/:problemId/sample-testcases
export const getSampleTestcases = async (req: Request, res: Response) => {
  const { problemId } = req.params;

  try {
    // Only return NON-hidden testcases so student cannot see hidden values
    const result = await pool.query(
      "SELECT id, problem_id, input, expected_output, is_hidden FROM testcases WHERE problem_id = $1 AND is_hidden = false ORDER BY created_at ASC",
      [problemId]
    );
    const rows = result.rows.map((row: { input: string; expected_output: string }) => ({
      ...row,
      input_display: formatArgsDisplay(row.input),
      expected_output_display: formatOutputDisplay(row.expected_output),
    }));
    return res.json(rows);
  } catch (err: any) {
    console.error("Error fetching sample testcases:", err);
    return res.status(500).json({ message: "Failed to fetch sample testcases" });
  }
};
