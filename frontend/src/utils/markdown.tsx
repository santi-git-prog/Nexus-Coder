import React from "react";

export function renderMarkdown(md: string): React.ReactNode {
  if (!md) return null;

  // Split text by fenced code blocks: ```[lang]\n[code]\n```
  const parts = md.split(/(```[\s\S]*?```)/g);

  return parts.map((part, index) => {
    if (part.startsWith("```") && part.endsWith("```")) {
      const lines = part.split("\n");
      const rawLang = lines[0].replace("```", "").trim();
      const language = rawLang || "code";
      const codeContent = lines.slice(1, -1).join("\n");
      return (
        <div key={index} className="ai-markdown-codeblock-wrapper">
          <div className="ai-markdown-codeblock-header">
            <span>{language.toUpperCase()}</span>
          </div>
          <pre className="ai-markdown-codeblock">
            <code>{codeContent}</code>
          </pre>
        </div>
      );
    }

    // Process inline lists and paragraph texts
    const lines = part.split("\n");
    return (
      <div key={index} className="ai-markdown-text-block">
        {lines.map((line, lineIdx) => {
          const content = line.trim();
          if (!content) return <div key={lineIdx} className="ai-markdown-spacer" />;

          // Headings
          if (content.startsWith("### ")) {
            return <h4 key={lineIdx} className="ai-markdown-h3">{parseInline(content.slice(4))}</h4>;
          }
          if (content.startsWith("## ")) {
            return <h3 key={lineIdx} className="ai-markdown-h2">{parseInline(content.slice(3))}</h3>;
          }
          if (content.startsWith("# ")) {
            return <h2 key={lineIdx} className="ai-markdown-h1">{parseInline(content.slice(2))}</h2>;
          }

          // Bullets
          if (content.startsWith("- ") || content.startsWith("* ")) {
            return (
              <li key={lineIdx} className="ai-markdown-li">
                {parseInline(content.slice(2))}
              </li>
            );
          }

          // Numbered lists
          const numMatch = content.match(/^(\d+)\.\s(.*)/);
          if (numMatch) {
            return (
              <div key={lineIdx} className="ai-markdown-ol-item">
                <span className="ai-markdown-ol-num">{numMatch[1]}.</span>
                <span className="ai-markdown-ol-text">{parseInline(numMatch[2])}</span>
              </div>
            );
          }

          // General text line
          return (
            <p key={lineIdx} className="ai-markdown-p">
              {parseInline(content)}
            </p>
          );
        })}
      </div>
    );
  });
}

function parseInline(text: string): React.ReactNode[] {
  // Split bold (**text**) and inline code (`code`)
  const regex = /(\*\*.*?\*\*|`.*?`)/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={index} className="ai-markdown-inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}
