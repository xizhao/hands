/**
 * Workbook routes - /workbook/*
 *
 * Provides filesystem-based workbook state management.
 * The filesystem is the source of truth - runtime reads/writes it.
 */

import { existsSync } from "fs";
import { readdir, readFile, writeFile, mkdir } from "fs/promises";
import { join, basename } from "path";
import type { Router } from "../router";
import { json } from "../router";
import type { RuntimeState } from "../state";
import { updateLockfile } from "../lockfile";
import { PostgresPool, PostgresListener } from "../db";
import { discoverPages } from "../pages/discovery";

// Types for workbook manifest
export interface WorkbookPage {
  id: string;
  route: string;
  title: string;
  path: string;  // Relative path in pages/
}

export interface WorkbookSource {
  name: string;
  enabled: boolean;
  schedule?: string;
}

export interface WorkbookManifest {
  workbookId: string;
  workbookDir: string;
  pages: WorkbookPage[];
  sources: WorkbookSource[];
  tables: string[];
  isEmpty: boolean;
}

export function registerWorkbookRoutes(router: Router, getState: () => RuntimeState | null): void {
  // POST /workbook/switch - Switch to different workbook
  router.post("/workbook/switch", async (req) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    const body = (await req.json()) as { workbookId: string; workbookDir: string };
    if (!body.workbookId || !body.workbookDir) {
      return json({ error: "Missing workbookId or workbookDir" }, { status: 400 });
    }

    console.log(`Switching workbook from ${state.workbookId} to ${body.workbookId}`);

    // Stop listener and close pool
    await state.listener.stop();
    await state.pool.close();

    // Switch postgres to new workbook
    const newDatabase = `hands_${body.workbookId.replace(/-/g, "_")}`;
    await state.postgres.switchWorkbook(`${body.workbookDir}/db`, newDatabase);

    // Reconnect pool with new connection string
    state.pool = new PostgresPool(state.postgres.connectionString);
    state.pool.connect();

    // Restart listener with new connection
    state.listener = new PostgresListener(state.postgres.connectionString);
    try {
      await state.listener.start();
      state.listener.subscribe((change) => {
        for (const listener of state.changeListeners) {
          listener(change);
        }
      });
    } catch (err) {
      console.error("[runtime] Failed to restart change listener:", err);
    }

    // Switch worker to new workbook
    await state.worker.switchWorkbook(body.workbookDir);

    // Update state
    state.workbookId = body.workbookId;
    state.workbookDir = body.workbookDir;

    // Update lockfile
    await updateLockfile({
      workbookId: body.workbookId,
      workbookDir: body.workbookDir,
      postgresPid: state.postgres.status.pid,
      wranglerPort: state.worker.status.port,
    });

    console.log(`Switched to workbook ${body.workbookId}`);
    return json({ success: true, workbookId: body.workbookId });
  });

  // GET /workbook/manifest - Get full workbook state from filesystem
  router.get("/workbook/manifest", async () => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    try {
      const manifest = await buildManifest(state);
      return json(manifest);
    } catch (error) {
      console.error("Failed to build manifest:", error);
      return json({ error: String(error) }, { status: 500 });
    }
  });

  // POST /workbook/pages/create - Create a new MDX page
  router.post("/workbook/pages/create", async (req) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    const body = (await req.json()) as { title?: string };
    const title = body.title || "Untitled";

    try {
      const page = await createPage(state.workbookDir, title);
      return json({ success: true, page });
    } catch (error) {
      console.error("Failed to create page:", error);
      return json({ error: String(error) }, { status: 500 });
    }
  });

  // POST /workbook/sources/add - Add source from registry
  router.post("/workbook/sources/add", async (req) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    const body = (await req.json()) as { sourceName: string; schedule?: string };
    if (!body.sourceName) {
      return json({ error: "Missing sourceName" }, { status: 400 });
    }

    try {
      // Import and call stdlib addSource
      const { addSource } = await import("@hands/stdlib/cli");
      const result = await addSource(body.sourceName, {
        workbookDir: state.workbookDir,
        schedule: body.schedule,
      });

      return json(result);
    } catch (error) {
      console.error("Failed to add source:", error);
      return json({ error: String(error) }, { status: 500 });
    }
  });

  // GET /workbook/sources/available - List available sources from registry
  router.get("/workbook/sources/available", async () => {
    try {
      const { listSources } = await import("@hands/stdlib/cli");
      const sources = listSources();
      return json({ sources });
    } catch (error) {
      console.error("Failed to list sources:", error);
      return json({ error: String(error) }, { status: 500 });
    }
  });

  // POST /workbook/files/import - Import a file (CSV, JSON, Parquet)
  router.post("/workbook/files/import", async (req) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    try {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;

      if (!file) {
        return json({ error: "No file provided" }, { status: 400 });
      }

      const result = await importFile(state, file);
      return json(result);
    } catch (error) {
      console.error("Failed to import file:", error);
      return json({ error: String(error) }, { status: 500 });
    }
  });
}

/**
 * Build the workbook manifest from filesystem state
 */
