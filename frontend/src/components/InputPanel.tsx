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
        <div className="input-panel-body sample-input-body">
          {sampleTestcases && sampleTestcases.length > 0 ? (
            <>
              <div className="testcase-outcome-bar sample-case-tabs">
                {sampleTestcases.map((tc, idx) => (
                  <button
                    key={tc.id || idx}
                    type="button"
                    className={`tc-pill-btn ${activeTab === idx ? "active" : ""}`}
                    onClick={() => setActiveTab(idx)}
                  >
                    Case {idx + 1}
                  </button>
                ))}
              </div>
              <div className="public-testcase-card sample-case-card">
                <p className="example-line">
                  <strong>Input:</strong>{" "}
                  <code>
                    {sampleTestcases[activeTab]?.input_display || sampleTestcases[activeTab]?.input}
                  </code>
                </p>
                <p className="example-line">
                  <strong>Output:</strong>{" "}
                  <code>
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
