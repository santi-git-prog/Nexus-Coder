
type InputPanelProps = {
  value: string;
  onChange: (value: string) => void;
  mode?: "stdio" | "function";
  inputMode?: "sample" | "custom";
  onInputModeChange?: (mode: "sample" | "custom") => void;
  customExpected?: string;
  onCustomExpectedChange?: (value: string) => void;
};

export default function InputPanel({
  value,
  onChange,
  mode = "stdio",
  inputMode = "sample",
  onInputModeChange,
  customExpected = "",
  onCustomExpectedChange,
}: InputPanelProps) {
  const isFunction = mode === "function";

  return (
    <div className="input-panel">
      <div className="panel-header input-panel-header">
        {isFunction && onInputModeChange ? (
          <div className="input-mode-tabs">
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
          </div>
        ) : (
          <label htmlFor="stdin-input" className="panel-label">
            Custom Input
          </label>
        )}
      </div>

      {isFunction && inputMode === "sample" ? (
        <div className="input-hint-box">
          <p>
            Press <strong>Run</strong> to test against all sample cases shown in the problem
            description.
          </p>
          <p>
            Use <strong>Custom Input</strong> to try your own values, e.g.{" "}
            <code className="inline-example">nums = [2,7,11,15], target = 9</code>
          </p>
        </div>
      ) : (
        <div className="input-panel-body">
          <textarea
            id="stdin-input"
            className="stdin-textarea"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={
              isFunction
                ? "nums = [2, 7, 11, 15], target = 9"
                : "Enter stdin for your program..."
            }
          />
          {isFunction && onCustomExpectedChange && (
            <div className="custom-expected-block">
              <label htmlFor="custom-expected" className="panel-label">
                Expected (optional)
              </label>
              <textarea
                id="custom-expected"
                className="stdin-textarea expected-textarea"
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
