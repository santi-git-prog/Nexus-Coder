/** LeetCode-style display formatting (user-facing only). */

export const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return `"${value}"`;
  if (Array.isArray(value)) {
    return `[${value.map((v) => formatValue(v)).join(", ")}]`;
  }
  return String(value);
};

const tryParseObject = (text: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
};

export const formatArgsDisplay = (raw: string): string => {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "(empty)";
  const obj = tryParseObject(trimmed);
  if (obj) {
    return Object.entries(obj)
      .map(([k, v]) => `${k} = ${formatValue(v)}`)
      .join(", ");
  }
  return trimmed;
};

/** Strip #include lines from editor template. */
export const stripEditorIncludes = (code: string): string =>
  code.replace(/^\s*#\s*include\s*[<"][^>\n"]+[>"]\s*$/gm, "").replace(/\n{3,}/g, "\n\n").trim();

export const formatOutputDisplay = (raw: string): string => {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "(empty)";
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return `[${parsed.map((v) => formatValue(v)).join(", ")}]`;
    }
    if (typeof parsed === "boolean") return parsed ? "true" : "false";
    if (typeof parsed === "number") return String(parsed);
    if (typeof parsed === "string") return formatValue(parsed);
  } catch {
    /* plain */
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return "[]";
    return `[${inner.split(",").map((s) => s.trim()).join(", ")}]`;
  }
  return trimmed;
};
