import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import api from "../api/axios";
import LanguageSelector from "../components/LanguageSelector";
import CodeEditor from "../components/CodeEditor";
import InputPanel from "../components/InputPanel";
import OutputPanel from "../components/OutputPanel";
import { formatArgsDisplay, formatOutputDisplay } from "../utils/leetcodeDisplay";
import "./CodingWorkspace.css";

const STANDALONE_C_TEMPLATE = `#include <stdio.h>

int main() {
    printf("Hello, World!");
    return 0;
}
`;

type ProblemParameter = {
  name: string;
  type: string;
  sizeParam?: string;
};

type ProblemDetail = {
  id: string;
  problem_set_id: string;
  title: string;
  description: string;
  difficulty: "Easy" | "Medium" | "Hard";
  tags: string[];
  input_format: string;
  output_format: string;
  constraints: string;
  starter_code: string;
  problem_type?: string;
  function_name?: string;
  return_type?: string;
  parameters?: ProblemParameter[] | string;
};

type SampleTestcase = {
  id: string;
  input: string;
  expected_output: string;
  input_display?: string;
  expected_output_display?: string;
};

type TestcaseResult = {
  id: string;
  is_hidden: boolean;
  status: string;
  passed: boolean;
  input?: string;
  expected_output?: string;
  actual_output?: string;
  input_display?: string;
  expected_output_display?: string;
  actual_output_display?: string;
  error_message?: string;
};

type SubmissionOutcome = {
  status: string;
  passed_count: number;
  total_count: number;
  output_summary: string;
  testcase_results: TestcaseResult[];
};

