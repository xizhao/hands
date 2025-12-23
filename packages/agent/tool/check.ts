import { spawn } from "node:child_process";
import path from "node:path";
import { tool } from "@opencode-ai/plugin";

// Path to CLI binary (relative to this file in agent/tool/)
const CLI_PATH = path.resolve(
  import.meta.dirname ?? import.meta.dir ?? __dirname,
  "../../cli/bin/hands.js"
);

/**
 * Execute a hands CLI command and return the output
 */
function runHandsCommand(
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn("node", [CLI_PATH, ...args], {
      cwd: process.cwd(),
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 0 });
    });

    proc.on("error", (err) => {
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

    const result = await runHandsCommand(cmdArgs);

    // Combine stdout and stderr for full output
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

    if (result.code !== 0) {
      return `Code check found issues:\n\n${output}`;
    }

    return output || "All checks passed!";
  },
});

export default check;
