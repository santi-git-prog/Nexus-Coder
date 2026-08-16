import { FunctionProblemMeta, ProblemParameter } from "../types/problem";
import { parseLeetCodeInput } from "./leetcodeDisplay";

const DRIVER_MARKER = "# __NEXUS_INTERNAL__";

const PYTHON_IMPORTS = [
  "import sys",
  "import json",
  "from typing import *",
  "from collections import deque, defaultdict, Counter",
  "import math",
  "import heapq"
].join("\n");

const PYTHON_LIST_NODE = `class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next`;

const PYTHON_TREE_NODE = `class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right`;

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

// Convert parameter types (similar to C wrapper but for python testcases)
const buildPythonArgs = (meta: FunctionProblemMeta, input: Record<string, unknown>): string => {
  const params = parseParameters(meta.parameters);
  const args: string[] = [];
  const lines: string[] = [];
  
  for (const p of params) {
    // We ignore size parameters (like numsSize) for Python
    if (p.name.endsWith("Size") || p.name === "returnSize") continue;
    
    const val = input[p.name];
    let pyVal = JSON.stringify(val);
    const t = p.type.toLowerCase();
    
    if (t.includes("listnode")) {
      // Build linked list
      const listName = p.name;
      const arr = Array.isArray(val) ? val : [];
      lines.push(`    def build_linked_list_${listName}(arr):`);
      lines.push(`        dummy = ListNode()`);
      lines.push(`        curr = dummy`);
      lines.push(`        for v in arr:`);
      lines.push(`            curr.next = ListNode(v)`);
      lines.push(`            curr = curr.next`);
      lines.push(`        return dummy.next`);
      lines.push(`    ${listName} = build_linked_list_${listName}(${JSON.stringify(arr)})`);
      args.push(listName);
    } else if (t.includes("treenode")) {
      // Build binary tree (assume level order array)
      const treeName = p.name;
      lines.push(`    def build_tree_${treeName}(arr):`);
      lines.push(`        if not arr: return None`);
      lines.push(`        root = TreeNode(arr[0])`);
      lines.push(`        q = deque([root])`);
      lines.push(`        i = 1`);
      lines.push(`        while q and i < len(arr):`);
      lines.push(`            curr = q.popleft()`);
      lines.push(`            if arr[i] is not None:`);
      lines.push(`                curr.left = TreeNode(arr[i])`);
      lines.push(`                q.append(curr.left)`);
      lines.push(`            i += 1`);
      lines.push(`            if i < len(arr) and arr[i] is not None:`);
      lines.push(`                curr.right = TreeNode(arr[i])`);
      lines.push(`                q.append(curr.right)`);
      lines.push(`            i += 1`);
      lines.push(`        return root`);
      lines.push(`    ${treeName} = build_tree_${treeName}(${JSON.stringify(val)})`);
      args.push(treeName);
    } else {
      // Primitive / Array of primitives
      lines.push(`    ${p.name} = ${pyVal}`);
      args.push(p.name);
    }
  }
  
  lines.push(`    call_args = [${args.join(", ")}]`);
  return lines.join("\n");
};

const printResultBlock = (meta: FunctionProblemMeta): string => {
  const ret = meta.return_type.trim().toLowerCase();
  
  if (ret === "void") return `    print("null")`;
  
  const lines: string[] = [];
  lines.push(`    def format_result(res):`);
  lines.push(`        if res is None: return "null"`);
  lines.push(`        if isinstance(res, bool): return "true" if res else "false"`);

  if (ret.includes("listnode")) {
    lines.push(`        arr = []`);
    lines.push(`        curr = res`);
    lines.push(`        while curr:`);
    lines.push(`            arr.append(curr.val)`);
    lines.push(`            curr = curr.next`);
    lines.push(`        return json.dumps(arr).replace(" ", "")`);
  } else {
    lines.push(`        return json.dumps(res).replace(" ", "")`);
  }

  lines.push(`    print(format_result(result))`);
  return lines.join("\n");
};

export const generatePythonDriverMain = (meta: FunctionProblemMeta, input: Record<string, unknown>, functionName: string): string => {
  const callSetup = buildPythonArgs(meta, input);
  const printLogic = printResultBlock(meta);
  
  return `
${DRIVER_MARKER}
if __name__ == "__main__":
    import json
    from collections import deque
${callSetup}
    sol = Solution()
    result = sol.${functionName}(*call_args)
${printLogic}
`;
};

export const wrapPythonUserCode = (userCode: string, meta: FunctionProblemMeta, testcaseInput: string, pythonConfig: any): string => {
  const input = parseLeetCodeInput(testcaseInput);
  const funcName = pythonConfig.python_function_name || meta.function_name || "solution";
  
  let fullCode = PYTHON_IMPORTS + "\n\n";
  fullCode += PYTHON_LIST_NODE + "\n\n";
  fullCode += PYTHON_TREE_NODE + "\n\n";
  
  const stripped = userCode.replace(/\r/g, "").trim();
  const cutAt = stripped.indexOf(DRIVER_MARKER);
  const userBody = cutAt !== -1 ? stripped.slice(0, cutAt).trim() : stripped;
  
  fullCode += userBody + "\n\n";
  fullCode += generatePythonDriverMain(meta, input, funcName);
  
  return fullCode;
};
