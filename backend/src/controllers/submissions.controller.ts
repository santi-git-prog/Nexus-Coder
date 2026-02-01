import { Request, Response } from "express";
import { pool } from "../config/db";

// POST /api/submissions
export const createSubmission = async (req: Request, res: Response) => {
  try {
    const { user_id, problem_id, language, code } = req.body;

    if (!user_id || !problem_id || !language || !code) {
      return res.status(400).json({ message: "Missing fields" });
    }

    const result = await pool.query(
      `insert into submissions (user_id, problem_id, language, code)
       values ($1, $2, $3, $4)
       returning *`,
      [user_id, problem_id, language, code]
    );

    res.status(201).json(result.rows[0]);
  } catch {
    res.status(500).json({ message: "Failed to submit code" });
  }
};

// GET /api/submissions/user/:userId
export const getUserSubmissions = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const result = await pool.query(
      `select s.*, p.title
       from submissions s
       join problems p on s.problem_id = p.id
       where s.user_id = $1
       order by s.created_at desc`,
      [userId]
    );

    res.json(result.rows);
  } catch {
    res.status(500).json({ message: "Failed to fetch submissions" });
  }
};
