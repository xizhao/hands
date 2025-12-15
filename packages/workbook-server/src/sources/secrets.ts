/**
 * Source Secrets Management
 *
 * Loads secrets from .env.local file in workbook directory.
 * Sources declare secrets as string array, runtime reads from env file.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Result of loading secrets */
export type SecretLoadResult =
  | { success: true; values: Record<string, string> }
  | { success: false; missing: string[] };

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
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key) {
      env.set(key, value);
    }
  }

  return env;
}

/**
 * Read all secrets from .env.local in workbook directory
 */
export function readEnvFile(workbookDir: string): Map<string, string> {
  const envPath = join(workbookDir, ".env.local");

  if (!existsSync(envPath)) {
    return new Map();
  }

  try {
    const content = readFileSync(envPath, "utf-8");
    return parseEnvFile(content);
  } catch {
    return new Map();
  }
}

/**
 * Load secrets for a source
 *
 * @param workbookDir - Path to workbook directory
 * @param requiredSecrets - Array of required secret names
 * @returns Either secret values or list of missing keys
 */
export function loadSecrets(
  workbookDir: string,
  requiredSecrets: readonly string[],
): SecretLoadResult {
  const env = readEnvFile(workbookDir);

  const missing: string[] = [];
  const values: Record<string, string> = {};

  for (const key of requiredSecrets) {
    const value = env.get(key);
    if (!value) {
      missing.push(key);
    } else {
      values[key] = value;
    }
  }

  if (missing.length > 0) {
    return { success: false, missing };
  }

  return { success: true, values };
}

/**
 * Check which secrets are missing for a source
 */
export function checkMissingSecrets(
  workbookDir: string,
  requiredSecrets: readonly string[],
): string[] {
  const env = readEnvFile(workbookDir);
  return requiredSecrets.filter((key) => !env.has(key));
}
