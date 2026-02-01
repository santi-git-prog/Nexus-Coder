import { Request, Response } from "express";
import { pool } from "../config/db";

// POST /api/problems
export const createProblem = async (req: Request, res: Response) => {
  try {
    const { title, description, difficulty, constraints } = req.body;

    if (!title || !description || !difficulty) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const result = await pool.query(
      `insert into problems (title, description, difficulty, constraints)
       values ($1, $2, $3, $4)
       returning *`,
      [title, description, difficulty, constraints]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ message: "Failed to create problem" });
  }
};

// GET /api/problems
export const getProblems = async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      "select * from problems order by created_at desc"
    );
    res.json(result.rows);
  } catch {
    res.status(500).json({ message: "Failed to fetch problems" });
  }
};

// GET /api/problems/:id
export const getProblemById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "select * from problems where id=$1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Problem not found" });
    }

    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ message: "Failed to fetch problem" });
  }
};
