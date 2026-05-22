export type ProblemParameter = {
  name: string;
  type: string;
  /** For array types — companion size param name (e.g. numsSize). Auto-guessed if omitted. */
  sizeParam?: string;
};

export type FunctionProblemMeta = {
  problem_type: string;
  function_name: string;
  return_type: string;
  parameters: ProblemParameter[];
};

export type TestcaseRow = {
  id: string;
  problem_id: string;
  input: string;
  expected_output: string;
  is_hidden: boolean;
};

export type TestcaseRunResult = {
  id: string;
  is_hidden: boolean;
  status: string;
  passed: boolean;
  input?: string;
  expected_output?: string;
  actual_output?: string;
  input_display?: string;
  expected_output_display?: string;
  actual_output_display?: string;
  error_message?: string;
};

export type JudgeOutcome = {
  status: string;
  passed_count: number;
  total_count: number;
  output_summary: string;
  compile_error?: string;
  testcase_results: TestcaseRunResult[];
};
