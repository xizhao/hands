/**
 * Source HTTP Routes
 *
 * v2 Sources API for table containers with optional Electric-SQL subscriptions.
 *
 * POST /sources/create      - Create a new source (v2 - table containers)
 * POST /sources/list-remote - List tables in a remote Postgres database
 * POST /secrets             - Save secrets to .env.local
 * GET  /secrets             - Get configured secrets
 */

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import type { Hono } from "hono";
import { createSource, listRemoteTables } from "./create.js";
import { readEnvFile } from "./secrets.js";

interface SourceRoutesConfig {
  workbookDir: string;
  isDbReady: () => boolean;
  getDb?: () => PGlite | null;
}

/**
 * Register source routes on a Hono app
 */
export function registerSourceRoutes(app: Hono, config: SourceRoutesConfig) {
  const { workbookDir, isDbReady, getDb } = config;

  // ============================================
  // Secrets Management Routes
  // ============================================

  // Save secrets to .env.local
  app.post("/secrets", async (c) => {
    const { secrets } = await c.req.json<{ secrets: Record<string, string> }>();

    if (!secrets || typeof secrets !== "object") {
      return c.json({ success: false, error: "Missing secrets in request body" }, 400);
    }

    const envPath = join(workbookDir, ".env.local");

    try {
      // Read existing env file
      const existingEnv = readEnvFile(workbookDir);

      // Merge new secrets with existing
      for (const [key, value] of Object.entries(secrets)) {
        existingEnv.set(key, value);
      }

      // Write back all secrets
      const lines: string[] = [];
      for (const [key, value] of existingEnv.entries()) {
        // Quote values that contain spaces or special characters
        const needsQuotes = /[\s"'=]/.test(value);
        const quotedValue = needsQuotes ? `"${value.replace(/"/g, '\\"')}"` : value;
        lines.push(`${key}=${quotedValue}`);
      }

      writeFileSync(envPath, `${lines.join("\n")}\n`);

      return c.json({
        success: true,
        saved: Object.keys(secrets),
      });
    } catch (err) {
      return c.json(
        {
          success: false,
          error: err instanceof Error ? err.message : "Failed to save secrets",
        },
        500,
      );
    }
  });

  // Get configured secrets (returns which keys exist, not values)
  app.get("/secrets", (c) => {
    const env = readEnvFile(workbookDir);
    return c.json({
      configured: Array.from(env.keys()),
    });
  });

  // ============================================
  // Sources v2 Routes - Table Containers
  // ============================================

  // Create a new source (v2 - table containers)
  // POST /sources/create
  app.post("/sources/create", async (c) => {
    if (!isDbReady() || !getDb) {
      return c.json({ success: false, error: "Database not ready" }, 503);
    }

    const db = getDb();
    if (!db) {
      return c.json({ success: false, error: "Database not available" }, 503);
    }

    const body = await c.req.json<{
      name: string;
      from?: string;
      tables?: string[];
      where?: string;
      description?: string;
    }>();

    const result = await createSource(workbookDir, db, {
      name: body.name,
      from: body.from,
      tables: body.tables,
      where: body.where,
      description: body.description,
    });

    if (result.success) {
      return c.json(
        {
          success: true,
          sourcePath: result.sourcePath,
          tables: result.tables,
        },
        201,
      );
    } else {
      return c.json(
        {
          success: false,
          error: result.error,
        },
        400,
      );
    }
  });

  // List tables in a remote Postgres database
  // POST /sources/list-remote
  app.post("/sources/list-remote", async (c) => {
    const { connectionString } = await c.req.json<{ connectionString: string }>();

    if (!connectionString) {
      return c.json({ success: false, error: "connectionString is required" }, 400);
    }

    const result = await listRemoteTables(connectionString);

    if (result.success) {
      return c.json({
        success: true,
        tables: result.tables,
      });
    } else {
      return c.json(
        {
          success: false,
          error: result.error,
        },
        400,
      );
    }
  });
}
