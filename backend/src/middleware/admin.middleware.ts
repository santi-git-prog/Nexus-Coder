import { Request, Response, NextFunction } from "express";
import { pool } from "../config/db";

export const adminMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userId = (req as any).userId;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized. Please log in." });
  }

  try {
    const result = await pool.query(
      "SELECT role FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }

    const user = result.rows[0];

    if (user.role !== "admin") {
      return res.status(403).json({ message: "Access denied. Administrator privileges required." });
    }

    // User is an admin, proceed to controller
    next();
  } catch (err) {
    console.error("Error verifying admin role:", err);
    return res.status(500).json({ message: "Internal server authentication error." });
  }
};
