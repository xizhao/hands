import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tool } from "@opencode-ai/plugin";

let cachedCliPath: string | null = null;

function getTargetTriple(): string {
  const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
  if (process.platform === "darwin") return `${arch}-apple-darwin`;
  if (process.platform === "win32") return `${arch}-pc-windows-msvc`;
  return `${arch}-unknown-linux-gnu`;
}

function findCli(): string {
  if (cachedCliPath) return cachedCliPath;
  const execDir = dirname(process.execPath);
  const candidates = [
    resolve(execDir, process.platform === "win32" ? "hands-cli.exe" : "hands-cli"),
    resolve(execDir, "../Resources", "hands-cli"),
    resolve(execDir, `hands-cli-${getTargetTriple()}`),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      cachedCliPath = candidate;
      return cachedCliPath;
    }
  }
  throw new Error(
    `Could not find hands-cli binary. Searched:\n${candidates.map((c) => `  - ${c}`).join("\n")}`,
  );
}

function runCli(
  args: string[],
  options: { cwd?: string; timeout?: number } = {},
): Promise<{ stdout: string; stderr: string; code: number }> {
  const cliPath = findCli();
  const { cwd = process.cwd(), timeout } = options;
  return new Promise((resolve) => {
    const proc = spawn(cliPath, args, { cwd, env: process.env });
    let stdout = "";
    let stderr = "";
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    if (timeout) {
      timeoutId = setTimeout(() => {
        proc.kill("SIGTERM");
        resolve({ stdout, stderr: `${stderr}\nCommand timed out`, code: 124 });
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

const check = tool({
  description: `Run code quality checks on the workbook.

Checks include:
- **TypeScript** - Type checking and compile errors
- **Formatting** - Code style (can auto-fix)
- **Unused code** - Dead exports and files

Use this tool to:
- Verify code compiles without errors
- Auto-fix formatting issues
- Find unused code to clean up`,

  args: {
    fix: tool.schema.boolean().optional().describe("Auto-fix formatting issues (default: true)"),
    strict: tool.schema
      .boolean()
      .optional()
      .describe("Treat warnings and unused code as errors (default: false)"),
  },

  async execute(args, _ctx) {
    const { fix = true, strict = false } = args;

    const cmdArgs = ["check"];
    if (fix) cmdArgs.push("--fix");
    if (strict) cmdArgs.push("--strict");

    const result = await runCli(cmdArgs);
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

    if (result.code !== 0) {
      return `Code check found issues:\n\n${output}`;
    }

    return output || "All checks passed!";
  },
});

export default check;