async function buildManifest(state: RuntimeState): Promise<WorkbookManifest> {
  const { workbookId, workbookDir, pool } = state;

  // Discover pages from pages/ directory
  const pagesDir = join(workbookDir, "pages");
  const pagesResult = await discoverPages(pagesDir);
  const pages: WorkbookPage[] = pagesResult.pages.map((p) => ({
    id: p.path.replace(/\.(md|mdx)$/, "").replace(/\//g, "-") || "index",
    route: p.route,
    title: p.meta.title,
    path: p.path,
  }));

  // Read sources from hands.json
  const sources: WorkbookSource[] = [];
  const handsJsonPath = join(workbookDir, "hands.json");
  if (existsSync(handsJsonPath)) {
    try {
      const content = await readFile(handsJsonPath, "utf-8");
      const config = JSON.parse(content);
      if (config.sources) {
        for (const [name, sourceConfig] of Object.entries(config.sources)) {
          const sc = sourceConfig as { enabled?: boolean; schedule?: string };
          sources.push({
            name,
            enabled: sc.enabled !== false,
            schedule: sc.schedule,
          });
        }
      }
    } catch (err) {
      console.error("Failed to read hands.json:", err);
    }
  }

  // Get tables from postgres
  let tables: string[] = [];
  try {
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    tables = result.rows.map((r) => r.table_name as string);
  } catch (err) {
    console.error("Failed to get tables:", err);
  }

  const isEmpty = pages.length === 0 && sources.length === 0 && tables.length === 0;

  return {
    workbookId,
    workbookDir,
    pages,
    sources,
    tables,
    isEmpty,
  };
}

/**
 * Create a new MDX page
 */
async function createPage(workbookDir: string, title: string): Promise<WorkbookPage> {
  const pagesDir = join(workbookDir, "pages");

  // Ensure pages directory exists
  await mkdir(pagesDir, { recursive: true });

  // Generate a slug from title
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    || "untitled";

  // Find unique filename
  let filename = `${slug}.mdx`;
  let counter = 1;
  while (existsSync(join(pagesDir, filename))) {
    filename = `${slug}-${counter}.mdx`;
    counter++;
  }

  // Create MDX content with frontmatter
  const content = `---
title: "${title}"
---

# ${title}

Start writing here...
`;

  await writeFile(join(pagesDir, filename), content, "utf-8");

  return {
    id: filename.replace(/\.mdx$/, ""),
    route: `/${filename.replace(/\.mdx$/, "")}`,
    title,
    path: filename,
  };
}

/**
 * Import a file into the workbook
 */
async function importFile(
  state: RuntimeState,
  file: File
): Promise<{ success: boolean; tableName?: string; rowCount?: number; error?: string }> {
  const { workbookDir, pool } = state;

  // Determine file type from extension
  const filename = file.name;
  const ext = filename.split(".").pop()?.toLowerCase();

  if (!ext || !["csv", "json", "parquet"].includes(ext)) {
    return { success: false, error: `Unsupported file type: ${ext}` };
  }

  // Save file to data/ directory
  const dataDir = join(workbookDir, "data");
  await mkdir(dataDir, { recursive: true });

  const filePath = join(dataDir, filename);
  const buffer = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(buffer));

  // Generate table name from filename
  const tableName = filename
    .replace(/\.[^.]+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    || "imported_data";

  try {
    let rowCount = 0;

    if (ext === "csv") {
      // Use PostgreSQL COPY to import CSV
      // First, read the CSV to get headers
      const content = await readFile(filePath, "utf-8");
      const lines = content.trim().split("\n");
      if (lines.length === 0) {
        return { success: false, error: "Empty CSV file" };
      }

      const headers = parseCSVLine(lines[0]);
      const columns = headers.map((h) => `"${sanitizeColumnName(h)}" TEXT`);

      // Create table
      await pool.query(`DROP TABLE IF EXISTS "${tableName}"`);
      await pool.query(`CREATE TABLE "${tableName}" (${columns.join(", ")})`);

      // Insert data row by row (safer than COPY for various CSV formats)
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length === headers.length) {
          const placeholders = values.map((_, idx) => `$${idx + 1}`).join(", ");
          await pool.query(
            `INSERT INTO "${tableName}" VALUES (${placeholders})`,
            values
          );
          rowCount++;
        }
      }
    } else if (ext === "json") {
      // Read JSON and insert
      const content = await readFile(filePath, "utf-8");
      const data = JSON.parse(content);

      if (!Array.isArray(data) || data.length === 0) {
        return { success: false, error: "JSON must be an array of objects" };
      }

      // Get columns from first object
      const columns = Object.keys(data[0]).map(
        (k) => `"${sanitizeColumnName(k)}" TEXT`
      );

      // Create table
      await pool.query(`DROP TABLE IF EXISTS "${tableName}"`);
      await pool.query(`CREATE TABLE "${tableName}" (${columns.join(", ")})`);

      // Insert data
      for (const row of data) {
        const keys = Object.keys(row);
        const values = keys.map((k) => String(row[k] ?? ""));
        const placeholders = values.map((_, idx) => `$${idx + 1}`).join(", ");
        const columnNames = keys.map((k) => `"${sanitizeColumnName(k)}"`).join(", ");
        await pool.query(
          `INSERT INTO "${tableName}" (${columnNames}) VALUES (${placeholders})`,
          values
        );
        rowCount++;
      }
    } else if (ext === "parquet") {
      // Parquet requires special handling - for now just return error
      return { success: false, error: "Parquet import not yet implemented" };
    }

    return { success: true, tableName, rowCount };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Parse a CSV line (simple implementation)
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Sanitize column name for PostgreSQL
 */
function sanitizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_")
    || "column";
}
