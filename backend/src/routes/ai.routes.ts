import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import {
  getAiOverview,
  getAiHint,
  getAiHintsHistory,
} from "../controllers/ai.controller";

const router = Router();

// Route for AI code overview/review
router.post("/problems/:problemId/ai-overview", authMiddleware, getAiOverview);
router.post("/playground/ai-overview", authMiddleware, getAiOverview);

// Routes for AI abstract hints chat
router.post("/problems/:problemId/ai-hint", authMiddleware, getAiHint);
router.get("/problems/:problemId/ai-hints", authMiddleware, getAiHintsHistory);

export default router;
