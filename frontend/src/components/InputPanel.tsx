
type InputPanelProps = {
  value: string;
  onChange: (value: string) => void;
};

export default function InputPanel({ value, onChange }: InputPanelProps) {
  return (
    <div className="input-panel">
      <div className="panel-header">
        <label htmlFor="stdin-input" className="panel-label">Custom Input (stdin)</label>
      </div>
      <textarea
        id="stdin-input"
        className="stdin-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter standard input (stdin) for your C program here..."
      />
    </div>
  );
}
