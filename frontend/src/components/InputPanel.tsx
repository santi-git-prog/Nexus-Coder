import { useState } from "react";

type InputPanelProps = {
  value: string;
  onChange: (value: string) => void;
  inputMode?: "sample" | "custom";
  onInputModeChange?: (mode: "sample" | "custom") => void;
  customExpected?: string;
  onCustomExpectedChange?: (value: string) => void;
  sampleTestcases?: any[];
};

export default function InputPanel({
  value,
  onChange,
  inputMode = "sample",
  onInputModeChange,
  customExpected = "",
  onCustomExpectedChange,
  sampleTestcases = [],
}: InputPanelProps) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="input-panel">
      <div className="panel-header input-panel-header">
        <div className="input-mode-tabs">
          {onInputModeChange ? (
            <>
              <button
                type="button"
                className={`input-mode-tab ${inputMode === "sample" ? "active" : ""}`}
                onClick={() => onInputModeChange("sample")}
              >
                Testcase
              </button>
              <button
                type="button"
                className={`input-mode-tab ${inputMode === "custom" ? "active" : ""}`}
                onClick={() => onInputModeChange("custom")}
              >
                Custom Input
              </button>
            </>
          ) : (
            <span className="input-mode-tab active">Stdin</span>
          )}
        </div>
      </div>

      {inputMode === "sample" ? (
        <div className="input-panel-body" style={{ padding: '0 15px 15px' }}>
          {sampleTestcases && sampleTestcases.length > 0 ? (
            <>
              <div className="testcase-outcome-bar" style={{ marginBottom: '10px' }}>
                {sampleTestcases.map((tc, idx) => (
                  <button
                    key={tc.id || idx}
                    type="button"
                    className={`tc-pill-btn ${activeTab === idx ? "active" : ""}`}
                    onClick={() => setActiveTab(idx)}
                    style={{ marginRight: '8px', cursor: 'pointer', padding: '4px 12px', borderRadius: '15px', background: activeTab === idx ? '#444' : '#222', color: '#fff', border: '1px solid #555' }}
                  >
                    Case {idx + 1}
                  </button>
                ))}
              </div>
              <div className="public-testcase-card" style={{ background: '#1e1e1e', padding: '10px', borderRadius: '8px' }}>
                <p className="example-line" style={{ marginBottom: '8px', color: '#ccc' }}>
                  <strong>Input:</strong>{" "}
                  <code style={{ background: '#2d2d2d', padding: '2px 6px', borderRadius: '4px' }}>
                    {sampleTestcases[activeTab]?.input_display || sampleTestcases[activeTab]?.input}
                  </code>
                </p>
                <p className="example-line" style={{ color: '#ccc' }}>
                  <strong>Output:</strong>{" "}
                  <code style={{ background: '#2d2d2d', padding: '2px 6px', borderRadius: '4px' }}>
                    {sampleTestcases[activeTab]?.expected_output_display || sampleTestcases[activeTab]?.expected_output}
                  </code>
                </p>
              </div>
            </>
          ) : (
            <div className="input-hint-box">
              <p>
                <strong>Run</strong> — test all examples from the description.
              </p>
              <p>
                <strong>Custom Input</strong> — try your own values.
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="input-panel-body">
          <textarea
            id="custom-input"
            className="custom-textarea"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={sampleTestcases?.[0]?.input || "nums = [2, 7, 11, 15]\ntarget = 9"}
          />
          {onCustomExpectedChange && (
            <div className="custom-expected-block">
              <label htmlFor="custom-expected" className="panel-label">
                Expected output
              </label>
              <textarea
                id="custom-expected"
                className="custom-textarea expected-textarea"
                value={customExpected}
                onChange={(e) => onCustomExpectedChange(e.target.value)}
                placeholder={sampleTestcases?.[0]?.expected_output || "[0, 1]"}
                rows={2}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
