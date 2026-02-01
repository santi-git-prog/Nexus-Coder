import { Router } from "express";
import {
  createProblem,
  getProblems,
  getProblemById,
} from "../controllers/problems.controller";

const router = Router();

router.post("/", createProblem);
router.get("/", getProblems);
router.get("/:id", getProblemById);

export default router;
