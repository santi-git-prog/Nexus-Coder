import fs from "fs";
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

/**
 * Returns true when the Node process is running inside a Docker container.
 * The Docker runtime creates /.dockerenv in every container it starts.
 * On Render (and most Docker-based PaaS), this file will always be present.
 */
const isInsideDockerContainer = (): boolean => {
  try {
    return fs.existsSync("/.dockerenv");
  } catch {
    return false;
  }
};

/**
 * Determines the execution sandbox to use for untrusted user code.
 *
 * Priority:
 * 1. Running INSIDE a Docker container (e.g. Render) → "local"
 *    Our Dockerfile pre-installs gcc + python3, so we can run directly.
 *    Docker-in-Docker is NOT available on Render — we must never try it.
 * 2. Running OUTSIDE a container with Docker available → "docker"
 *    Spins up isolated gcc / python:3.10-slim containers per run.
 * 3. Running OUTSIDE a container with local gcc → "local"
 *    Development machines with GCC on PATH.
 * 4. None of the above → "none" (execution disabled, returns error to user).
 */
export const getSandboxMode = (): SandboxMode => {
  const now = Date.now();
  if (cachedMode !== null && now - lastModeCheckTime < MODE_CACHE_MS) {
    return cachedMode;
  }

  if (isInsideDockerContainer()) {
    // We are inside a Docker container (e.g. deployed on Render).
    // GCC and python3 are pre-installed by our Dockerfile.
    // Docker-in-Docker is impossible here, so we use "local".
    const hasGcc = commandExists("gcc --version");
    const hasPython =
      commandExists("python3 --version") || commandExists("python --version");
    cachedMode = hasGcc || hasPython ? "local" : "none";
    lastModeCheckTime = now;
    return cachedMode;
  }

  // Not inside a container — local dev or a bare server.
  if (commandExists("docker ps") && commandExists("docker image inspect gcc")) {
    cachedMode = "docker";
  } else if (commandExists("gcc --version")) {
    cachedMode = "local";
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
