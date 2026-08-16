import { pool } from "../config/db";

// Helper to convert C types to Python types
const cTypeToPythonType = (cType: string): string => {
  const t = cType.toLowerCase().trim();
  if (t === "int" || t === "long" || t === "long long") return "int";
  if (t === "float" || t === "double") return "float";
  if (t === "bool" || t === "boolean") return "bool";
  if (t === "string" || t === "char*") return "str";
  if (t === "char") return "str";
  if (t === "int[]" || t === "int*") return "List[int]";
  if (t === "float[]" || t === "float*") return "List[float]";
  if (t === "double[]" || t === "double*") return "List[float]";
  if (t === "string[]" || t === "char**") return "List[str]";
  if (t.includes("listnode")) return "Optional[ListNode]";
  if (t.includes("treenode")) return "Optional[TreeNode]";
  return "Any";
};

// Generate python template
const generatePythonConfig = (problem: any) => {
  const funcName = problem.function_name || "solution";
  const params = problem.parameters ? (typeof problem.parameters === "string" ? JSON.parse(problem.parameters) : problem.parameters) : [];
  
  // Filter out size parameters (like numsSize) for Python
  const pythonParams = params.filter((p: any) => {
    return !p.name.endsWith("Size") && p.name !== "returnSize";
  });

  const paramSignature = pythonParams.map((p: any) => {
    const pyType = cTypeToPythonType(p.type);
    return `${p.name}: ${pyType}`;
  }).join(", ");

  const returnType = problem.return_type ? cTypeToPythonType(problem.return_type) : "Any";
  
  let requiredImports = ["from typing import List, Optional, Any"];
  let usesListNode = false;
  let usesTreeNode = false;
  
  if (paramSignature.includes("ListNode") || returnType.includes("ListNode")) usesListNode = true;
  if (paramSignature.includes("TreeNode") || returnType.includes("TreeNode")) usesTreeNode = true;
  
  let starterCode = "";
  
  if (usesListNode) {
    starterCode += `
# Definition for singly-linked list.
# class ListNode:
#     def __init__(self, val=0, next=None):
#         self.val = val
#         self.next = next
`;
  }
  
  if (usesTreeNode) {
    starterCode += `
# Definition for a binary tree node.
# class TreeNode:
#     def __init__(self, val=0, left=None, right=None):
#         self.val = val
#         self.left = left
#         self.right = right
`;
  }
  
  starterCode += `class Solution:
    def ${funcName}(self, ${paramSignature}) -> ${returnType}:
        pass
`;
        
  return {
    python_function_name: funcName,
    python_starter_code: starterCode.trim(),
    python_parameters: pythonParams,
    python_required_imports: requiredImports
  };
};

async function migrate() {
  console.log("Starting Python migration...");
  
  // 1. Ensure column exists
  await pool.query(`ALTER TABLE problems ADD COLUMN IF NOT EXISTS language_configs JSONB DEFAULT '{}'::jsonb;`);

  // 2. Fetch all problems
  const res = await pool.query("SELECT * FROM problems");
  let count = 0;
  
  for (const row of res.rows) {
    const pythonConfig = generatePythonConfig(row);
    const existingConfig = row.language_configs || {};
    existingConfig.python = pythonConfig;
    
    await pool.query(
      "UPDATE problems SET language_configs = $1 WHERE id = $2",
      [existingConfig, row.id]
    );
    count++;
  }
  
  console.log(`Migrated ${count} problems to support Python!`);
  process.exit(0);
}

migrate().catch(console.error);
