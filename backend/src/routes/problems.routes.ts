import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware";
import { adminMiddleware } from "../middleware/admin.middleware";
import {
  getProblemSets,
  createProblemSet,
  getProblemsBySet,
  getProblemById,
  createProblem,
  createTestcase,
  getSampleTestcases,
} from "../controllers/problems.controller";
import { submitProblemSolution } from "../controllers/submissions.controller";

const router = Router();

// Problem Sets routes
router.get("/problem-sets", authMiddleware, getProblemSets);
router.post("/admin/problem-sets", authMiddleware, adminMiddleware, createProblemSet);

// Problems routes
router.get("/problem-sets/:setId/problems", authMiddleware, getProblemsBySet);
router.get("/problems/:problemId", authMiddleware, getProblemById);
router.post("/admin/problems", authMiddleware, adminMiddleware, createProblem);

// Testcases routes
router.post("/admin/problems/:problemId/testcases", authMiddleware, adminMiddleware, createTestcase);
router.get("/problems/:problemId/sample-testcases", authMiddleware, getSampleTestcases);

// Submission route
router.post("/problems/:problemId/submit", authMiddleware, submitProblemSolution);

export default router;
