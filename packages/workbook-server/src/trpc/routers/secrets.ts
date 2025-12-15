/**
 * tRPC Router for Secrets Management
 *
 * Type-safe API for managing environment secrets stored in .env.local
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";

// ============================================================================
// Context
// ============================================================================

export interface SecretsContext {
  workbookDir: string;
}

// ============================================================================
// tRPC Setup
// ============================================================================

const t = initTRPC.context<SecretsContext>().create();

const publicProcedure = t.procedure;

// ============================================================================
// Input Schemas
// ============================================================================

const saveSecretsInput = z.object({
  secrets: z.record(z.string()),
});

// ============================================================================
// Helpers
// ============================================================================

function getEnvLocalPath(workbookDir: string): string {
  return join(workbookDir, ".env.local");
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
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env.set(key, value);
  }
  return env;
}

function serializeEnvFile(env: Map<string, string>): string {
  const lines: string[] = [];
  for (const [key, value] of env) {
    // Quote values that contain spaces or special characters
    const needsQuotes = /[\s"'$`\\]/.test(value);
    const serialized = needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value;
    lines.push(`${key}=${serialized}`);
  }
  return lines.join("\n") + "\n";
}

// ============================================================================
// Router
// ============================================================================

export const secretsRouter = t.router({
  /** Save secrets to .env.local (merges with existing) */
  save: publicProcedure
    .input(saveSecretsInput)
    .mutation(async ({ ctx, input }) => {
      const envPath = getEnvLocalPath(ctx.workbookDir);

      // Read existing secrets
      let existing = new Map<string, string>();
      if (existsSync(envPath)) {
        try {
          existing = parseEnvFile(readFileSync(envPath, "utf-8"));
        } catch {
          // Ignore parse errors, start fresh
        }
      }

      // Merge new secrets
      const saved: string[] = [];
      for (const [key, value] of Object.entries(input.secrets)) {
        if (value && value.trim()) {
          existing.set(key, value.trim());
          saved.push(key);
        }
      }

      // Write back
      try {
        writeFileSync(envPath, serializeEnvFile(existing));
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to write .env.local: ${err instanceof Error ? err.message : String(err)}`,
        });
      }

      return { success: true, saved };
    }),

  /** List configured secret keys (not values) */
  list: publicProcedure.query(({ ctx }) => {
    const envPath = getEnvLocalPath(ctx.workbookDir);

    if (!existsSync(envPath)) {
      return { configured: [] as string[] };
    }

    try {
      const env = parseEnvFile(readFileSync(envPath, "utf-8"));
      return { configured: Array.from(env.keys()) };
    } catch {
      return { configured: [] as string[] };
    }
  }),
});

export type SecretsRouter = typeof secretsRouter;
