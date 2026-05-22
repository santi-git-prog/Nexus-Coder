/** LeetCode-style human display & parsing (no JSON shown to users). */

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

export const formatArgsDisplay = (raw: string): string => {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "(empty)";
  const obj = tryParseObject(trimmed);
  if (obj) {
    return Object.entries(obj)
      .map(([k, v]) => `${k} = ${formatValue(v)}`)
      .join("\n");
  }
  return trimmed;
};

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
    /* plain stdout */
  }
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return "[]";
    return `[${inner.split(",").map((s) => s.trim()).join(", ")}]`;
  }
  return trimmed;
};

const tryParseObject = (text: string): Record<string, unknown> | null => {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* not JSON */
  }
  const fromLeet = parseLeetCodeInput(text);
  return Object.keys(fromLeet).length > 0 ? fromLeet : null;
};

const splitAssignments = (s: string): string[] => {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let quote = "";
  let current = "";

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if ((c === '"' || c === "'") && s[i - 1] !== "\\") {
      if (!inString) {
        inString = true;
        quote = c;
      } else if (c === quote) {
        inString = false;
      }
    }
    if (!inString) {
      if (c === "[" || c === "(") depth++;
      if (c === "]" || c === ")") depth--;
      if (c === "," && depth === 0) {
        parts.push(current.trim());
        current = "";
        continue;
      }
    }
    current += c;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
};

const parseScalar = (s: string): unknown => {
  const t = s.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    return t.slice(1, -1);
  }
  if (t.startsWith("[") && t.endsWith("]")) {
    const inner = t.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(",").map((part) => parseScalar(part.trim()));
  }
  const n = Number(t);
  if (!Number.isNaN(n) && t !== "") return n;
  return t;
};

/** Parse LeetCode-style: nums = [1,2,3], target = 9 */
export const parseLeetCodeInput = (text: string): Record<string, unknown> => {
  const trimmed = (text || "").trim();
  if (!trimmed) return {};

  try {
    const parsed = JSON.parse(trimmed);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    /* LeetCode format */
  }

  const result: Record<string, unknown> = {};
  for (const part of splitAssignments(trimmed)) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const valueStr = part.slice(eq + 1).trim();
    if (name) result[name] = parseScalar(valueStr);
  }
  return result;
};

/** Normalize user/admin output to canonical compare string. */
export const canonicalizeExpectedOutput = (raw: string): string => {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";

  const obj = tryParseObject(trimmed);
  if (obj && Array.isArray((obj as { value?: unknown }).value)) {
    return JSON.stringify((obj as { value: unknown[] }).value);
  }

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return `[${parsed.map((v) => String(v)).join(",")}]`;
    if (typeof parsed === "boolean") return parsed ? "true" : "false";
    if (typeof parsed === "number") return String(parsed);
  } catch {
    /* leetcode style */
  }

  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    const inner = trimmed
      .slice(1, -1)
      .trim()
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return `[${inner.join(",")}]`;
  }

  return trimmed
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
};

/** Store testcase input as compact JSON internally. */
export const normalizeTestcaseInput = (raw: string): string => {
  const trimmed = (raw || "").trim();
  if (!trimmed) return "";
  const obj = parseLeetCodeInput(trimmed);
  if (Object.keys(obj).length > 0) return JSON.stringify(obj);
  return trimmed;
};
