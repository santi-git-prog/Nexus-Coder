
type InputPanelProps = {
  value: string;
  onChange: (value: string) => void;
  inputMode?: "sample" | "custom";
  onInputModeChange?: (mode: "sample" | "custom") => void;
  customExpected?: string;
  onCustomExpectedChange?: (value: string) => void;
};

export default function InputPanel({
  value,
  onChange,
  inputMode = "sample",
  onInputModeChange,
  customExpected = "",
  onCustomExpectedChange,
}: InputPanelProps) {
  return (
    <div className="input-panel">
      <div className="panel-header input-panel-header">
        <div className="input-mode-tabs">
          <button
            type="button"
            className={`input-mode-tab ${inputMode === "sample" ? "active" : ""}`}
            onClick={() => onInputModeChange?.("sample")}
          >
            Testcase
          </button>
          <button
            type="button"
            className={`input-mode-tab ${inputMode === "custom" ? "active" : ""}`}
            onClick={() => onInputModeChange?.("custom")}
          >
            Custom Input
          </button>
        </div>
      </div>

      {inputMode === "sample" ? (
        <div className="input-hint-box">
          <p>
            <strong>Run</strong> — test all examples from the description.
          </p>
          <p>
            <strong>Custom Input</strong> — try your own values.
          </p>
        </div>
      ) : (
        <div className="input-panel-body">
          <textarea
            id="custom-input"
            className="custom-textarea"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="nums = [2, 7, 11, 15], target = 9"
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
                placeholder="[0, 1]"
                rows={2}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
