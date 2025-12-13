import { spawn } from "node:child_process";
import { tool } from "@opencode-ai/plugin";

/**
 * Execute a hands CLI command and return the output
 */
function runHandsCommand(
  args: string[],
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn("hands", args, {
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

const sources = tool({
  description: `Manage external data sources for the workbook.

Data sources automatically sync data from external APIs on a schedule (e.g., hourly).

**Available sources:**
- hackernews - Sync Hacker News stories (top, new, best, ask, show, jobs)
- github - Sync GitHub data (stars, issues, PRs) - requires GITHUB_TOKEN

Use this tool to:
- List available sources and what data they provide
- Add a source to enable automatic data sync
- Check what sources are already configured`,

  args: {
    action: tool.schema
      .enum(["list", "add"])
      .describe("Action to perform: 'list' shows available sources, 'add' enables a source"),
    name: tool.schema
      .string()
      .optional()
      .describe("Source name to add (required for 'add' action). Options: hackernews, github"),
    schedule: tool.schema
      .string()
      .optional()
      .describe("Custom cron schedule (optional). Default is hourly: '0 * * * *'"),
  },

  async execute(args, _ctx) {
    const { action, name, schedule } = args;

    if (action === "list") {
      const result = await runHandsCommand(["sources"]);

      if (result.code !== 0) {
        return `Failed to list sources: ${result.stderr || result.stdout}`;
      }

      return result.stdout || "No sources available.";
    }

    if (action === "add") {
      if (!name) {
        return `Error: Source name is required for 'add' action.

Available sources:
- hackernews - Hacker News stories
- github - GitHub data (requires GITHUB_TOKEN)

Example: Use action='add' with name='hackernews'`;
      }

      const cmdArgs = ["add", "source", name];
      if (schedule) {
        cmdArgs.push("-s", schedule);
      }

      const result = await runHandsCommand(cmdArgs);

      if (result.code !== 0) {
        const errorMsg = result.stderr || result.stdout;

        // Check for common errors and provide helpful messages
        if (errorMsg.includes("not found")) {
          return `Source "${name}" not found.

Available sources:
- hackernews - Hacker News stories
- github - GitHub data (requires GITHUB_TOKEN)`;
        }

        if (errorMsg.includes("hands.json")) {
          return `No workbook found in current directory. Make sure you're in a workbook folder.`;
        }

        return `Failed to add source: ${errorMsg}`;
      }

      // Success - provide helpful next steps
      let response = result.stdout || `Source "${name}" added successfully.`;

      if (name === "github") {
        response += `\n\nNote: GitHub source requires GITHUB_TOKEN. Make sure it's set in your environment or workbook secrets.`;
      }

      response += `\n\nThe source will sync data automatically on schedule. Use the schema tool to see the new tables once data syncs.`;

      return response;
    }

    return `Unknown action: ${action}. Use 'list' or 'add'.`;
  },
});

export default sources;
