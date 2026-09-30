import { execSync } from "child_process";

export type SandboxMode = "local" | "docker" | "none";

let cachedMode: SandboxMode | null = null;
let lastModeCheckTime = 0;

const MODE_CACHE_MS = 15_000;

const commandExists = (command: string, timeoutMs = 2000): boolean => {
  try {
    execSync(command, { stdio: "ignore", timeout: timeoutMs });
    return true;
  } catch {
    return false;
  }
};

/** Untrusted submissions must run in containers in production. */
export const getSandboxMode = (): SandboxMode => {
  const now = Date.now();
  if (cachedMode !== null && now - lastModeCheckTime < MODE_CACHE_MS) {
    return cachedMode;
  }

  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction && commandExists("docker ps") && commandExists("docker image inspect gcc")) {
    cachedMode = "docker";
  } else if (isProduction) {
    cachedMode = "none";
  } else if (commandExists("gcc --version")) {
    cachedMode = "local";
  } else if (commandExists("docker ps") && commandExists("docker image inspect gcc")) {
    cachedMode = "docker";
  } else {
    cachedMode = "none";
  }

  lastModeCheckTime = now;
  return cachedMode;
};

export const invalidateSandboxCache = (): void => {
  cachedMode = null;
  lastModeCheckTime = 0;
};

export const isCompileErrorOutput = (stderr: string, stdout: string): boolean => {
  if (!stderr.trim()) return false;
  const lower = stderr.toLowerCase();
  return (
    lower.includes("error:") ||
    lower.includes("fatal error:") ||
    lower.includes("collect2") ||
    lower.includes("undefined reference") ||
    (lower.includes("solution.c") && !stdout.trim())
  );
};
