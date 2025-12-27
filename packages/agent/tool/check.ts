import { tool } from "@opencode-ai/plugin";
import { runCli } from "../lib/cli";

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

    // Combine stdout and stderr for full output
    const output = [result.stdout, result.stderr].filter(Boolean).join("\n").trim();

    if (result.code !== 0) {
      return `Code check found issues:\n\n${output}`;
    }

    return output || "All checks passed!";
  },
});

export default check;
