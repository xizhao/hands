/**
 * Secrets routes - /secrets/*
 *
 * Manages workbook secrets stored in .env.local
 */

import { existsSync } from "fs";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import type { Router } from "../router";
import { json } from "../router";
import type { RuntimeState } from "../state";

/**
 * Parse .env.local file into a map of key-value pairs
 */
function parseEnvFile(content: string): Map<string, string> {
  const env = new Map<string, string>();

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Remove surrounding quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (key) {
      env.set(key, value);
    }
  }

  return env;
}

/**
 * Serialize a map of secrets to .env.local format
 */
function serializeEnvFile(secrets: Map<string, string>): string {
  const lines: string[] = [
    "# Workbook secrets - managed by Hands",
    "# DO NOT commit this file to version control",
    "",
  ];

  for (const [key, value] of secrets) {
    // Quote values that contain special characters
    const needsQuotes = value.includes(" ") || value.includes("=") || value.includes("#");
    const quotedValue = needsQuotes ? `"${value}"` : value;
    lines.push(`${key}=${quotedValue}`);
  }

  return lines.join("\n") + "\n";
}

export function registerSecretsRoutes(router: Router, getState: () => RuntimeState | null): void {
  // POST /secrets - Save secrets (merge with existing)
  router.post("/secrets", async (req) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    const body = (await req.json()) as { secrets: Record<string, string> };
    if (!body.secrets || typeof body.secrets !== "object") {
      return json({ error: "Invalid request body, expected { secrets: { KEY: value } }" }, { status: 400 });
    }

    const envPath = join(state.workbookDir, ".env.local");

    try {
      // Read existing secrets
      let existing = new Map<string, string>();
      if (existsSync(envPath)) {
        const content = await readFile(envPath, "utf-8");
        existing = parseEnvFile(content);
      }

      // Merge new secrets
      for (const [key, value] of Object.entries(body.secrets)) {
        if (typeof value === "string" && value.trim()) {
          existing.set(key, value);
        }
      }

      // Write back
      const content = serializeEnvFile(existing);
      await writeFile(envPath, content, "utf-8");

      console.log(`[secrets] Saved ${Object.keys(body.secrets).length} secrets to ${envPath}`);

      return json({
        success: true,
        keys: Array.from(existing.keys()),
      });
    } catch (error) {
      console.error("Failed to save secrets:", error);
      return json({ error: String(error) }, { status: 500 });
    }
  });

  // DELETE /secrets/:key - Delete a specific secret
  router.delete("/secrets/:key", async (req) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    const url = new URL(req.url);
    const key = url.pathname.split("/").pop();
    if (!key) {
      return json({ error: "Missing secret key" }, { status: 400 });
    }

    const envPath = join(state.workbookDir, ".env.local");

    if (!existsSync(envPath)) {
      return json({ error: "No secrets file exists" }, { status: 404 });
    }

    try {
      const content = await readFile(envPath, "utf-8");
      const secrets = parseEnvFile(content);

      if (!secrets.has(key)) {
        return json({ error: `Secret ${key} not found` }, { status: 404 });
      }

      secrets.delete(key);

      // Write back
      const newContent = serializeEnvFile(secrets);
      await writeFile(envPath, newContent, "utf-8");

      console.log(`[secrets] Deleted secret ${key}`);

      return json({ success: true, deleted: key });
    } catch (error) {
      console.error("Failed to delete secret:", error);
      return json({ error: String(error) }, { status: 500 });
    }
  });
}
