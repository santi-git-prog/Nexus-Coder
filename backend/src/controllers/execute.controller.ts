import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { pool } from "../config/db";
import { getSandboxMode, isCompileErrorOutput } from "../utils/sandbox";

const TEMP_RUNS_DIR = path.join(__dirname, "..", "..", "temp_runs");
if (!fs.existsSync(TEMP_RUNS_DIR)) {
  fs.mkdirSync(TEMP_RUNS_DIR, { recursive: true });
}

const EXECUTABLE_NAME = process.platform === "win32" ? "solution.exe" : "solution";

export const executeCode = async (req: Request, res: Response) => {
  const userId = (req as any).userId;
  const { code, language, input = "" } = req.body;

  if (!code) {
    return res.status(400).json({ message: "Code cannot be empty" });
  }

  if (!language) {
    return res.status(400).json({ message: "Language is required" });
  }

  if (language.toLowerCase() !== "c") {
    return res.status(400).json({ message: "Currently only C language is supported" });
  }

  const runId = `run_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const runDir = path.join(TEMP_RUNS_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const sourceFile = path.join(runDir, "solution.c");
  fs.writeFileSync(sourceFile, code, "utf8");

  const sandboxMode = getSandboxMode();
  console.log(`Code Execution Triggered: Sandbox Mode = ${sandboxMode}`);

  if (sandboxMode === "none") {
    cleanupDir(runDir);
    return res.status(503).json({
      message:
        "No C compiler available. Install GCC (MinGW) on the server, or install Docker and pull the gcc image.",
      stdout: "",
      stderr:
        "No C compiler available. Install GCC (MinGW) on the server, or install Docker and pull the gcc image.",
      compile_error:
        "No C compiler available. Install GCC (MinGW) on the server, or install Docker and pull the gcc image.",
      status: "Compile Error",
    });
  }

  if (sandboxMode === "docker") {
    return runInDocker(res, { userId, code, input, runDir, sourceFile });
  }

  return runLocally(res, { userId, code, input, runDir, sourceFile });
};

type RunContext = {
  userId: string;
  code: string;
  input: string;
  runDir: string;
  sourceFile: string;
};

const runInDocker = (res: Response, ctx: RunContext) => {
  const { userId, code, input, runDir } = ctx;
  const hostAbsPath = path.resolve(runDir);

  const dockerProcess = spawn("docker", [
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
    "sh",
    "gcc",
    "-c",
    "gcc -O2 solution.c -o solution && ./solution",
  ]);

  let stdoutData = "";
  let stderrData = "";
  let isTimedOut = false;
  let responded = false;

  const finish = async (
    status: string,
    stdout: string,
    stderr: string,
    compileError: string
  ) => {
    if (responded) return;
    responded = true;
    void saveSubmission(userId, "c", code, input, stdout || stderr || compileError, status);
    cleanupDir(runDir);
    return res.json({
      stdout,
      stderr,
      compile_error: compileError,
      status,
    });
  };

  const timeout = setTimeout(() => {
    isTimedOut = true;
    try {
      dockerProcess.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }, 5000);

  dockerProcess.on("error", () => {
    clearTimeout(timeout);
    if (responded) return;
    console.warn("Docker execution failed; falling back to local GCC.");
    return runLocally(res, ctx);
  });

  if (input) {
    dockerProcess.stdin.write(input);
  }
  dockerProcess.stdin.end();

  dockerProcess.stdout.on("data", (data) => {
    stdoutData += data.toString();
  });

  dockerProcess.stderr.on("data", (data) => {
    stderrData += data.toString();
  });

  dockerProcess.on("close", async (exitCode) => {
    clearTimeout(timeout);
    if (responded) return;

    if (isTimedOut) {
      return finish(
        "Time Limit Exceeded",
        "Error: Execution timed out (Time Limit Exceeded - 5s max)",
        "Execution timed out",
        ""
      );
    }

    if (exitCode !== 0) {
      if (isCompileErrorOutput(stderrData, stdoutData)) {
        return finish("Compile Error", "", "", stderrData);
      }
      return finish(
        "Runtime Error",
        "",
        stderrData || `Runtime Error (Process exited with code ${exitCode})`,
        ""
      );
    }

    return finish("Success", stdoutData, "", "");
  });
};

const runLocally = (res: Response, ctx: RunContext) => {
  const { userId, code, input, runDir, sourceFile } = ctx;
  const execFile = path.join(runDir, EXECUTABLE_NAME);

  const compileProcess = spawn("gcc", ["-O2", sourceFile, "-o", execFile]);
  let compileStderr = "";
  let responded = false;

  const respondOnce = (payload: Parameters<Response["json"]>[0], statusCode = 200) => {
    if (responded) return;
    responded = true;
    cleanupDir(runDir);
    return res.status(statusCode).json(payload);
  };

  compileProcess.on("error", (err: any) => {
    const errorMsg =
      err.code === "ENOENT"
        ? "GCC compiler not found on this system. Please install GCC (MinGW) or start Docker Desktop with the gcc image."
        : `Failed to start compiler: ${err.message}`;
    void saveSubmission(userId, "c", code, input, errorMsg, "Compile Error");
    return respondOnce({
      stdout: "",
      stderr: errorMsg,
      compile_error: errorMsg,
      status: "Compile Error",
    }, 500);
  });

  compileProcess.stderr.on("data", (data) => {
    compileStderr += data.toString();
  });

  compileProcess.on("close", (compileCode) => {
    if (compileCode !== 0) {
      void saveSubmission(userId, "c", code, input, compileStderr, "Compile Error");
      return respondOnce({
        stdout: "",
        stderr: compileStderr,
        compile_error: compileStderr,
        status: "Compile Error",
      });
    }

    const runProcess = spawn(execFile);
    let stdoutData = "";
    let stderrData = "";
    let isTimedOut = false;

    runProcess.on("error", async (err: any) => {
      return respondOnce({
        stdout: "",
        stderr: `Failed to run compiled program: ${err.message}`,
        compile_error: "",
        status: "Runtime Error",
      }, 500);
    });

    const timeout = setTimeout(() => {
      isTimedOut = true;
      try {
        runProcess.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, 5000);

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

    runProcess.on("close", (exitCode) => {
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

      void saveSubmission(userId, "c", code, input, finalOutput, status);

      return respondOnce({
        stdout: stdoutData,
        stderr: isTimedOut ? "Execution timed out" : stderrData,
        compile_error: "",
        status,
      });
    });
  });
};

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
    console.error("Error saving submission in DB:", err);
  }
};

const cleanupDir = (dirPath: string) => {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(`Failed cleanup: ${dirPath}`, err);
  }
};
