import { tool } from "@opencode-ai/plugin";


import { spawn, execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

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
  throw new Error(`Could not find hands-cli binary. Searched:\n${candidates.map(c => `  - ${c}`).join("\n")}`);
}

function runCli(args: string[], options: { cwd?: string; timeout?: number } = {}): Promise<{ stdout: string; stderr: string; code: number }> {
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
        resolve({ stdout, stderr: stderr + "\nCommand timed out", code: 124 });
      }, timeout);
    }
    proc.stdout?.on("data", (data) => { stdout += data.toString(); });
    proc.stderr?.on("data", (data) => { stderr += data.toString(); });
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

function runCliSync(args: string[], options: { cwd?: string; timeout?: number } = {}): { stdout: string; stderr: string; code: number } {
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
    return { stdout: err.stdout ?? "", stderr: err.stderr ?? err.message, code: err.status ?? 1 };
  }
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
    action: tool.schema.enum(["list", "add"]).describe("Action to perform: 'list' shows available sources, 'add' enables a source"),
    name: tool.schema.string().optional().describe("Source name to add (required for 'add' action). Options: hackernews, github"),
    schedule: tool.schema.string().optional().describe("Custom cron schedule (optional). Default is hourly: '0 * * * *'"),
  },

  async execute(args, _ctx) {
    const { action, name, schedule } = args;

    if (action === "list") {
      const result = await runCli(["sources"]);
      if (result.code !== 0) return `Failed to list sources: ${result.stderr || result.stdout}`;
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
      if (schedule) cmdArgs.push("-s", schedule);

      const result = await runCli(cmdArgs);

      if (result.code !== 0) {
        const errorMsg = result.stderr || result.stdout;
        if (errorMsg.includes("not found")) {
          return `Source "${name}" not found.

Available sources:
- hackernews - Hacker News stories
- github - GitHub data (requires GITHUB_TOKEN)`;
        }
        if (errorMsg.includes("package.json")) {
          return "No workbook found in current directory. Make sure you're in a workbook folder.";
        }
        return `Failed to add source: ${errorMsg}`;
      }

      let response = result.stdout || `Source "${name}" added successfully.`;
      if (name === "github") {
        response += "\n\nNote: GitHub source requires GITHUB_TOKEN. Make sure it's set in your environment or workbook secrets.";
      }
      response += "\n\nThe source will sync data automatically on schedule. Use the schema tool to see the new tables once data syncs.";
      return response;
    }

    return `Unknown action: ${action}. Use 'list' or 'add'.`;
  },
});

export default sources;