export default function CodingWorkspace() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const problemId = searchParams.get("problem");

  // Authentication role check
  const [userRole, setUserRole] = useState<string>("user");

  // Core Editor states
  const [language, setLanguage] = useState<string>("c");
  const [code, setCode] = useState<string>(STANDALONE_C_TEMPLATE);
  const [input, setInput] = useState<string>("");
  const [customExpected, setCustomExpected] = useState<string>("");
  const [inputMode, setInputMode] = useState<"sample" | "custom">("sample");
  const [runPanelMode, setRunPanelMode] = useState<"console" | "testcases">("console");

  // Problem loaded states
  const [problem, setProblem] = useState<ProblemDetail | null>(null);
  const [sampleTestcases, setSampleTestcases] = useState<SampleTestcase[]>([]);
  const [loadingProblem, setLoadingProblem] = useState<boolean>(false);

  // Normal Run outputs
  const [stdout, setStdout] = useState<string>(window.localStorage.getItem("workspace_stdout") || "");
  const [stderr, setStderr] = useState<string>(window.localStorage.getItem("workspace_stderr") || "");
  const [compileError, setCompileError] = useState<string>(window.localStorage.getItem("workspace_compile_error") || "");
  const [runStatus, setRunStatus] = useState<string>(window.localStorage.getItem("workspace_status") || "Idle"); // 'Idle' | 'Running' | 'Success' | 'Compile Error' | 'Runtime Error' | 'Time Limit Exceeded'

  // LeetCode Submit outputs
  const [submission, setSubmission] = useState<SubmissionOutcome | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [showSubmitPanel, setShowSubmitPanel] = useState<boolean>(false);

  // Selected testcase result card for expanded view
  const [activeTcResultId, setActiveTcResultId] = useState<string>("");

  useEffect(() => {
    // Check if user is an admin
    api.get("/users/me")
      .then((res) => setUserRole(res.data.role))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const fetchProblemData = async () => {
      if (!problemId) {
        // standalone playground mode
        setProblem(null);
        setSampleTestcases([]);
        setCode(STANDALONE_C_TEMPLATE);
        return;
      }

      try {
        setLoadingProblem(true);
        // Fetch problem details
        const probRes = await api.get(`/problems/${problemId}`);
        setProblem(probRes.data);
        setCode(probRes.data.starter_code || STANDALONE_C_TEMPLATE);

        // Fetch sample testcases
        const testRes = await api.get(`/problems/${problemId}/sample-testcases`);
        setSampleTestcases(testRes.data);

        // Reset outputs
        setStdout("");
        setStderr("");
        setCompileError("");
        setRunStatus("Idle");
        setSubmission(null);
        setShowSubmitPanel(false);
      } catch (err: any) {
        console.error("Failed to load problem:", err);
      } finally {
        setLoadingProblem(false);
      }
    };

    fetchProblemData();
  }, [problemId]);

  const isFunctionProblem =
    problem?.problem_type?.toLowerCase() === "function" &&
    Boolean(problem.function_name && problem.return_type);

  const buildSignaturePreview = (): string => {
    if (!problem?.function_name || !problem?.return_type) return "";
    const params = Array.isArray(problem.parameters)
      ? problem.parameters
      : typeof problem.parameters === "string"
        ? (() => {
            try {
              return JSON.parse(problem.parameters);
            } catch {
              return [];
            }
          })()
        : [];
    const parts: string[] = [];
    for (const p of params) {
      const t = (p.type || "int").toLowerCase();
      if (t.endsWith("[]")) {
        const sizeName = p.sizeParam || `${p.name}Size`;
        parts.push(`${t.replace("[]", "*")} ${p.name}, int ${sizeName}`);
      } else {
        parts.push(`${t} ${p.name}`);
      }
    }
    if (problem.return_type.includes("*")) {
      parts.push("int* returnSize");
    }
    return `${problem.return_type} ${problem.function_name}(${parts.join(", ")})`;
  };

  const handleRun = async () => {
    if (!code.trim()) return;

    setRunStatus("Running");
    setStdout("");
    setStderr("");
    setCompileError("");

    let clearRunningOnly = false;

    try {
      if (problemId && problem) {
        const useFunctionCustom = isFunctionProblem && inputMode === "custom";
        const useStdioCustom = !isFunctionProblem && input.trim().length > 0;

        if (useStdioCustom) {
          setShowSubmitPanel(false);
          setRunPanelMode("console");
          const response = await api.post("/execute", { code, language, input });
          const { stdout, stderr, compile_error, status } = response.data;
          setStdout(stdout);
          setStderr(stderr);
          setCompileError(compile_error);
          setRunStatus(status);
          return;
        }

        if (useFunctionCustom && !input.trim()) {
          setShowSubmitPanel(false);
          setRunPanelMode("console");
          setRunStatus("Runtime Error");
          setStderr("Enter arguments in Custom Input (e.g. nums = [2,7], target = 9).");
          return;
        }

        if (useFunctionCustom) {
          setShowSubmitPanel(false);
          setRunPanelMode("console");
          const response = await api.post(`/problems/${problemId}/run`, {
            code,
            language,
            mode: "custom",
            custom_input: input,
            custom_expected: customExpected,
          });
          const data = response.data;
          const out = data.stdout || "";
          setStdout(isFunctionProblem ? formatOutputDisplay(out) || out : out);
          setStderr(data.stderr || "");
          setCompileError(data.compile_error || "");
          let status = data.status || "Success";
          if (data.passed === false) status = "Wrong Answer";
          setRunStatus(status);
          return;
        }

        clearRunningOnly = true;
        setSubmitting(false);
        setShowSubmitPanel(true);
        setRunPanelMode("testcases");
        setSubmission(null);

        const response = await api.post(`/problems/${problemId}/run`, {
          code,
          language,
          mode: "sample",
        });

        const data = response.data;
        setSubmission({
          status: data.status,
          passed_count: data.passed_count,
          total_count: data.total_count,
          output_summary: data.output_summary,
          testcase_results: data.testcase_results || [],
        });
        if (data.testcase_results?.length > 0) {
          const firstFailed = data.testcase_results.find((r: TestcaseResult) => !r.passed);
          setActiveTcResultId(firstFailed ? firstFailed.id : data.testcase_results[0].id);
        }
        return;
      }

      setShowSubmitPanel(false);
      setRunPanelMode("console");
      const response = await api.post("/execute", { code, language, input });
      const { stdout, stderr, compile_error, status } = response.data;
      setStdout(stdout);
      setStderr(stderr);
      setCompileError(compile_error);
      setRunStatus(status);
    } catch (err: any) {
      console.error(err);
      if (problemId && problem && !(isFunctionProblem && inputMode === "custom")) {
        showSubmitError(err.response?.data?.message || "Run failed.");
      } else {
        const data = err.response?.data;
        setRunStatus(data?.status || "Runtime Error");
        setCompileError(data?.compile_error || "");
        setStderr(data?.stderr || data?.message || "Run failed.");
      }
    } finally {
      if (clearRunningOnly) setRunStatus("Idle");
    }
  };

  const handleSubmit = async () => {
    if (!code.trim() || !problemId) return;

    setSubmitting(true);
    setShowSubmitPanel(true);
    setRunPanelMode("testcases");
    setSubmission(null);
    setRunStatus("Idle");

    try {
      const response = await api.post(`/problems/${problemId}/submit`, {
        code,
        language,
      });

      setSubmission(response.data);
      if (response.data.testcase_results && response.data.testcase_results.length > 0) {
        // Expand the first failed testcase, or the first one if all passed
        const firstFailed = response.data.testcase_results.find((r: any) => !r.passed);
        setActiveTcResultId(firstFailed ? firstFailed.id : response.data.testcase_results[0].id);
      }
    } catch (err: any) {
      console.error(err);
      showSubmitError(err.response?.data?.message || "Server error occurred during submission.");
    } finally {
      setSubmitting(false);
    }
  };

  const showSubmitError = (msg: string) => {
    setSubmission({
      status: "Runtime Error",
      passed_count: 0,
      total_count: 0,
      output_summary: msg,
      testcase_results: [],
    });
  };

  const handleClearOutput = () => {
    setStdout("");
    setStderr("");
    setCompileError("");
    setRunStatus("Idle");
    setSubmission(null);
    setShowSubmitPanel(false);
    setRunPanelMode("console");
  };

  const handleResetCode = () => {
    const defaultTemplate = problem ? problem.starter_code : STANDALONE_C_TEMPLATE;
    if (window.confirm("Are you sure you want to reset your editor? All active changes will be lost.")) {
      setCode(defaultTemplate);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const getDifficultyBadge = (diff: string) => {
    return <span className={`diff-tag-workspace ${diff.toLowerCase()}`}>{diff}</span>;
  };

  const getSubmitStatusClass = (status: string) => {
    switch (status) {
      case "Success":
        return "submit-status accepted";
      case "Wrong Answer":
        return "submit-status wrong-answer";
      case "Compile Error":
        return "submit-status compile-error";
      case "Runtime Error":
        return "submit-status runtime-error";
      case "Time Limit Exceeded":
        return "submit-status timeout";
      default:
        return "submit-status failed";
    }
  };

  return (
    <div className={`workspace-wrapper ${problem ? "split-layout" : "standalone-layout"}`}>
      {/* Sleek Top Navbar */}
      <header className="workspace-header">
        <div className="workspace-logo-area">
          <span className="logo-icon">⚡</span>
          <h1>NexusCoder IDE</h1>
          {problem && <span className="current-problem-indicator">/ {problem.title}</span>}
        </div>
        <div className="workspace-header-actions">
          <Link to="/problems" className="nav-link">Tracks</Link>
          {userRole === "admin" && (
            <Link to="/admin" className="admin-pill">Admin Dashboard</Link>
          )}
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>
      </header>

      {/* Split main layout */}
      <div className="workspace-content-pane">
        {loadingProblem ? (
          <div className="problem-loading-overlay">
            <span className="spinner"></span>
            <p>Loading problem description & testcases...</p>
          </div>
        ) : (
          <>
            {/* LEFT SIDEBAR: Problem Details (Rendered only in problem solving mode) */}
            {problem && (
              <aside className="problem-description-panel">
                <div className="problem-panel-header">
                  <h2>{problem.title}</h2>
                  <div className="problem-meta-row">
                    {getDifficultyBadge(problem.difficulty)}
                    <div className="problem-tags-row">
                      {problem.tags && problem.tags.map((tag) => (
                        <span key={tag} className="tag-pill">#{tag}</span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="problem-panel-body">
                  <div className="description-section">
                    <p className="markdown-desc">{problem.description}</p>
                  </div>

                  {problem.input_format && (
                    <div className="description-section">
                      <h4>Input Format</h4>
                      <p className="format-text">{problem.input_format}</p>
                    </div>
                  )}

                  {problem.output_format && (
                    <div className="description-section">
                      <h4>Output Format</h4>
                      <p className="format-text">{problem.output_format}</p>
                    </div>
                  )}

                  {problem.constraints && (
                    <div className="description-section">
                      <h4>Constraints</h4>
                      <pre className="constraints-block">{problem.constraints}</pre>
                    </div>
                  )}

                  {isFunctionProblem && (
                    <div className="description-section">
                      <div className="function-signature-block">
                        <h4>Function Signature</h4>
                        <pre>{buildSignaturePreview()}</pre>
                        <p className="format-text" style={{ marginTop: "0.5rem" }}>
                          Implement this function only. A hidden driver calls it with each testcase.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Public Sample Testcases */}
                  {sampleTestcases.length > 0 && (
                    <div className="description-section">
                      <h4>Sample Test Cases</h4>
                      <div className="samples-container">
                        {sampleTestcases.map((tc, idx) => (
                          <div key={tc.id} className="sample-card">
                            <div className="sample-card-header">
                              <h5>Sample Case #{idx + 1}</h5>
                            </div>
                            <div className="sample-card-body">
                              <div className="sample-io">
                                <h6>Input</h6>
                                <pre className="leetcode-io">
                                  {tc.input_display || formatArgsDisplay(tc.input)}
                                </pre>
                              </div>
                              <div className="sample-io">
                                <h6>Output</h6>
                                <pre className="leetcode-io">
                                  {tc.expected_output_display || formatOutputDisplay(tc.expected_output)}
                                </pre>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </aside>
            )}

            {/* RIGHT SIDEBAR: Code Editor & Execution Output */}
            <main className="editor-and-output-panel">
              <div className="editor-card-container">
                <div className="editor-toolbar">
                  <div className="toolbar-left">
                    <LanguageSelector
                      selectedLanguage={language}
                      onChange={setLanguage}
                    />
                    <button onClick={handleResetCode} className="reset-code-btn">
                      Reset
                    </button>
                  </div>
                  <div className="toolbar-right">
                    <button
                      onClick={handleRun}
                      disabled={runStatus === "Running" || submitting}
                      className="run-button"
                    >
                      {runStatus === "Running" ? (
                        <>
                          <span className="spinner-icon"></span>
                          Running...
                        </>
                      ) : (
                        <>
                          <span className="run-icon">▶</span>
                          {problem
                            ? isFunctionProblem && inputMode === "custom"
                              ? "Run Custom"
                              : "Run"
                            : "Run Code"}
                        </>
                      )}
                    </button>

                    {problem && (
                      <button
                        onClick={handleSubmit}
                        disabled={runStatus === "Running" || submitting}
                        className="submit-button-workspace"
                      >
                        {submitting ? (
                          <>
                            <span className="spinner-icon"></span>
                            Submitting...
                          </>
                        ) : (
                          <>
                            <span className="submit-icon">✓</span>
                            Submit
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="workspace-monaco-wrapper">
                  <CodeEditor
                    value={code}
                    onChange={setCode}
                    language={language}
                  />
                </div>
              </div>

              {/* Input + Console Split Section */}
              <section className="terminal-dock">
                {/* We render standard Stdin input panel always */}
                <div className="dock-left">
                  <InputPanel
                    value={input}
                    onChange={setInput}
                    mode={isFunctionProblem ? "function" : "stdio"}
                    inputMode={inputMode}
                    onInputModeChange={setInputMode}
                    customExpected={customExpected}
                    onCustomExpectedChange={setCustomExpected}
                  />
                </div>

                <div className="dock-right">
                  {/* Toggle rendering standard compile/run output vs. testcase submission list */}
                  {showSubmitPanel && runPanelMode === "testcases" ? (
                    <div className="output-panel">
                      <div className="panel-header output-header">
                        <span className="panel-label">
                          {submitting ? "Submission Results" : "Run Results"}
                        </span>
                        <button onClick={handleClearOutput} className="clear-btn">Clear Panel</button>
                      </div>

                      <div className="terminal-display terminal-display-scroll">
                        {submitting ? (
                          <div className="terminal-running-state">
                            <span className="spinner"></span>
                            <p className="terminal-loading-text">
                              Running against all testcases (including hidden) in secure sandbox...
                            </p>
                          </div>
                        ) : runStatus === "Running" ? (
                          <div className="terminal-running-state">
                            <span className="spinner"></span>
                            <p className="terminal-loading-text">
                              Running your code against test cases...
                            </p>
                          </div>
                        ) : submission ? (
                          <div className="submit-results-view">
                            {/* Summary Badge */}
                            <div className="submit-summary-header">
                              <div className={getSubmitStatusClass(submission.status)}>
                                {submission.status === "Success" ? "ACCEPTED" : submission.status.toUpperCase()}
                              </div>
                              <p className="submission-stats">
                                Passed <strong>{submission.passed_count}/{submission.total_count}</strong> test cases.
                              </p>
                            </div>

                            {/* List of Testcase Outcome Pills */}
                            <div className="testcase-outcome-bar">
                              {submission.testcase_results.map((r, idx) => (
                                <button
                                  key={r.id}
                                  onClick={() => setActiveTcResultId(r.id)}
                                  className={`tc-pill-btn ${r.passed ? "passed" : "failed"} ${activeTcResultId === r.id ? "active" : ""}`}
                                >
                                  Case #{idx + 1}
                                </button>
                              ))}
                            </div>

                            {/* Detailed Testcase Result Card */}
                            {submission.testcase_results.length > 0 && (
                              <div className="testcase-details-card">
                                {(() => {
                                  const tc = submission.testcase_results.find((r) => r.id === activeTcResultId);
                                  if (!tc) return null;

                                  if (tc.is_hidden) {
                                    return (
                                      <div className="hidden-testcase-card">
                                        <div className="hidden-lock-icon">🔒</div>
                                        <h5>Hidden Evaluation Case</h5>
                                        <p>
                                          Inputs and outputs of this testcase are hidden to maintain interview prep integrity.
                                        </p>
                                        <div className={`status-pill ${tc.passed ? "success" : "danger"}`}>
                                          Status: {tc.status}
                                        </div>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div className="public-testcase-card">
                                      <h5>Evaluation Case Details</h5>
                                      <div className="detail-io-block">
                                        <h6>Input</h6>
                                        <pre className="leetcode-io">
                                          {tc.input_display || formatArgsDisplay(tc.input || "")}
                                        </pre>
                                      </div>
                                      <div className="detail-io-block">
                                        <h6>Expected</h6>
                                        <pre className="leetcode-io">
                                          {tc.expected_output_display ||
                                            formatOutputDisplay(tc.expected_output || "")}
                                        </pre>
                                      </div>
                                      <div className="detail-io-block">
                                        <h6>Your Output</h6>
                                        <pre
                                          className={`leetcode-io ${tc.passed ? "stdout-green" : "stdout-red"}`}
                                        >
                                          {tc.actual_output_display ||
                                            formatOutputDisplay(tc.actual_output || "")}
                                        </pre>
                                      </div>
                                      {tc.error_message && (
                                        <div className="detail-io-block">
                                          <h6>Stderr Log:</h6>
                                          <pre className="stderr-text-box">{tc.error_message}</pre>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            )}

                            {submission.testcase_results.length === 0 && (
                              <div className="submit-error-log">
                                <pre className="terminal-content compile-error-text">
                                  {submission.output_summary}
                                </pre>
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <OutputPanel
                      stdout={stdout}
                      stderr={stderr}
                      compileError={compileError}
                      status={runStatus}
                      onClear={handleClearOutput}
                    />
                  )}
                </div>
              </section>
            </main>
          </>
        )}
      </div>
    </div>
  );
}
