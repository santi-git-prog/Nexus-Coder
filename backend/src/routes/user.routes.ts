import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { pool } from "../config/db";

const router = Router();

router.get("/me", authMiddleware, async (req, res) => {
  const userId = (req as any).userId;
  try {
    const result = await pool.query(
      "SELECT id, username, email, role FROM users WHERE id = $1",
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.json(result.rows[0]);
  } catch (err: any) {
    console.error("Error fetching user details:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
