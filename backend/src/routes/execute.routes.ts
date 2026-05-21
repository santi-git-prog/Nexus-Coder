import { Router } from "express";
import { executeCode } from "../controllers/execute.controller";
import { authMiddleware } from "../middleware/auth.middleware";

const router = Router();

// POST /api/execute
router.post("/", authMiddleware, executeCode);

export default router;
