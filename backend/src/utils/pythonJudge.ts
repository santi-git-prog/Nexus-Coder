import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import {
  FunctionProblemMeta,
  JudgeOutcome,
  TestcaseRow,
  TestcaseRunResult,
} from "../types/problem";
import {
  normalizeActualOutput,
  normalizeExpectedOutput,
} from "./codeWrapper";
import {
  formatArgsDisplay,
  formatOutputDisplay,
  parseLeetCodeInput,
} from "./leetcodeDisplay";
import { getSandboxMode } from "./sandbox";
import { wrapPythonUserCode } from "./pythonWrapper";

const TEMP_RUNS_DIR = path.join(__dirname, "..", "..", "temp_runs");
const DEFAULT_TIMEOUT_MS = 2000;

if (!fs.existsSync(TEMP_RUNS_DIR)) {
  fs.mkdirSync(TEMP_RUNS_DIR, { recursive: true });
}

type RunOnceResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  isTimedOut: boolean;
};

const cleanupDir = (dirPath: string) => {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  } catch (err) {
    console.error(`Failed python judge cleanup: ${dirPath}`, err);
  }
};

const runPythonScript = (
  runDir: string,
  source: string,
  sandboxMode: string,
  timeoutMs: number
): Promise<RunOnceResult> => {
  const sourceFile = path.join(runDir, "solution.py");
  fs.writeFileSync(sourceFile, source, "utf8");

  if (sandboxMode === "docker") {
    const hostAbsPath = path.resolve(runDir);
    return new Promise((resolve) => {
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
        "python:3.10-slim",
        "python",
        "solution.py",
      ]);
      let stdoutData = "";
      let stderrData = "";
      let isTimedOut = false;
      const timeout = setTimeout(() => {
        isTimedOut = true;
        try {
          dockerRun.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }, timeoutMs);
      dockerRun.stdin.end();
      dockerRun.stdout.on("data", (d) => {
        stdoutData += d.toString();
      });
      dockerRun.stderr.on("data", (d) => {
        stderrData += d.toString();
      });
      dockerRun.on("close", (code) => {
        clearTimeout(timeout);
        resolve({
          exitCode: code ?? 0,
          stdout: stdoutData,
          stderr: stderrData,
          isTimedOut,
        });
      });
    });
  }

  return new Promise((resolve) => {
    // Assuming python is in PATH
    const pythonCmd = process.platform === "win32" ? "python" : "python3";
    const localRun = spawn(pythonCmd, [sourceFile]);
    let stdoutData = "";
    let stderrData = "";
    let isTimedOut = false;
    const timeout = setTimeout(() => {
      isTimedOut = true;
      try {
        localRun.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, timeoutMs);
    localRun.stdin.end();
    localRun.stdout.on("data", (d) => {
      stdoutData += d.toString();
    });
    localRun.stderr.on("data", (d) => {
      stderrData += d.toString();
    });
    localRun.on("close", (code) => {
      clearTimeout(timeout);
      resolve({
        exitCode: code ?? 0,
        stdout: stdoutData,
        stderr: stderrData,
        isTimedOut,
      });
    });
  });
};

const evaluateTestcase = (
  tc: TestcaseRow,
  runResult: RunOnceResult
): { status: string; passed: boolean } => {
  const normalizedOutput = normalizeActualOutput(runResult.stdout);
  const normalizedExpected = normalizeExpectedOutput(tc.expected_output);
  const outputsMatch = normalizedOutput === normalizedExpected;

  if (runResult.isTimedOut) return { status: "Time Limit Exceeded", passed: false };
  
  if (runResult.exitCode !== 0) {
      if (runResult.stderr.includes("SyntaxError") || runResult.stderr.includes("IndentationError")) {
          return { status: "Syntax Error", passed: false };
      }
      return { status: "Runtime Error", passed: false };
  }
  
  if (!outputsMatch) return { status: "Wrong Answer", passed: false };
  return { status: "Success", passed: true };
};

const buildResultRow = (
  tc: TestcaseRow,
  passed: boolean,
  tcStatus: string,
  runResult: RunOnceResult
): TestcaseRunResult => ({
  id: tc.id,
  is_hidden: tc.is_hidden,
  status: tcStatus,
  passed,
  input: tc.is_hidden ? undefined : tc.input,
  expected_output: tc.is_hidden ? undefined : tc.expected_output,
  actual_output: tc.is_hidden ? undefined : runResult.stdout,
  input_display: tc.is_hidden ? undefined : formatArgsDisplay(tc.input),
  expected_output_display: tc.is_hidden ? undefined : formatOutputDisplay(tc.expected_output),
  actual_output_display: tc.is_hidden ? undefined : formatOutputDisplay(runResult.stdout),
  error_message: tc.is_hidden
    ? undefined
    : runResult.isTimedOut
      ? "Time Limit Exceeded"
      : runResult.stderr,
});

const failureSummary = (index: number, run: RunOnceResult, status: string): string => {
  if (run.isTimedOut) return `Testcase #${index + 1} timed out (Time Limit Exceeded)`;
  if (run.exitCode !== 0) return `Testcase #${index + 1} crashed (${status})`;
  return `Testcase #${index + 1} failed (${status})`;
};

export const judgePythonSolution = async (
  userCode: string,
  testcases: TestcaseRow[],
  meta: FunctionProblemMeta,
  pythonConfig: any,
  options?: { timeoutMs?: number }
): Promise<JudgeOutcome> => {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sandboxMode = getSandboxMode();

  if (testcases.length === 0) {
    return {
      status: "Runtime Error",
      passed_count: 0,
      total_count: 0,
      output_summary: "No testcases defined for this problem.",
      testcase_results: [],
    };
  }

  const runId = `judge_py_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const runDir = path.join(TEMP_RUNS_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  let passedCount = 0;
  let submissionStatus = "Success";
  let summaryText = "";
  const resultsList: TestcaseRunResult[] = [];

  try {
    for (let i = 0; i < testcases.length; i++) {
      const tc = testcases[i];
      const source = wrapPythonUserCode(userCode, meta, tc.input, pythonConfig);
      
      const runResult = await runPythonScript(runDir, source, sandboxMode, timeoutMs);
      const { status: tcStatus, passed } = evaluateTestcase(tc, runResult);

      if (tcStatus !== "Success" && submissionStatus === "Success") {
        submissionStatus = tcStatus === "Wrong Answer" ? "Wrong Answer" : tcStatus;
      }
      if (tcStatus === "Time Limit Exceeded") submissionStatus = "Time Limit Exceeded";
      if ((tcStatus === "Runtime Error" || tcStatus === "Syntax Error") && submissionStatus === "Success") {
        submissionStatus = tcStatus;
      }
      if (passed) passedCount++;

      resultsList.push(buildResultRow(tc, passed, tcStatus, runResult));
      if (!passed && !summaryText) summaryText = failureSummary(i, runResult, tcStatus);
    }

    if (passedCount === testcases.length) {
      submissionStatus = "Success";
      summaryText = "All testcases passed!";
    }

    return {
      status: submissionStatus,
      passed_count: passedCount,
      total_count: testcases.length,
      output_summary: summaryText,
      testcase_results: resultsList,
    };
  } finally {
    cleanupDir(runDir);
  }
};

export const runCustomPythonCase = async (
  userCode: string,
  meta: FunctionProblemMeta,
  pythonConfig: any,
  customInput: string,
  customExpected?: string
): Promise<{
  stdout: string;
  stderr: string;
  compile_error: string;
  status: string;
  passed?: boolean;
  expected_output?: string;
}> => {
  const sandboxMode = getSandboxMode();

  const runId = `custom_py_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const runDir = path.join(TEMP_RUNS_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  try {
    const normalizedInput = JSON.stringify(parseLeetCodeInput(customInput));
    const source = wrapPythonUserCode(userCode, meta, normalizedInput, pythonConfig);

    const runResult = await runPythonScript(runDir, source, sandboxMode, 5000);

    if (runResult.isTimedOut) {
      return {
        stdout: "",
        stderr: "Time Limit Exceeded",
        compile_error: "",
        status: "Time Limit Exceeded",
      };
    }
    
    if (runResult.exitCode !== 0) {
      const isSyntax = runResult.stderr.includes("SyntaxError") || runResult.stderr.includes("IndentationError");
      return {
        stdout: "",
        stderr: runResult.stderr || "Runtime Error",
        compile_error: "",
        status: isSyntax ? "Syntax Error" : "Runtime Error",
      };
    }

    let passed: boolean | undefined;
    if (customExpected !== undefined && customExpected.trim() !== "") {
      const normalizedOutput = normalizeActualOutput(runResult.stdout);
      const normalizedExpected = normalizeExpectedOutput(customExpected);
      passed = normalizedOutput === normalizedExpected;
    }

    return {
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      compile_error: "",
      status: passed === false ? "Wrong Answer" : "Success",
      passed,
      expected_output: customExpected,
    };
  } finally {
    cleanupDir(runDir);
  }
};

export const runPlaygroundPython = async (
  userCode: string,
  stdinData: string,
  timeoutMs = 5000
): Promise<{
  stdout: string;
  stderr: string;
  compile_error: string;
  status: string;
}> => {
  const sandboxMode = getSandboxMode();

  const runId = `playground_py_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const runDir = path.join(TEMP_RUNS_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  try {
    const sourceFile = path.join(runDir, "solution.py");
    fs.writeFileSync(sourceFile, userCode, "utf8");

    const runResult = await new Promise<RunOnceResult>((resolve) => {
      let proc;
      if (sandboxMode === "docker") {
          const hostAbsPath = path.resolve(runDir);
          proc = spawn("docker", [
            "run", "--rm", "-i", "--memory=128m", "--cpus=0.5",
            "-v", `${hostAbsPath}:/workspace`, "-w", "/workspace",
            "python:3.10-slim", "python", "solution.py"
          ]);
      } else {
          const pythonCmd = process.platform === "win32" ? "python" : "python3";
          proc = spawn(pythonCmd, [sourceFile]);
      }
      
      let stdoutData = "";
      let stderrData = "";
      let isTimedOut = false;

      const timeout = setTimeout(() => {
        isTimedOut = true;
        try { proc.kill("SIGKILL"); } catch { /* ignore */ }
      }, timeoutMs);

      proc.stdout.on("data", (d: any) => { stdoutData += d.toString(); });
      proc.stderr.on("data", (d: any) => { stderrData += d.toString(); });

      proc.on("close", (code: number | null) => {
        clearTimeout(timeout);
        resolve({ exitCode: code ?? 0, stdout: stdoutData, stderr: stderrData, isTimedOut });
      });

      if (stdinData) {
        proc.stdin.write(stdinData);
      }
      proc.stdin.end();
    });

    if (runResult.isTimedOut) {
      return { stdout: "", stderr: "Time Limit Exceeded", compile_error: "", status: "Time Limit Exceeded" };
    }
    if (runResult.exitCode !== 0) {
      return { stdout: "", stderr: runResult.stderr || "Runtime Error", compile_error: "", status: "Runtime Error" };
    }

    return {
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      compile_error: "",
      status: "Success",
    };
  } finally {
    cleanupDir(runDir);
  }
};
