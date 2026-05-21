import Editor from "@monaco-editor/react";

type CodeEditorProps = {
  value: string;
  onChange: (value: string) => void;
  language: string;
};

export default function CodeEditor({
  value,
  onChange,
  language,
}: CodeEditorProps) {
  // Monaco uses 'c' for C programming language
  const monacoLanguage = language === "c" ? "c" : language;

  return (
    <div className="code-editor-container">
      <Editor
        height="100%"
        language={monacoLanguage}
        theme="vs-dark"
        value={value}
        onChange={(val) => onChange(val || "")}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: "'Fira Code', 'Consolas', 'Courier New', monospace",
          fontLigatures: true,
          lineHeight: 22,
          automaticLayout: true,
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          padding: { top: 12, bottom: 12 },
          roundedSelection: true,
          selectOnLineNumbers: true,
          scrollBeyondLastLine: false,
          folding: true,
          scrollbar: {
            vertical: "visible",
            horizontal: "visible",
            verticalScrollbarSize: 10,
            horizontalScrollbarSize: 10,
          },
        }}
      />
    </div>
  );
}
