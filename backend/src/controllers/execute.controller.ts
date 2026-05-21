import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { pool } from "../config/db";

// Ensure the local temp runs directory exists in the workspace
const TEMP_RUNS_DIR = path.join(__dirname, "..", "..", "temp_runs");
if (!fs.existsSync(TEMP_RUNS_DIR)) {
  fs.mkdirSync(TEMP_RUNS_DIR, { recursive: true });
}

export const executeCode = async (req: Request, res: Response) => {
  // Extract userId injected by authMiddleware
  const userId = (req as any).userId;
  const { code, language, input = "" } = req.body;

  // Validation
  if (!code) {
    return res.status(400).json({ message: "Code cannot be empty" });
  }

  if (!language) {
    return res.status(400).json({ message: "Language is required" });
  }

  if (language.toLowerCase() !== "c") {
    return res.status(400).json({ message: "Initially only C language is supported" });
  }

  // Create a unique temporary directory inside the workspace for this execution
  const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const runDir = path.join(TEMP_RUNS_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const sourceFile = path.join(runDir, "solution.c");
  const execFile = path.join(runDir, "solution.exe");

  try {
    // 1. Write the source code to a local file
    fs.writeFileSync(sourceFile, code, "utf8");

    // 2. Compile the C code using GCC
    // We run compile step synchronously or with spawn. exec/spawn is fine.
    // Let's spawn gcc to compile.
    const compileProcess = spawn("gcc", ["-O2", sourceFile, "-o", execFile]);

    let compileStderr = "";
    let compileStdout = "";

    compileProcess.stdout.on("data", (data) => {
      compileStdout += data.toString();
    });

    compileProcess.stderr.on("data", (data) => {
      compileStderr += data.toString();
    });

    compileProcess.on("close", async (compileCode) => {
      if (compileCode !== 0) {
        // Compile Error!
        const status = "Compile Error";
        const outputMessage = compileStderr || compileStdout || "Unknown compilation error";

        // Save submission in Supabase
        await saveSubmission(userId, "c", code, input, outputMessage, status);

        // Clean up directory
        cleanupDir(runDir);

        return res.json({
          stdout: "",
          stderr: outputMessage,
          compile_error: outputMessage,
          status,
        });
      }

      // 3. Execution Phase
      // Run the compiled executable solution.exe
      const runProcess = spawn(execFile);

      let stdoutData = "";
      let stderrData = "";
      let isTimedOut = false;

      // Impose a 5 seconds execution timeout limit
      const timeout = setTimeout(() => {
        isTimedOut = true;
        try {
          runProcess.kill("SIGKILL");
        } catch (e) {
          // ignore
        }
      }, 5000);

      // Pipe the custom stdin input to the process
      if (input) {
        runProcess.stdin.write(input);
      }
      runProcess.stdin.end();

      runProcess.stdout.on("data", (data) => {
        stdoutData += data.toString();
      });

      runProcess.stderr.on("data", (data) => {
        stderrData += data.toString();
      });

      runProcess.on("close", async (exitCode) => {
        clearTimeout(timeout);

        let status = "Success";
        let finalOutput = stdoutData;

        if (isTimedOut) {
          status = "Time Limit Exceeded";
          finalOutput = "Error: Execution timed out (Time Limit Exceeded - 5s max)";
        } else if (exitCode !== 0) {
          status = "Runtime Error";
          finalOutput = stderrData || `Runtime Error (Process exited with code ${exitCode})`;
        }

        // Save submission in Supabase
        await saveSubmission(
          userId, 
          "c", 
          code, 
          input, 
          finalOutput, 
          status
        );

        // Clean up directory
        cleanupDir(runDir);

        return res.json({
          stdout: stdoutData,
          stderr: isTimedOut ? "Execution timed out" : stderrData,
          compile_error: "",
          status,
        });
      });
    });
  } catch (error: any) {
    cleanupDir(runDir);
    return res.status(500).json({ message: "Server sandbox error: " + error.message });
  }
};

// Helper function to save run details to Supabase/PostgreSQL
const saveSubmission = async (
  userId: string,
  language: string,
  code: string,
  input: string,
  output: string,
  status: string
) => {
  try {
    await pool.query(
      `INSERT INTO submissions (user_id, language, code, input, output, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [userId, language, code, input, output, status]
    );
  } catch (err) {
    console.error("Error saving submission to database:", err);
  }
};

// Helper function to recursively remove execution directories and files
const cleanupDir = (dirPath: string) => {
  try {
    if (fs.existsSync(dirPath)) {
      // Node.js rmSync is standard in newer node versions
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(`Failed to clean up path ${dirPath}:`, err);
  }
};
