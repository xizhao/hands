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


const ui = tool({
  description: `Search and add UI components from shadcn and other registries.

Actions:
- **search**: Find components in a registry (default: @shadcn)
- **add**: Add a component to the workbook

Registries:
- @shadcn - Official shadcn/ui components
- @magicui - Animation components

Examples:
- search: \`action='search' query='button'\`
- add: \`action='add' component='@shadcn/button'\``,

  args: {
    action: tool.schema.enum(["search", "add"]).describe("Action to perform"),
    query: tool.schema.string().optional().describe("Search query for 'search' action"),
    registry: tool.schema.string().optional().describe("Registry to search (default: @shadcn)"),
    component: tool.schema.string().optional().describe("Component to add (e.g., '@shadcn/button')"),
  },

  async execute(args) {
    const { action, query, registry = "@shadcn", component } = args;

    try {
      if (action === "search") {
        const searchQuery = query ?? "";
        const result = runCliSync(["ui", "search", registry, "-q", searchQuery], { timeout: 30000 });
        if (result.code !== 0) return `Error: ${result.stderr || result.stdout}`;

        const data = JSON.parse(result.stdout.split("\n").slice(1).join("\n"));
        if (!data.items || data.items.length === 0) {
          return `No components found for "${searchQuery}" in ${registry}`;
        }

        let output = `## Components in ${registry}`;
        if (searchQuery) output += ` matching "${searchQuery}"`;
        output += `\n\nFound ${data.pagination.total} components:\n\n`;

        for (const item of data.items.slice(0, 20)) {
          output += `- **${item.name}** - \`${item.addCommandArgument}\`\n`;
        }
        if (data.pagination.hasMore) {
          output += `\n... and ${data.pagination.total - 20} more`;
        }
        output += `\n\nTo add: \`action='add' component='@shadcn/component-name'\``;
        return output;
      }

      if (action === "add") {
        if (!component) return "Error: component required for 'add' action. Example: component='@shadcn/button'";
        const workbookDir = process.cwd();
        const result = runCliSync(["ui", "add", component], { cwd: workbookDir, timeout: 60000 });
        if (result.code !== 0) return `Error: ${result.stderr || result.stdout}`;
        return `Added ${component}\n\n${result.stdout}`;
      }

      return `Unknown action: ${action}. Use 'search' or 'add'.`;
    } catch (error) {
      const err = error as Error & { stdout?: string; stderr?: string };
      return `Error: ${err.message}\n${err.stderr || err.stdout || ""}`;
    }
  },
});

export default ui;
