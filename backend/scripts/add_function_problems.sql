-- Run once against your Nexus-Code PostgreSQL database.
-- Enables LeetCode-style function problems (starter signature + JSON testcases).

ALTER TABLE problems
  ADD COLUMN IF NOT EXISTS problem_type VARCHAR(20) DEFAULT 'stdio',
  ADD COLUMN IF NOT EXISTS function_name VARCHAR(100),
  ADD COLUMN IF NOT EXISTS return_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS parameters JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN problems.problem_type IS 'stdio = competitive programming stdin/stdout; function = LeetCode-style callable';
COMMENT ON COLUMN problems.parameters IS 'JSON array: [{ "name": "nums", "type": "int[]" }, { "name": "target", "type": "int" }]';
