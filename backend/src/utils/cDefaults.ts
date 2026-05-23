/** Standard headers injected automatically — never shown in the editor. */

export const STANDARD_C_HEADERS = [
  "#include <stdio.h>",
  "#include <stdlib.h>",
  "#include <stdbool.h>",
  "#include <string.h>",
  "#include <math.h>",
  "#include <limits.h>",
  "#include <stdint.h>",
  "",
  "struct ListNode {",
  "    int val;",
  "    struct ListNode *next;",
  "};",
].join("\n");

const INCLUDE_LINE = /^\s*#\s*include\s*[<"][^>\n"]+[>"]\s*$/gm;

/** Remove #include lines from user-visible / user-submitted code. */
export const stripUserIncludes = (code: string): string => {
  return code.replace(INCLUDE_LINE, "").replace(/\n{3,}/g, "\n\n").trim();
};

export const withStandardHeaders = (userCode: string): string => {
  const body = stripUserIncludes(userCode);
  if (!body) return STANDARD_C_HEADERS;
  return `${STANDARD_C_HEADERS}\n\n${body}`;
};
