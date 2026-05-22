import { FunctionProblemMeta, ProblemParameter } from "../types/problem";
import {
  canonicalizeExpectedOutput,
  parseLeetCodeInput,
} from "./leetcodeDisplay";
import { STANDARD_C_HEADERS, stripUserIncludes } from "./cDefaults";

const DRIVER_MARKER = "/* __NEXUS_INTERNAL__ */";

export const isFunctionProblem = (meta: Partial<FunctionProblemMeta>): boolean =>
  (meta.problem_type || "stdio").toLowerCase() === "function" &&
  Boolean(meta.function_name && meta.return_type);

export const parseParameters = (raw: unknown): ProblemParameter[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as ProblemParameter[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
};

const arraySizeParamName = (arrayName: string): string => {
  if (arrayName.endsWith("s")) return `${arrayName.slice(0, -1)}Size`;
  return `${arrayName}Size`;
};

const cTypeForParam = (p: ProblemParameter): string[] => {
  const t = p.type.toLowerCase();
  switch (t) {
    case "int":
      return [`int ${p.name}`];
    case "float":
      return [`float ${p.name}`];
    case "double":
      return [`double ${p.name}`];
    case "bool":
    case "boolean":
      return [`bool ${p.name}`];
    case "char":
      return [`char ${p.name}`];
    case "string":
    case "char*":
      return [`char* ${p.name}`];
    case "int[]":
      return [`int* ${p.name}`, `int ${p.sizeParam || arraySizeParamName(p.name)}`];
    case "float[]":
      return [`float* ${p.name}`, `int ${p.sizeParam || arraySizeParamName(p.name)}`];
    case "double[]":
      return [`double* ${p.name}`, `int ${p.sizeParam || arraySizeParamName(p.name)}`];
    default:
      return [`int ${p.name}`];
  }
};

export const buildFunctionSignature = (meta: FunctionProblemMeta): string => {
  const params = parseParameters(meta.parameters);
  const parts: string[] = [];
  for (const p of params) {
    parts.push(...cTypeForParam(p));
  }
  const ret = meta.return_type.trim();
  if (ret.includes("*") && !parts.some((x) => x.includes("returnSize"))) {
    parts.push("int* returnSize");
  }
  return parts.join(", ");
};

export const generateStarterCode = (meta: FunctionProblemMeta): string => {
  const signature = buildFunctionSignature(meta);
  const ret = meta.return_type.trim();
  let comment = "";
  if (ret.includes("*")) {
    comment =
      "/**\n * Note: The returned array must be malloced, assume caller calls free().\n */\n";
  }
  return `${comment}${ret} ${meta.function_name}(${signature}) {\n    \n}`;
};

export const parseTestcaseInput = (input: string): Record<string, unknown> =>
  parseLeetCodeInput(input);

const cLiteral = (value: unknown, type: string): string => {
  const t = type.toLowerCase();
  if (t === "bool" || t === "boolean") {
    return value === true || value === "true" ? "true" : "false";
  }
  if (t === "string" || t === "char*" || t === "char") {
    const s = String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    return `"${s}"`;
  }
  if (t.endsWith("[]")) {
    const arr = Array.isArray(value) ? value : [];
    const elemType = t.replace("[]", "");
    if (arr.length === 0) return "NULL";
    if (elemType === "int") return `{${arr.map((n) => Number(n)).join(", ")}}`;
    if (elemType === "float") return `{${arr.map((n) => `${Number(n)}f`).join(", ")}}`;
    if (elemType === "double") return `{${arr.join(", ")}}`;
    return `{${arr.join(", ")}}`;
  }
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
};

const declareArray = (
  name: string,
  type: string,
  value: unknown,
  lines: string[]
): { sizeName: string; size: number } => {
  const arr = Array.isArray(value) ? value : [];
  const elemType = type.replace("[]", "");
  const sizeName = arraySizeParamName(name);
  if (arr.length === 0) {
    lines.push(`int ${sizeName} = 0;`);
    lines.push(`int* ${name} = NULL;`);
    return { sizeName, size: 0 };
  }
  lines.push(`int ${sizeName} = ${arr.length};`);
  if (elemType === "int") {
    lines.push(`int ${name}_arr[] = {${arr.map((n) => Number(n)).join(", ")}};`);
    lines.push(`int* ${name} = ${name}_arr;`);
  } else if (elemType === "float") {
    lines.push(`float ${name}_arr[] = {${arr.map((n) => `${Number(n)}f`).join(", ")}};`);
    lines.push(`float* ${name} = ${name}_arr;`);
  } else if (elemType === "double") {
    lines.push(`double ${name}_arr[] = {${arr.join(", ")}};`);
    lines.push(`double* ${name} = ${name}_arr;`);
  } else {
    lines.push(`int ${name}_arr[] = {${arr.join(", ")}};`);
    lines.push(`int* ${name} = ${name}_arr;`);
  }
  return { sizeName, size: arr.length };
};

const buildCallArgs = (
  meta: FunctionProblemMeta,
  input: Record<string, unknown>,
  lines: string[]
): string[] => {
  const params = parseParameters(meta.parameters);
  const args: string[] = [];
  for (const p of params) {
    const t = p.type.toLowerCase();
    const val = input[p.name];
    if (t.endsWith("[]")) {
      declareArray(p.name, t, val, lines);
      args.push(p.name);
      args.push(p.sizeParam || arraySizeParamName(p.name));
    } else if (t === "string" || t === "char*") {
      lines.push(`char* ${p.name} = ${cLiteral(val ?? "", t)};`);
      args.push(p.name);
    } else {
      lines.push(`${t === "bool" || t === "boolean" ? "bool" : t} ${p.name} = ${cLiteral(val ?? 0, t)};`);
      args.push(p.name);
    }
  }
  const ret = meta.return_type.trim();
  if (ret.includes("*")) {
    lines.push("int returnSize = 0;");
    args.push("&returnSize");
  }
  return args;
};

const printResultBlock = (meta: FunctionProblemMeta): string[] => {
  const ret = meta.return_type.trim().toLowerCase();
  if (ret === "void") return ['printf("null");'];
  if (ret === "bool" || ret === "boolean") {
    return ['printf("%s", result ? "true" : "false");'];
  }
  if (ret === "int" || ret === "float" || ret === "double" || ret === "char") {
    const fmt = ret === "float" ? "%f" : ret === "char" ? "%c" : ret === "double" ? "%f" : "%d";
    return [`printf("${fmt}", result);`];
  }
  if (ret === "char*" || ret === "string") {
    return ['if (result) printf("%s", result); else printf("null");'];
  }
  if (ret.includes("*")) {
    return [
      'printf("[");',
      "for (int i = 0; i < returnSize; i++) {",
      '  if (i > 0) printf(",");',
      '  printf("%d", result[i]);',
      "}",
      'printf("]");',
      "if (result) free(result);",
    ];
  }
  return ['printf("%d", (int)result);'];
};

export const generateDriverMain = (
  meta: FunctionProblemMeta,
  input: Record<string, unknown>
): string => {
  const lines: string[] = [];
  const callArgs = buildCallArgs(meta, input, lines);
  const ret = meta.return_type.trim();
  const isVoid = ret.toLowerCase() === "void";

  const callLine = isVoid
    ? `${meta.function_name}(${callArgs.join(", ")});`
    : `${ret} result = ${meta.function_name}(${callArgs.join(", ")});`;

  return [
    DRIVER_MARKER,
    "int main(void) {",
    ...lines.map((l) => `  ${l}`),
    `  ${callLine}`,
    ...printResultBlock(meta).map((l) => `  ${l}`),
    "  printf(\"\\n\");",
    "  return 0;",
    "}",
  ].join("\n");
};

/** Build full compile unit: headers + user function + internal runner. */
export const wrapUserCode = (
  userCode: string,
  meta: FunctionProblemMeta,
  testcaseInput: string
): string => {
  const input = parseTestcaseInput(testcaseInput);
  const stripped = userCode.replace(/\r/g, "").trim();
  const cutAt =
    stripped.indexOf(DRIVER_MARKER) !== -1
      ? stripped.indexOf(DRIVER_MARKER)
      : stripped.indexOf("/* __NEXUS_DRIVER__ */");
  const withoutInternal = cutAt !== -1 ? stripped.slice(0, cutAt).trim() : stripped;
  const userBody = stripUserIncludes(withoutInternal);
  return `${STANDARD_C_HEADERS}\n\n${userBody}\n\n${generateDriverMain(meta, input)}`;
};

/** Editor-visible starter (function body only). */
export const sanitizeStarterCode = (code: string): string => stripUserIncludes(code.replace(/\r/g, "").trim());

export const normalizeExpectedOutput = (expected: string): string =>
  canonicalizeExpectedOutput(expected);

export const normalizeActualOutput = (stdout: string): string => {
  return stdout
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
};
