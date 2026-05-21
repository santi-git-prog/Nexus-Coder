import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { pool } from "../config/db";
import { getSandboxMode } from "../utils/sandbox";

// Ensure the local temp runs directory exists in the workspace
const TEMP_RUNS_DIR = path.join(__dirname, "..", "..", "temp_runs");
if (!fs.existsSync(TEMP_RUNS_DIR)) {
  fs.mkdirSync(TEMP_RUNS_DIR, { recursive: true });
}

const EXECUTABLE_NAME = process.platform === "win32" ? "solution.exe" : "solution";

// Helper to normalize outputs for comparison (removes \r, trims trailing whitespaces and newlines)
const normalizeOutput = (str: string): string => {
  return str
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
};

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
    // 1. Fetch all testcases for the problem
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

    // 2. Setup running directory workspace
    const runId = `submit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const runDir = path.join(TEMP_RUNS_DIR, runId);
    fs.mkdirSync(runDir, { recursive: true });

    const sourceFile = path.join(runDir, "solution.c");
    fs.writeFileSync(sourceFile, code, "utf8");

    const sandboxMode = getSandboxMode();
    console.log(`Submitting Solution: Sandbox Mode = ${sandboxMode}, Testcases = ${testcases.length}`);

    if (sandboxMode === "none") {
      cleanupDir(runDir);
      return res.status(503).json({
        message:
          "No C compiler available. Install GCC (MinGW) on the server, or install Docker and pull the gcc image.",
      });
    }

    if (sandboxMode === "docker") {
      // -------------------------------------------------------------
      // DOCKER CONTAINER SUBMISSION ENGINE
      // -------------------------------------------------------------
      const hostAbsPath = path.resolve(runDir);

      // STEP A: Compile C code inside container once
      const compileResult = await new Promise<{ exitCode: number; stderr: string }>((resolve) => {
        const dockerCompile = spawn("docker", [
          "run",
          "--rm",
          "-v",
          `${hostAbsPath}:/workspace`,
          "-w",
          "/workspace",
          "gcc",
          "-O2",
          "solution.c",
          "-o",
          "solution",
        ]);

        let stderrData = "";
        dockerCompile.stderr.on("data", (data) => {
          stderrData += data.toString();
        });

        dockerCompile.on("close", (exitCode) => {
          resolve({ exitCode: exitCode ?? 1, stderr: stderrData });
        });
      });

      if (compileResult.exitCode !== 0) {
        // Compilation failed!
        cleanupDir(runDir);
        const status = "Compile Error";

        await saveSubmissionMetrics(userId, problemId, "c", code, status, 0, testcases.length, compileResult.stderr);
        await updateProblemProgress(userId, problemId, "Attempted");

        return res.json({
          status,
          passed_count: 0,
          total_count: testcases.length,
          compile_error: compileResult.stderr,
          testcase_results: [],
        });
      }

      // STEP B: Run container sequentially against every testcase
      let passedCount = 0;
      let submissionStatus = "Success";
      let summaryText = "";
      const resultsList: any[] = [];

      for (let i = 0; i < testcases.length; i++) {
        const tc = testcases[i];

        const tcRunResult = await new Promise<{
          exitCode: number;
          stdout: string;
          stderr: string;
          isTimedOut: boolean;
        }>((resolve) => {
          const dockerRun = spawn("docker", [
            "run",
            "--rm",
            "-i",
            "--memory=128m",
            "--cpus=0.5",
            "-v",
            `${hostAbsPath}:/workspace`,
            "-w",
            "/workspace",
            "--entrypoint",
            "./solution",
            "gcc",
          ]);

          let stdoutData = "";
          let stderrData = "";
          let isTimedOut = false;

          // 2-second timeout per testcase run
          const timeout = setTimeout(() => {
            isTimedOut = true;
            try {
              dockerRun.kill("SIGKILL");
            } catch (e) {}
          }, 2000);

          if (tc.input) {
            dockerRun.stdin.write(tc.input);
          }
          dockerRun.stdin.end();

          dockerRun.stdout.on("data", (data) => {
            stdoutData += data.toString();
          });

          dockerRun.stderr.on("data", (data) => {
            stderrData += data.toString();
          });

          dockerRun.on("close", (exitCode) => {
            clearTimeout(timeout);
            resolve({
              exitCode: exitCode ?? 0,
              stdout: stdoutData,
              stderr: stderrData,
              isTimedOut,
            });
          });
        });

        const normalizedOutput = normalizeOutput(tcRunResult.stdout);
        const normalizedExpected = normalizeOutput(tc.expected_output);
        const outputsMatch = normalizedOutput === normalizedExpected;

        let tcStatus = "Success";
        if (tcRunResult.isTimedOut) {
          tcStatus = "Time Limit Exceeded";
          submissionStatus = "Time Limit Exceeded";
        } else if (tcRunResult.exitCode !== 0) {
          tcStatus = "Runtime Error";
          submissionStatus = "Runtime Error";
        } else if (!outputsMatch) {
          tcStatus = "Wrong Answer";
          if (submissionStatus === "Success") {
            submissionStatus = "Wrong Answer";
          }
        }

        const passed = tcStatus === "Success";
        if (passed) {
          passedCount++;
        }

        // Store testcase output card. Security: Do not leak inputs/outputs if it is a hidden testcase.
        resultsList.push({
          id: tc.id,
          is_hidden: tc.is_hidden,
          status: tcStatus,
          passed,
          input: tc.is_hidden ? undefined : tc.input,
          expected_output: tc.is_hidden ? undefined : tc.expected_output,
          actual_output: tc.is_hidden ? undefined : tcRunResult.stdout,
          error_message: tc.is_hidden ? undefined : (tcRunResult.isTimedOut ? "Time Limit Exceeded" : tcRunResult.stderr),
        });

        // Set summary message on first failing testcase
        if (!passed && !summaryText) {
          if (tcRunResult.isTimedOut) {
            summaryText = `Testcase #${i + 1} timed out (Time Limit Exceeded)`;
          } else if (tcRunResult.exitCode !== 0) {
            summaryText = `Testcase #${i + 1} crashed (Runtime Error)`;
          } else {
            summaryText = `Testcase #${i + 1} failed (Wrong Answer)`;
          }
        }
      }

      if (passedCount === testcases.length) {
        submissionStatus = "Success";
        summaryText = "All testcases passed! Outstanding job.";
      }

      cleanupDir(runDir);

      // Save submission history in database
      await saveSubmissionMetrics(
        userId,
        problemId,
        "c",
        code,
        submissionStatus,
        passedCount,
        testcases.length,
        summaryText
      );

      // Update user progress status
      const overallStatus = submissionStatus === "Success" ? "Solved" : "Attempted";
      await updateProblemProgress(userId, problemId, overallStatus);

      return res.json({
        status: submissionStatus,
        passed_count: passedCount,
        total_count: testcases.length,
        output_summary: summaryText,
        testcase_results: resultsList,
      });

    } else {
      // -------------------------------------------------------------
      // GRACEFUL LOCAL FALLBACK SUBMISSION ENGINE
      // -------------------------------------------------------------
      const execFile = path.join(runDir, EXECUTABLE_NAME);

      // STEP A: Compile locally
      const compileResult = await new Promise<{ exitCode: number; stderr: string }>((resolve) => {
        const localCompile = spawn("gcc", ["-O2", sourceFile, "-o", execFile]);

        let stderrData = "";
        localCompile.stderr.on("data", (data) => {
          stderrData += data.toString();
        });

        localCompile.on("close", (exitCode) => {
          resolve({ exitCode: exitCode ?? 1, stderr: stderrData });
        });
      });

      if (compileResult.exitCode !== 0) {
        cleanupDir(runDir);
        const status = "Compile Error";

        await saveSubmissionMetrics(
          userId,
          problemId,
          "c",
          code,
          status,
          0,
          testcases.length,
          compileResult.stderr
        );
        await updateProblemProgress(userId, problemId, "Attempted");

        return res.json({
          status,
          passed_count: 0,
          total_count: testcases.length,
          compile_error: compileResult.stderr,
          testcase_results: [],
        });
      }

      // STEP B: Run sequentially against testcases
      let passedCount = 0;
      let submissionStatus = "Success";
      let summaryText = "";
      const resultsList: any[] = [];

      for (let i = 0; i < testcases.length; i++) {
        const tc = testcases[i];

        const tcRunResult = await new Promise<{
          exitCode: number;
          stdout: string;
          stderr: string;
          isTimedOut: boolean;
        }>((resolve) => {
          const localRun = spawn(execFile);

          let stdoutData = "";
          let stderrData = "";
          let isTimedOut = false;

          const timeout = setTimeout(() => {
            isTimedOut = true;
            try {
              localRun.kill("SIGKILL");
            } catch (e) {}
          }, 2000);

          if (tc.input) {
            localRun.stdin.write(tc.input);
          }
          localRun.stdin.end();

          localRun.stdout.on("data", (data) => {
            stdoutData += data.toString();
          });

          localRun.stderr.on("data", (data) => {
            stderrData += data.toString();
          });

          localRun.on("close", (exitCode) => {
            clearTimeout(timeout);
            resolve({
              exitCode: exitCode ?? 0,
              stdout: stdoutData,
              stderr: stderrData,
              isTimedOut,
            });
          });
        });

        const normalizedOutput = normalizeOutput(tcRunResult.stdout);
        const normalizedExpected = normalizeOutput(tc.expected_output);
        const outputsMatch = normalizedOutput === normalizedExpected;

        let tcStatus = "Success";
        if (tcRunResult.isTimedOut) {
          tcStatus = "Time Limit Exceeded";
          submissionStatus = "Time Limit Exceeded";
        } else if (tcRunResult.exitCode !== 0) {
          tcStatus = "Runtime Error";
          submissionStatus = "Runtime Error";
        } else if (!outputsMatch) {
          tcStatus = "Wrong Answer";
          if (submissionStatus === "Success") {
            submissionStatus = "Wrong Answer";
          }
        }

        const passed = tcStatus === "Success";
        if (passed) {
          passedCount++;
        }

        resultsList.push({
          id: tc.id,
          is_hidden: tc.is_hidden,
          status: tcStatus,
          passed,
          input: tc.is_hidden ? undefined : tc.input,
          expected_output: tc.is_hidden ? undefined : tc.expected_output,
          actual_output: tc.is_hidden ? undefined : tcRunResult.stdout,
          error_message: tc.is_hidden ? undefined : (tcRunResult.isTimedOut ? "Time Limit Exceeded" : tcRunResult.stderr),
        });

        if (!passed && !summaryText) {
          if (tcRunResult.isTimedOut) {
            summaryText = `Testcase #${i + 1} timed out (Time Limit Exceeded)`;
          } else if (tcRunResult.exitCode !== 0) {
            summaryText = `Testcase #${i + 1} crashed (Runtime Error)`;
          } else {
            summaryText = `Testcase #${i + 1} failed (Wrong Answer)`;
          }
        }
      }

      if (passedCount === testcases.length) {
        submissionStatus = "Success";
        summaryText = "All testcases passed! Outstanding job.";
      }

      cleanupDir(runDir);

      await saveSubmissionMetrics(
        userId,
        problemId,
        "c",
        code,
        submissionStatus,
        passedCount,
        testcases.length,
        summaryText
      );

      const overallStatus = submissionStatus === "Success" ? "Solved" : "Attempted";
      await updateProblemProgress(userId, problemId, overallStatus);

      return res.json({
        status: submissionStatus,
        passed_count: passedCount,
        total_count: testcases.length,
        output_summary: summaryText,
        testcase_results: resultsList,
      });
    }

  } catch (err: any) {
    console.error("Submission crash error:", err);
    return res.status(500).json({ message: "Execution engine crash: " + err.message });
  }
};

// Database helper functions
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
    console.error("DB error saving LeetCode metrics:", err);
  }
};

const updateProblemProgress = async (
  userId: string,
  problemId: string,
  status: "Attempted" | "Solved"
) => {
  try {
    // If user has already solved this problem, do NOT overwrite it to "Attempted" if they run it again and fail
    if (status === "Attempted") {
      const checkRes = await pool.query(
        "SELECT status FROM problem_progress WHERE user_id = $1 AND problem_id = $2",
        [userId, problemId]
      );
      if (checkRes.rows.length > 0 && checkRes.rows[0].status === "Solved") {
        // Keep it as Solved!
        return;
      }
    }

    // Insert or update problem progress
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

const cleanupDir = (dirPath: string) => {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(`Failed submission cleanup: ${dirPath}`, err);
  }
};
