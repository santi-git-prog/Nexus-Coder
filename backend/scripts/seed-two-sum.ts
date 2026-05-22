/**
 * Seeds one LeetCode-style "Two Sum" problem for local testing.
 * Run: npx ts-node scripts/seed-two-sum.ts
 */
import dotenv from "dotenv";
import path from "path";
import { Pool } from "pg";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const MIGRATION = `
ALTER TABLE problems
  ADD COLUMN IF NOT EXISTS problem_type VARCHAR(20) DEFAULT 'stdio',
  ADD COLUMN IF NOT EXISTS function_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS return_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS parameters JSONB DEFAULT '[]'::jsonb;
`;

const STARTER_CODE = `/**
 * Note: The returned array must be malloced, assume caller calls free().
 */
int* twoSum(int* nums, int numsSize, int target, int* returnSize) {
    
}`;

const PARAMETERS = [
  { name: "nums", type: "int[]" },
  { name: "target", type: "int" },
];

const TESTCASES = [
  {
    input: JSON.stringify({ nums: [2, 7, 11, 15], target: 9 }),
    expected_output: "[0,1]",
    is_hidden: false,
  },
  {
    input: JSON.stringify({ nums: [3, 2, 4], target: 6 }),
    expected_output: "[1,2]",
    is_hidden: false,
  },
  {
    input: JSON.stringify({ nums: [3, 3], target: 6 }),
    expected_output: "[0,1]",
    is_hidden: true,
  },
];

async function main() {
  console.log("Applying schema migration (if needed)...");
  await pool.query(MIGRATION);

  const userRes = await pool.query(
    `SELECT id FROM users ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, created_at ASC NULLS LAST LIMIT 1`
  );
  if (userRes.rows.length === 0) {
    throw new Error("No users in database. Register/login once, then re-run this script.");
  }
  const userId = userRes.rows[0].id;

  const existing = await pool.query(
    `SELECT p.id, ps.id AS set_id FROM problems p
     JOIN problem_sets ps ON ps.id = p.problem_set_id
     WHERE p.title = 'Two Sum' AND ps.title = 'LeetCode Style Demo'`
  );

  if (existing.rows.length > 0) {
    const problemId = existing.rows[0].id;
    const setId = existing.rows[0].set_id;
    await pool.query(
      `UPDATE problems SET
        input_format = $1, output_format = $2,
        problem_set_id = problem_set_id
       WHERE id = $3`,
      [
        "nums — integer array, target — integer.",
        "Two indices as an array, e.g. [0, 1]",
        problemId,
      ]
    );
    console.log("\nTwo Sum already exists — refreshed display text.");
    console.log(`Track:  LeetCode Style Demo (id: ${setId})`);
    console.log(`Problem id: ${problemId}`);
    console.log(`Open: /workspace?problem=${problemId}`);
    await pool.end();
    return;
  }

  const setRes = await pool.query(
    `INSERT INTO problem_sets (title, description, created_by)
     VALUES ($1, $2, $3) RETURNING id`,
    [
      "LeetCode Style Demo",
      "Sample function-style problems with hidden test driver.",
      userId,
    ]
  );
  const setId = setRes.rows[0].id;

  const probRes = await pool.query(
    `INSERT INTO problems (
      problem_set_id, title, description, difficulty, tags,
      input_format, output_format, constraints, starter_code, created_by,
      problem_type, function_name, return_type, parameters
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
    [
      setId,
      "Two Sum",
      `Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.

You may assume that each input would have exactly one solution, and you may not use the same element twice.

You can return the answer in any order.`,
      "Easy",
      ["array", "hash-table"],
      "nums — integer array, target — integer.",
      "Two indices as an array, e.g. [0, 1]",
      "2 <= nums.length <= 10^4\n-10^9 <= nums[i] <= 10^9\n-10^9 <= target <= 10^9",
      STARTER_CODE,
      userId,
      "function",
      "twoSum",
      "int*",
      JSON.stringify(PARAMETERS),
    ]
  );
  const problemId = probRes.rows[0].id;

  for (const tc of TESTCASES) {
    await pool.query(
      `INSERT INTO testcases (problem_id, input, expected_output, is_hidden)
       VALUES ($1, $2, $3, $4)`,
      [problemId, tc.input, tc.expected_output, tc.is_hidden]
    );
  }

  console.log("\nSeeded successfully!");
  console.log(`Track:  LeetCode Style Demo`);
  console.log(`Problem: Two Sum (Easy)`);
  console.log(`Problem id: ${problemId}`);
  console.log(`\nOpen in IDE: http://localhost:5173/workspace?problem=${problemId}`);
  console.log("\nReference solution (paste if you want to test Run/Submit):");
  console.log(REFERENCE_SOLUTION.trim());

  await pool.end();
}

const REFERENCE_SOLUTION = `
int* twoSum(int* nums, int numsSize, int target, int* returnSize) {
    for (int i = 0; i < numsSize; i++) {
        for (int j = i + 1; j < numsSize; j++) {
            if (nums[i] + nums[j] == target) {
                int* out = (int*)malloc(2 * sizeof(int));
                out[0] = i;
                out[1] = j;
                *returnSize = 2;
                return out;
            }
        }
    }
    *returnSize = 0;
    return NULL;
}
`;

main().catch((err) => {
  console.error("Seed failed:", err.message || err);
  process.exit(1);
});
