import { useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { useNavigate, Link } from "react-router-dom";
import api from "../api/axios";
import LanguageSelector from "../components/LanguageSelector";
import CodeEditor from "../components/CodeEditor";
import InputPanel from "../components/InputPanel";
import OutputPanel from "../components/OutputPanel";
import "./CodingWorkspace.css";

const DEFAULT_C_TEMPLATE = `#include <stdio.h>

int main() {
    printf("Hello, World!");
    return 0;
}
`;

export default function CodingWorkspace() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  // Code state
  const [language, setLanguage] = useState<string>("c");
  const [code, setCode] = useState<string>(DEFAULT_C_TEMPLATE);
  const [input, setInput] = useState<string>("");

  // Running & Output states
  const [stdout, setStdout] = useState<string>("");
  const [stderr, setStderr] = useState<string>("");
  const [compileError, setCompileError] = useState<string>("");
  const [status, setStatus] = useState<string>("Idle"); // 'Idle' | 'Running' | 'Success' | 'Compile Error' | 'Runtime Error' | 'Time Limit Exceeded'

  const handleRun = async () => {
    if (!code.trim()) return;

    setStatus("Running");
    setStdout("");
    setStderr("");
    setCompileError("");

    try {
      const response = await api.post("/execute", {
        code,
        language,
        input,
      });

      const { stdout, stderr, compile_error, status: runStatus } = response.data;

      setStdout(stdout);
      setStderr(stderr);
      setCompileError(compile_error);
      setStatus(runStatus);
    } catch (err: any) {
      console.error(err);
      setStatus("Runtime Error");
      setStderr(err.response?.data?.message || "An unexpected error occurred during execution.");
    }
  };

  const handleClearOutput = () => {
    setStdout("");
    setStderr("");
    setCompileError("");
    setStatus("Idle");
  };

  const handleResetCode = () => {
    if (window.confirm("Are you sure you want to reset your code to the default C template? All changes will be lost.")) {
      setCode(DEFAULT_C_TEMPLATE);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <div className="workspace-container">
      {/* Sleek Top Navigation Navbar */}
      <header className="workspace-header">
        <div className="workspace-logo-area">
          <span className="logo-icon">⚡</span>
          <h1>NexusCoder IDE</h1>
        </div>
        <div className="workspace-header-actions">
          <Link to="/problems" className="nav-link">Problems</Link>
          <Link to="/dashboard" className="nav-link">Dashboard</Link>
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>
      </header>

      {/* Main split-screen panel layout */}
      <main className="workspace-main">
        {/* Left Side: Editor Section */}
        <section className="editor-panel-wrapper">
          <div className="editor-toolbar">
            <div className="toolbar-left">
              <LanguageSelector
                selectedLanguage={language}
                onChange={setLanguage}
              />
              <button onClick={handleResetCode} className="reset-code-btn">
                Reset Template
              </button>
            </div>
            <div className="toolbar-right">
              <button
                onClick={handleRun}
                disabled={status === "Running"}
                className="run-button"
              >
                {status === "Running" ? (
                  <>
                    <span className="spinner-icon"></span>
                    Running...
                  </>
                ) : (
                  <>
                    <span className="run-icon">▶</span>
                    Run Code
                  </>
                )}
              </button>
            </div>
          </div>

          <CodeEditor
            value={code}
            onChange={setCode}
            language={language}
          />
        </section>

        {/* Right Side: Split Input (stdin) and Terminal Output */}
        <section className="sidebar-panels-wrapper">
          <InputPanel value={input} onChange={setInput} />
          <OutputPanel
            stdout={stdout}
            stderr={stderr}
            compileError={compileError}
            status={status}
            onClear={handleClearOutput}
          />
        </section>
      </main>
    </div>
  );
}
