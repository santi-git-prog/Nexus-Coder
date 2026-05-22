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
  wrapUserCode,
} from "./codeWrapper";
import {
  formatArgsDisplay,
  formatOutputDisplay,
  parseLeetCodeInput,
} from "./leetcodeDisplay";
import { getSandboxMode } from "./sandbox";

const TEMP_RUNS_DIR = path.join(__dirname, "..", "..", "temp_runs");
const EXECUTABLE_NAME = process.platform === "win32" ? "solution.exe" : "solution";
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
    console.error(`Failed judge cleanup: ${dirPath}`, err);
  }
};

const compileSource = (
  runDir: string,
  source: string,
  sandboxMode: string
): Promise<{ ok: boolean; stderr: string }> => {
  const sourceFile = path.join(runDir, "solution.c");
  fs.writeFileSync(sourceFile, source, "utf8");

  if (sandboxMode === "docker") {
    const hostAbsPath = path.resolve(runDir);
    return new Promise((resolve) => {
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
      dockerCompile.stderr.on("data", (d) => {
        stderrData += d.toString();
      });
      dockerCompile.on("close", (code) => resolve({ ok: code === 0, stderr: stderrData }));
    });
  }

  const execFile = path.join(runDir, EXECUTABLE_NAME);
  return new Promise((resolve) => {
    const localCompile = spawn("gcc", ["-O2", sourceFile, "-o", execFile]);
    let stderrData = "";
    localCompile.stderr.on("data", (d) => {
      stderrData += d.toString();
    });
    localCompile.on("close", (code) => resolve({ ok: code === 0, stderr: stderrData }));
  });
};

const runBinary = (
  runDir: string,
  sandboxMode: string,
  timeoutMs: number
): Promise<RunOnceResult> => {
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
        "--entrypoint",
        "./solution",
        "gcc",
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

  const execFile = path.join(runDir, EXECUTABLE_NAME);
  return new Promise((resolve) => {
    const localRun = spawn(execFile);
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
  if (runResult.exitCode !== 0) return { status: "Runtime Error", passed: false };
  if (!outputsMatch) return { status: "Wrong Answer", passed: false };
  return { status: "Success", passed: true };
};

export const judgeSolution = async (
  userCode: string,
  testcases: TestcaseRow[],
  problem: FunctionProblemMeta,
  options?: { timeoutMs?: number }
): Promise<JudgeOutcome> => {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sandboxMode = getSandboxMode();

  if (sandboxMode === "none") {
    return {
      status: "Runtime Error",
      passed_count: 0,
      total_count: testcases.length,
      output_summary:
        "No C compiler available. Install GCC (MinGW) or Docker with the gcc image.",
      testcase_results: [],
    };
  }

  if (testcases.length === 0) {
    return {
      status: "Runtime Error",
      passed_count: 0,
      total_count: 0,
      output_summary: "No testcases defined for this problem.",
      testcase_results: [],
    };
  }

  const runId = `judge_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const runDir = path.join(TEMP_RUNS_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  let passedCount = 0;
  let submissionStatus = "Success";
  let summaryText = "";
  const resultsList: TestcaseRunResult[] = [];

  try {
    for (let i = 0; i < testcases.length; i++) {
      const tc = testcases[i];
      const source = wrapUserCode(userCode, problem, tc.input);
      const compile = await compileSource(runDir, source, sandboxMode);
      if (!compile.ok) {
        cleanupDir(runDir);
        return {
          status: "Compile Error",
          passed_count: 0,
          total_count: testcases.length,
          output_summary: compile.stderr,
          compile_error: compile.stderr,
          testcase_results: [],
        };
      }

      const runResult = await runBinary(runDir, sandboxMode, timeoutMs);
      const { status: tcStatus, passed } = evaluateTestcase(tc, runResult);

      if (tcStatus !== "Success" && submissionStatus === "Success") {
        submissionStatus = tcStatus === "Wrong Answer" ? "Wrong Answer" : tcStatus;
      }
      if (tcStatus === "Time Limit Exceeded") submissionStatus = "Time Limit Exceeded";
      if (tcStatus === "Runtime Error" && submissionStatus === "Success") {
        submissionStatus = "Runtime Error";
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
  if (run.exitCode !== 0) return `Testcase #${index + 1} crashed (Runtime Error)`;
  return `Testcase #${index + 1} failed (${status})`;
};

export const runCustomCase = async (
  userCode: string,
  problem: FunctionProblemMeta,
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
  if (sandboxMode === "none") {
    return {
      stdout: "",
      stderr: "No C compiler available.",
      compile_error: "No C compiler available.",
      status: "Compile Error",
    };
  }

  const runId = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const runDir = path.join(TEMP_RUNS_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  try {
    const normalizedInput = JSON.stringify(parseLeetCodeInput(customInput));
    const source = wrapUserCode(userCode, problem, normalizedInput);
    const compile = await compileSource(runDir, source, sandboxMode);
    if (!compile.ok) {
      return {
        stdout: "",
        stderr: compile.stderr,
        compile_error: compile.stderr,
        status: "Compile Error",
      };
    }

    const runResult = await runBinary(runDir, sandboxMode, 5000);

    if (runResult.isTimedOut) {
      return {
        stdout: "",
        stderr: "Time Limit Exceeded",
        compile_error: "",
        status: "Time Limit Exceeded",
      };
    }
    if (runResult.exitCode !== 0) {
      return {
        stdout: "",
        stderr: runResult.stderr || "Runtime Error",
        compile_error: "",
        status: "Runtime Error",
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
