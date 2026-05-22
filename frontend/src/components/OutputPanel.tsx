
type OutputPanelProps = {
  stdout: string;
  stderr: string;
  compileError: string;
  status: string;
  onClear: () => void;
};

export default function OutputPanel({
  stdout,
  stderr,
  compileError,
  status,
  onClear,
}: OutputPanelProps) {
  // Determine badge styling based on code execution status
  const getStatusBadge = () => {
    switch (status) {
      case "Success":
        return <span className="status-badge success">SUCCESS</span>;
      case "Compile Error":
        return <span className="status-badge compile-error">COMPILE ERROR</span>;
      case "Runtime Error":
        return <span className="status-badge runtime-error">RUNTIME ERROR</span>;
      case "Time Limit Exceeded":
        return <span className="status-badge timeout">TIME LIMIT EXCEEDED</span>;
      case "Running":
        return (
          <span className="status-badge running">
            <span className="spinner-icon"></span> RUNNING...
          </span>
        );
      case "Idle":
      default:
        return <span className="status-badge idle">IDLE</span>;
    }
  };

  const hasOutput = stdout || stderr || compileError || status === "Running";

  return (
    <div className="output-panel">
      <div className="panel-header output-header">
        <div className="output-header-left">
          <span className="panel-label">Terminal Output</span>
          {getStatusBadge()}
        </div>
        {hasOutput && (
          <button onClick={onClear} className="clear-btn">
            Clear Output
          </button>
        )}
      </div>

      <div className="terminal-display">
        {status === "Running" ? (
          <div className="terminal-running-state">
            <p className="terminal-loading-text">Running...</p>
          </div>
        ) : compileError ? (
          <pre className="terminal-content compile-error-text">
            {compileError}
          </pre>
        ) : (
          <>
            {stdout && (
              <pre className="terminal-content stdout-text">
                {stdout}
              </pre>
            )}
            {stderr && (
              <pre className="terminal-content stderr-text">
                {stderr}
              </pre>
            )}
            {!stdout && !stderr && (
              <p className="terminal-empty-text">No output yet. Click Run to test your solution.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
