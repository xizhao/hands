import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { tool } from "@opencode-ai/plugin";

interface SecretsRequestOutput {
  type: "secrets_request";
  secrets: Array<{
    key: string;
    description: string;
    required: boolean;
    exists: boolean;
  }>;
  message: string;
}

function parseEnvFile(content: string): Map<string, string> {
  const env = new Map<string, string>();
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) env.set(key, value);
  }
  return env;
}

async function readSecrets(workbookDir: string): Promise<Map<string, string>> {
  const envPath = join(workbookDir, ".env.local");
  if (!existsSync(envPath)) return new Map();
  try {
    const content = await readFile(envPath, "utf-8");
    return parseEnvFile(content);
  } catch {
    return new Map();
  }
}

const KNOWN_SECRETS: Record<string, string> = {
  GITHUB_TOKEN: "GitHub personal access token for API access",
  OPENAI_API_KEY: "OpenAI API key for AI features",
  ANTHROPIC_API_KEY: "Anthropic API key for Claude",
  DATABASE_URL: "External database connection string",
  POSTHOG_API_KEY: "PostHog analytics API key",
  STRIPE_SECRET_KEY: "Stripe secret key for payments",
  SENDGRID_API_KEY: "SendGrid API key for email",
  AWS_ACCESS_KEY_ID: "AWS access key ID",
  AWS_SECRET_ACCESS_KEY: "AWS secret access key",
};

const secrets = tool({
  description: `Check for required secrets and request missing ones from the user.

Use this tool when you need API keys, tokens, or other credentials to connect to external services.

**Actions:**
- \`check\`: Check if specific secrets exist (returns true/false per key, never the values).
- \`request\`: Request secrets from the user. Shows a form in the UI for the user to enter values.

**Important:**
- When a source or API requires credentials, ALWAYS use this tool to check/request them first
- For GitHub source: check for GITHUB_TOKEN
- After user provides secrets, you can retry your operation
- You will NEVER see secret values - only whether they exist or not`,

  args: {
    action: tool.schema
      .enum(["check", "request"])
      .describe("Action: check if secrets exist, or request from user"),
    keys: tool.schema
      .array(tool.schema.string())
      .optional()
      .describe("Secret keys to check or request (e.g., ['GITHUB_TOKEN'])"),
  },

  async execute(args, _ctx) {
    const { action, keys } = args;
    const workbookDir = process.cwd();
    const existingSecrets = await readSecrets(workbookDir);

    if (action === "check") {
      if (!keys || keys.length === 0) return "Error: 'keys' parameter required for check action.";
      const results = keys.map((key) => ({ key, exists: existingSecrets.has(key) }));
      const missing = results.filter((r) => !r.exists).map((r) => r.key);
      const present = results.filter((r) => r.exists).map((r) => r.key);
      if (missing.length === 0) return `All secrets present: ${present.join(", ")}`;
      return `Secrets check:\n- Present: ${present.length > 0 ? present.join(", ") : "none"}\n- Missing: ${missing.join(", ")}\n\nUse action="request" to ask the user to provide the missing secrets.`;
    }

    if (action === "request") {
      if (!keys || keys.length === 0) return "Error: 'keys' parameter required for request action.";
      const secretsInfo = keys.map((key) => ({
        key,
        description: KNOWN_SECRETS[key] || `Secret value for ${key}`,
        required: true,
        exists: existingSecrets.has(key),
      }));
      const missing = secretsInfo.filter((s) => !s.exists);
      if (missing.length === 0) return `All requested secrets already exist: ${keys.join(", ")}`;
      const output: SecretsRequestOutput = {
        type: "secrets_request",
        secrets: secretsInfo,
        message: `Please provide the following secret${missing.length > 1 ? "s" : ""} to continue:`,
      };
      return JSON.stringify(output);
    }

    return `Unknown action: ${action}. Use 'check' or 'request'.`;
  },
});

export default secrets;
