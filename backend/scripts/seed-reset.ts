/**
 * Wipes all problem tracks & problems, then seeds one fresh "Two Sum" test problem.
 * Run: npm run seed:reset
 */
import dotenv from "dotenv";
import path from "path";
import { Pool } from "pg";

dotenv.config({ path: path.join(__dirname, "..", ".env") });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const STARTER_CODE = `/**
 * Note: The returned array must be malloced, assume caller calls free().
 */
int* twoSum(int* nums, int numsSize, int target, int* returnSize) {
    
}`;

const TESTCASES = [
  { input: { nums: [2, 7, 11, 15], target: 9 }, expected: "[0,1]", hidden: false },
  { input: { nums: [3, 2, 4], target: 6 }, expected: "[1,2]", hidden: false },
  { input: { nums: [3, 3], target: 6 }, expected: "[0,1]", hidden: true },
];

async function main() {
  const userRes = await pool.query(
    `SELECT id FROM users ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END LIMIT 1`
  );
  if (userRes.rows.length === 0) {
    throw new Error("No users found. Register once, then run: npm run seed:reset");
  }
  const userId = userRes.rows[0].id;

  console.log("Removing all existing problems, testcases, and related data...");
  await pool.query("DELETE FROM testcases");
  await pool.query("DELETE FROM submissions");
  await pool.query("DELETE FROM problem_progress");
  await pool.query("DELETE FROM problems");
  await pool.query("DELETE FROM problem_sets");

  const setRes = await pool.query(
    `INSERT INTO problem_sets (title, description, created_by)
     VALUES ($1, $2, $3) RETURNING id`,
    ["Practice", "Function-style coding problems.", userId]
  );
  const setId = setRes.rows[0].id;

  const probRes = await pool.query(
    `INSERT INTO problems (
      problem_set_id, title, description, difficulty, tags,
      input_format, output_format, constraints, starter_code, created_by,
      problem_type, function_name, return_type, parameters
    ) VALUES ($1,$2,$3,$4,$5,'','',$6,$7,$8,'function',$9,$10,$11) RETURNING id`,
    [
      setId,
      "Two Sum",
      `Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.

You may assume that each input would have exactly one solution, and you may not use the same element twice.

You can return the answer in any order.`,
      "Easy",
      ["array", "hash-table"],
      "2 <= nums.length <= 10^4\n-10^9 <= nums[i] <= 10^9\n-10^9 <= target <= 10^9",
      STARTER_CODE,
      userId,
      "twoSum",
      "int*",
      JSON.stringify([
        { name: "nums", type: "int[]" },
        { name: "target", type: "int" },
      ]),
    ]
  );
  const problemId = probRes.rows[0].id;

  for (const tc of TESTCASES) {
    await pool.query(
      `INSERT INTO testcases (problem_id, input, expected_output, is_hidden)
       VALUES ($1, $2, $3, $4)`,
      [problemId, JSON.stringify(tc.input), tc.expected, tc.hidden]
    );
  }

  console.log("\nDatabase reset complete.");
  console.log(`Track:   Practice`);
  console.log(`Problem: Two Sum (Easy)`);
  console.log(`ID:      ${problemId}`);
  console.log(`\nOpen: http://localhost:5173/workspace?problem=${problemId}`);

  await pool.end();
}

main().catch((err) => {
  console.error("Seed reset failed:", err.message || err);
  process.exit(1);
});
