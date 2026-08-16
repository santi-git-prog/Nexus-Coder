import { useState, useEffect } from "react";
import { useAuth } from "../auth/AuthContext";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import api from "../api/axios";
import LanguageSelector from "../components/LanguageSelector";
import CodeEditor from "../components/CodeEditor";
import InputPanel from "../components/InputPanel";
import OutputPanel from "../components/OutputPanel";
import {
  formatArgsDisplay,
  formatOutputDisplay,
  stripEditorIncludes,
} from "../utils/leetcodeDisplay";
import "./CodingWorkspace.css";
import { renderMarkdown } from "../utils/markdown";

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
  language_configs?: any;
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

  // Detect playground mode (no problem)
  const isPlayground = !problemId;

  const DEFAULT_PLAYGROUND_CODE_C = `#include <stdio.h>

int main() {
    printf("Hello, World!\\n");
    return 0;
}`;
  const DEFAULT_PLAYGROUND_CODE_PY = `print("Hello, World!")`;

  // Core Editor states
  const [language, setLanguage] = useState<string>("c");
  const [codeMap, setCodeMap] = useState<Record<string, string>>({
    c: isPlayground ? DEFAULT_PLAYGROUND_CODE_C : "",
    python: isPlayground ? DEFAULT_PLAYGROUND_CODE_PY : ""
  });
  
  const code = codeMap[language] || "";
  const setCode = (newCode: string) => setCodeMap(prev => ({ ...prev, [language]: newCode }));
  const [input, setInput] = useState<string>("");
  const [customExpected, setCustomExpected] = useState<string>("");
  const [inputMode, setInputMode] = useState<"sample" | "custom">(isPlayground ? "custom" : "sample");
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

  // AI assistant states
  const [isAiOpen, setIsAiOpen] = useState<boolean>(false);
  const [aiTab, setAiTab] = useState<"overview" | "hints">("overview");
  const [reviewContent, setReviewContent] = useState<string>("");
  const [loadingReview, setLoadingReview] = useState<boolean>(false);
  
  const [hintHistory, setHintHistory] = useState<Array<{ prompt: string; response: string }>>([]);
  const [remainingHints, setRemainingHints] = useState<number>(5);
  const [promptInput, setPromptInput] = useState<string>("");
  const [loadingHint, setLoadingHint] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string>("");

  useEffect(() => {
    // Check if user is an admin
    api.get("/users/me")
      .then((res) => setUserRole(res.data.role))
      .catch(() => {});
  }, []);

  // Fetch AI hints history and remaining hint count when problem changes
  useEffect(() => {
    const fetchAiHistory = async () => {
      if (!problemId || isPlayground) {
        setHintHistory([]);
        setRemainingHints(5);
        return;
      }
      try {
        const res = await api.get(`/problems/${problemId}/ai-hints`);
        setHintHistory(res.data.history || []);
        setRemainingHints(res.data.remainingHints ?? 5);
      } catch (err) {
        console.error("Failed to fetch AI hints history:", err);
      }
    };
    fetchAiHistory();
  }, [problemId, isPlayground]);

  const handleGetAiOverview = async () => {
    if (!code.trim()) return;
    setLoadingReview(true);
    setAiError("");
    try {
      const endpoint = isPlayground ? "/playground/ai-overview" : `/problems/${problemId}/ai-overview`;
      const response = await api.post(endpoint, {
        code,
        language,
      });
      setReviewContent(response.data.review);
    } catch (err: any) {
      console.error(err);
      setAiError(err.response?.data?.message || "Failed to load AI review. Please make sure GROQ_API_KEY is configured in the backend .env file.");
    } finally {
      setLoadingReview(false);
    }
  };

  const handleSendAiPrompt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim() || loadingHint || remainingHints <= 0) return;
    
    const userPrompt = promptInput;
    setPromptInput("");
    setLoadingHint(true);
    setAiError("");

    // Optimistically add to history with a thinking loader
    const tempHistory = [...hintHistory, { prompt: userPrompt, response: "Thinking..." }];
    setHintHistory(tempHistory);

    try {
      const response = await api.post(`/problems/${problemId}/ai-hint`, {
        prompt: userPrompt,
        language: language,
      });
      setHintHistory([
        ...hintHistory,
        { prompt: userPrompt, response: response.data.response }
      ]);
      setRemainingHints(response.data.remainingHints);
    } catch (err: any) {
      console.error(err);
      // Revert optimism on error
      setHintHistory(hintHistory);
      setAiError(err.response?.data?.message || "Failed to get AI hint. Please try again.");
    } finally {
      setLoadingHint(false);
    }
  };

  // No redirect for playground mode — it's a valid route

  useEffect(() => {
    const fetchProblemData = async () => {
      if (!problemId) return;

      try {
        setLoadingProblem(true);
        // Fetch problem details
        const probRes = await api.get(`/problems/${problemId}`);
        setProblem(probRes.data);
        const starterC = probRes.data.starter_code || "";
        const starterPy = probRes.data.language_configs?.python?.python_starter_code || "";
        setCodeMap({
          c: stripEditorIncludes(starterC) || starterC,
          python: starterPy
        });
        
        // Fallback to C if Python is selected but not supported
        if (!starterPy && language === "python") {
          setLanguage("c");
        }

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

  const handleRun = async () => {
    if (!code.trim()) return;

    setRunStatus("Running");
    setStdout("");
    setStderr("");
    setCompileError("");

    let clearRunningOnly = false;

    try {
      // ── Playground mode: just compile & run raw code with stdin ──
      if (isPlayground) {
        setShowSubmitPanel(false);
        setRunPanelMode("console");
        const response = await api.post("/run-playground", {
          code,
          language,
          stdin: input,
        });
        const data = response.data;
        setStdout(data.stdout || "");
        setStderr(data.stderr || "");
        setCompileError(data.compile_error || "");
        setRunStatus(data.status || "Success");
        return;
      }

      if (inputMode === "custom") {
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
        setStdout(formatOutputDisplay(out) || out);
        setStderr(data.stderr || "");
        setCompileError(data.compile_error || "");
        setRunStatus(data.passed === false ? "Wrong Answer" : data.status || "Success");
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
    } catch (err: any) {
      console.error(err);
      if (inputMode === "custom") {
        const data = err.response?.data;
        setRunStatus(data?.status || "Runtime Error");
        setCompileError(data?.compile_error || "");
        setStderr(data?.stderr || data?.message || "Run failed.");
      } else {
        showSubmitError(err.response?.data?.message || "Run failed.");
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
    let raw = "";
    if (language === "python") {
      raw = problem?.language_configs?.python?.python_starter_code || "";
    } else {
      raw = problem?.starter_code || "";
    }
    const defaultTemplate = language === "c" ? (stripEditorIncludes(raw) || raw) : raw;
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
    <div className={`workspace-wrapper ${isPlayground ? "playground-layout" : "split-layout"}`}>
      {/* Sleek Top Navbar */}
      <header className="workspace-header">
        <div className="workspace-logo-area">
          <span className="logo-icon">⚡</span>
          <h1>NexusCoder IDE</h1>
          {problem && <span className="current-problem-indicator">/ {problem.title}</span>}
          {isPlayground && <span className="current-problem-indicator">/ Online Compiler</span>}
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
        {!isPlayground && (loadingProblem || !problem) ? (
          <div className="problem-loading-overlay">
            <span className="spinner"></span>
            <p>Loading problem...</p>
          </div>
        ) : (
          <>
            {/* Problem description panel — hidden in playground mode */}
            {!isPlayground && problem && (
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

                  {problem.constraints && (
                    <div className="description-section">
                      <h4>Constraints</h4>
                      <pre className="constraints-block">{problem.constraints}</pre>
                    </div>
                  )}

                  {sampleTestcases.length > 0 && (
                    <div className="description-section examples-section">
                      <h4>Examples</h4>
                      <div className="examples-list">
                        {sampleTestcases.map((tc, idx) => (
                          <div key={tc.id} className="leetcode-example">
                            <p className="example-heading">Example {idx + 1}:</p>
                            <p className="example-line">
                              <strong>Input:</strong>{" "}
                              <code>
                                {tc.input_display || formatArgsDisplay(tc.input)}
                              </code>
                            </p>
                            <p className="example-line">
                              <strong>Output:</strong>{" "}
                              <code>
                                {tc.expected_output_display ||
                                  formatOutputDisplay(tc.expected_output)}
                              </code>
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </aside>
            )}

            {/* Code editor & results */}
            <main className="editor-and-output-panel">
              <div className="editor-card-container">
                <div className="editor-toolbar">
                  <div className="toolbar-left">
                    <LanguageSelector
                      selectedLanguage={language}
                      onChange={setLanguage}
                      availableLanguages={isPlayground || !!problem?.language_configs?.python?.python_starter_code ? ["c", "python"] : ["c"]}
                    />
                    <button onClick={handleResetCode} className="reset-code-btn">
                      Reset
                    </button>
                  </div>
                  <div className="toolbar-right">
                    <button
                      onClick={() => setIsAiOpen(!isAiOpen)}
                      className={`ai-assistant-toggle-btn ${isAiOpen ? "active" : ""}`}
                    >
                      <span className="ai-icon">✨</span>
                      Ask Nexai
                      {!isPlayground && (
                        <span className="ai-badge">
                          {remainingHints}/5 left
                        </span>
                      )}
                    </button>

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
                          {inputMode === "custom" ? "Run" : "Run"}
                        </>
                      )}
                    </button>

                    {problem && !isPlayground && (
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
                <div className="dock-left">
                  <InputPanel
                    value={input}
                    onChange={setInput}
                    inputMode={inputMode}
                    onInputModeChange={isPlayground ? undefined : setInputMode}
                    customExpected={customExpected}
                    onCustomExpectedChange={setCustomExpected}
                    sampleTestcases={sampleTestcases}
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
                            <p className="terminal-loading-text">Submitting...</p>
                          </div>
                        ) : runStatus === "Running" ? (
                          <div className="terminal-running-state">
                            <span className="spinner"></span>
                            <p className="terminal-loading-text">Running...</p>
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
                                        <p className="hidden-case-title">🔒 Hidden test case</p>
                                        <div className={`status-pill ${tc.passed ? "success" : "danger"}`}>
                                          {tc.passed ? "Passed" : tc.status}
                                        </div>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div className="public-testcase-card">
                                      <p className="example-line">
                                        <strong>Input:</strong>{" "}
                                        <code>
                                          {tc.input_display || formatArgsDisplay(tc.input || "")}
                                        </code>
                                      </p>
                                      <p className="example-line">
                                        <strong>Expected:</strong>{" "}
                                        <code>
                                          {tc.expected_output_display ||
                                            formatOutputDisplay(tc.expected_output || "")}
                                        </code>
                                      </p>
                                      <p className="example-line">
                                        <strong>Output:</strong>{" "}
                                        <code className={tc.passed ? "stdout-green" : "stdout-red"}>
                                          {tc.actual_output_display ||
                                            formatOutputDisplay(tc.actual_output || "")}
                                        </code>
                                      </p>
                                      {tc.error_message && (
                                        <pre className="stderr-text-box">{tc.error_message}</pre>
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

            {/* Sliding AI Sidebar */}
            <aside className={`ai-sidebar ${isAiOpen ? "open" : ""}`}>
              <div className="ai-sidebar-header">
                <h3>✨ Nexai</h3>
                <button className="ai-sidebar-close" onClick={() => setIsAiOpen(false)}>✕</button>
              </div>
              
              <div className="ai-sidebar-tabs">
                <button 
                  className={`ai-tab-btn ${aiTab === "overview" ? "active" : ""}`}
                  onClick={() => setAiTab("overview")}
                >
                  Code Overview
                </button>
                {!isPlayground && (
                  <button 
                    className={`ai-tab-btn ${aiTab === "hints" ? "active" : ""}`}
                    onClick={() => setAiTab("hints")}
                  >
                    Ask Nexai ({remainingHints}/5 left)
                  </button>
                )}
              </div>
              
              <div className="ai-sidebar-content">
                {aiError && (
                  <div className="ai-error-box">
                    <span className="ai-error-icon">⚠️</span>
                    <p>{aiError}</p>
                  </div>
                )}
                
                {aiTab === "overview" ? (
                  <div className="ai-overview-tab-content">
                    <div className="ai-action-card">
                      <p>Get a comprehensive review of your code's correctness, efficiency, logic, and view the optimal implementation.</p>
                      <button 
                        onClick={handleGetAiOverview}
                        disabled={loadingReview || !code.trim()}
                        className="ai-action-btn"
                      >
                        {loadingReview ? "Analyzing Code..." : "Analyze Current Code"}
                      </button>
                    </div>
                    
                    {loadingReview && (
                      <div className="ai-loading-state">
                        <span className="spinner"></span>
                        <p>Groq AI is reviewing your code...</p>
                      </div>
                    )}
                    
                    {reviewContent && !loadingReview && (
                      <div className="ai-review-result">
                        {renderMarkdown(reviewContent)}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="ai-hints-tab-content">
                    <div className="ai-chat-history">
                      {hintHistory.length === 0 ? (
                        <div className="ai-chat-empty">
                          <p>Ask Nexai for conceptual hints or approach strategies! Nexai won't write code for you, but will guide you to think and write code yourself.</p>
                          <span className="hint-limit-notice">You have {remainingHints}/5 hints left.</span>
                        </div>
                      ) : (
                        hintHistory.map((chat, idx) => (
                          <div key={idx} className="ai-chat-message-pair">
                            <div className="ai-chat-bubble user">
                              <span className="bubble-label">You</span>
                              <p>{chat.prompt}</p>
                            </div>
                            <div className="ai-chat-bubble assistant">
                              <span className="bubble-label">Nexai</span>
                              <div className="bubble-content">
                                {chat.response === "Thinking..." ? (
                                  <div className="ai-thinking-dots">
                                    <span className="dot"></span>
                                    <span className="dot"></span>
                                    <span className="dot"></span>
                                  </div>
                                ) : (
                                  renderMarkdown(chat.response)
                                )}
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                      {loadingHint && hintHistory[hintHistory.length - 1]?.response !== "Thinking..." && (
                        <div className="ai-chat-bubble assistant">
                          <span className="bubble-label">Nexai</span>
                          <div className="ai-thinking-dots">
                            <span className="dot"></span>
                            <span className="dot"></span>
                            <span className="dot"></span>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <form onSubmit={handleSendAiPrompt} className="ai-chat-input-area">
                      <input
                        type="text"
                        placeholder={remainingHints > 0 ? "Ask a question about the problem..." : "No hints left for this problem"}
                        value={promptInput}
                        onChange={(e) => setPromptInput(e.target.value)}
                        disabled={loadingHint || remainingHints <= 0}
                        className="ai-chat-input"
                      />
                      <button 
                        type="submit" 
                        disabled={loadingHint || !promptInput.trim() || remainingHints <= 0}
                        className="ai-chat-send-btn"
                      >
                        Send
                      </button>
                    </form>
                    <div className="ai-hints-footer">
                      <span>{remainingHints}/5 left</span>
                    </div>
                  </div>
                )}
              </div>
            </aside>
          </>
        )}
      </div>
    </div>
  );
}
