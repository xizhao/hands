/**
 * CLI Invocation Utility
 *
 * Handles calling the hands CLI from within a compiled sidecar binary.
 * Finds the CLI binary next to the agent binary.
 */

import { spawn, execSync, type SpawnOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Cache the CLI path after first detection
let cachedCliPath: string | null = null;

/**
 * Get the target triple for the current platform
 */
function getTargetTriple(): string {
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";

  if (process.platform === "darwin") {
    return `${arch}-apple-darwin`;
  } else if (process.platform === "win32") {
    return `${arch}-pc-windows-msvc`;
  } else {
    return `${arch}-unknown-linux-gnu`;
  }
}

/**
 * Find the CLI binary
 */
function findCli(): string {
  if (cachedCliPath) return cachedCliPath;

  const execDir = dirname(process.execPath);

  // Try different possible locations and names
  const candidates = [
    // Production (Tauri strips target triple)
    resolve(execDir, process.platform === "win32" ? "hands-cli.exe" : "hands-cli"),
    // macOS bundle Resources folder
    resolve(execDir, "../Resources", "hands-cli"),
    // Dev mode with target triple
    resolve(execDir, `hands-cli-${getTargetTriple()}`),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      cachedCliPath = candidate;
      return cachedCliPath;
    }
  }

  // If nothing found, throw an error
  throw new Error(
    `Could not find hands-cli binary. Searched:\n${candidates.map(c => `  - ${c}`).join("\n")}`
  );
}

/**
 * Result from running a CLI command
 */
export interface CliResult {
  stdout: string;
  stderr: string;
  code: number;
}

/**
 * Run a hands CLI command and return the output
 */
export function runCli(
  args: string[],
  options: { cwd?: string; timeout?: number } = {}
): Promise<CliResult> {
  const cliPath = findCli();
  const { cwd = process.cwd(), timeout } = options;

  return new Promise((resolve) => {
    const spawnOptions: SpawnOptions = {
      cwd,
      env: process.env,
    };

    const proc = spawn(cliPath, args, spawnOptions);

    let stdout = "";
    let stderr = "";
    let timeoutId: Timer | null = null;

    if (timeout) {
      timeoutId = setTimeout(() => {
        proc.kill("SIGTERM");
        resolve({ stdout, stderr: stderr + "\nCommand timed out", code: 124 });
      }, timeout);
    }

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      resolve({ stdout, stderr, code: code ?? 0 });
    });

    proc.on("error", (err) => {
      if (timeoutId) clearTimeout(timeoutId);
      resolve({ stdout: "", stderr: err.message, code: 1 });
    });
  });
}

/**
 * Run a hands CLI command synchronously
 */
export function runCliSync(
  args: string[],
  options: { cwd?: string; timeout?: number } = {}
): CliResult {
  const cliPath = findCli();
  const { cwd = process.cwd(), timeout = 30000 } = options;

  try {
    const result = execSync(`"${cliPath}" ${args.join(" ")}`, {
      cwd,
      encoding: "utf-8",
      timeout,
      stdio: ["pipe", "pipe", "pipe"],
    });

    return { stdout: result, stderr: "", code: 0 };
  } catch (error) {
    const err = error as Error & { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: err.stdout ?? "",
      stderr: err.stderr ?? err.message,
      code: err.status ?? 1,
    };
  }
}
