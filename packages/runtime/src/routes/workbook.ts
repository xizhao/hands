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
import { json, sse } from "../router";
import type { RuntimeState } from "../state";
import { updateLockfile } from "../lockfile";
import { PostgresPool, PostgresListener } from "../db";
import { discoverPages } from "../pages/discovery";
import { discoverBlocks } from "../blocks/discovery";
import { getEventBus } from "../events";

// Re-export types from state (canonical location)
import type { WorkbookManifest } from "../state";
export type { WorkbookManifest };

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

  // GET /workbook/manifest/watch - SSE stream for manifest changes
  // Desktop app subscribes to this to get notified when pages/sources/tables change
  router.get("/workbook/manifest/watch", (req) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        const sendManifest = async (manifest: WorkbookManifest) => {
          const data = `data: ${JSON.stringify(manifest)}\n\n`;
          try {
            controller.enqueue(encoder.encode(data));
          } catch {
            // Stream closed
          }
        };

        // Add listener to state
        state.manifestListeners.add(sendManifest);

        // Send initial manifest
        try {
          const manifest = await buildManifest(state);
          await sendManifest(manifest);
        } catch (error) {
          console.error("Failed to build initial manifest:", error);
        }

        // Cleanup on close
        req.signal.addEventListener("abort", () => {
          state.manifestListeners.delete(sendManifest);
        });
      },
    });

    return sse(stream);
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

  // GET /workbook/pages/:pageId - Get MDX content for a page
  router.get("/workbook/pages/:pageId", async (req) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    const url = new URL(req.url);
    const pageId = url.pathname.split("/").pop();
    if (!pageId) {
      return json({ error: "Missing pageId" }, { status: 400 });
    }

    try {
      const content = await getPageContent(state.workbookDir, pageId);
      return json({ success: true, pageId, content });
    } catch (error) {
      console.error("Failed to get page:", error);
      return json({ error: String(error) }, { status: 404 });
    }
  });

  // PATCH /workbook/pages/:pageId/title - Update page title (frontmatter only)
  router.patch("/workbook/pages/:pageId/title", async (req) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    // Extract pageId from URL - format: /workbook/pages/{pageId}/title
    const url = new URL(req.url);
    const parts = url.pathname.split("/");
    const pageId = parts[parts.length - 2]; // Second to last segment
    if (!pageId) {
      return json({ error: "Missing pageId" }, { status: 400 });
    }

    const body = (await req.json()) as { title: string };
    if (!body.title) {
      return json({ error: "Missing title" }, { status: 400 });
    }

    try {
      await updatePageTitle(state.workbookDir, pageId, body.title);

      // Emit manifest update event so UI refreshes
      const bus = getEventBus();
      const manifest = await buildManifest(state);
      bus.emit("manifest:updated", { manifest });

      return json({ success: true, pageId, title: body.title });
    } catch (error) {
      console.error("Failed to update page title:", error);
      return json({ error: String(error) }, { status: 500 });
    }
  });

  // PUT /workbook/pages/:pageId - Update MDX content for a page
  router.put("/workbook/pages/:pageId", async (req) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    const url = new URL(req.url);
    const pageId = url.pathname.split("/").pop();
    if (!pageId) {
      return json({ error: "Missing pageId" }, { status: 400 });
    }

    const body = (await req.json()) as { content: string };
    if (!body.content) {
      return json({ error: "Missing content" }, { status: 400 });
    }

    try {
      await savePageContent(state.workbookDir, pageId, body.content);

      // Emit manifest update event so UI refreshes
      const bus = getEventBus();
      const manifest = await buildManifest(state);
      bus.emit("manifest:updated", { manifest });

      return json({ success: true, pageId });
    } catch (error) {
      console.error("Failed to save page:", error);
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
      // Import registry JSON directly instead of using CLI
      const registry = await import("@hands/stdlib/sources/registry.json");
      const sources = (registry.items || []).map((item: any) => ({
        name: item.name,
        title: item.title,
        description: item.description,
        secrets: item.secrets || [],
        streams: item.streams || [],
      }));
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

  // Discover blocks from blocks/ directory
  const blocksDir = join(workbookDir, "blocks");
  const blocksResult = await discoverBlocks(blocksDir);
  const blocks = blocksResult.blocks.map((b) => ({
    id: b.id,
    title: b.meta.title,
    description: b.meta.description,
    path: b.path,
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

  const isEmpty = pages.length === 0 && blocks.length === 0 && sources.length === 0 && tables.length === 0;

  return {
    workbookId,
    workbookDir,
    pages,
    blocks,
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

/**
 * Get MDX content for a page by ID
 * pageId maps to filename (without extension)
 */
async function getPageContent(workbookDir: string, pageId: string): Promise<string> {
  const pagesDir = join(workbookDir, "pages");

  // Try .mdx first, then .md
  const mdxPath = join(pagesDir, `${pageId}.mdx`);
  const mdPath = join(pagesDir, `${pageId}.md`);

  if (existsSync(mdxPath)) {
    return await readFile(mdxPath, "utf-8");
  } else if (existsSync(mdPath)) {
    return await readFile(mdPath, "utf-8");
  }

  throw new Error(`Page not found: ${pageId}`);
}

/**
 * Update page title in frontmatter only
 */
async function updatePageTitle(workbookDir: string, pageId: string, newTitle: string): Promise<void> {
  const content = await getPageContent(workbookDir, pageId);

  // Update or add frontmatter with new title
  let updatedContent: string;

  if (content.startsWith("---")) {
    const endIndex = content.indexOf("---", 3);
    if (endIndex !== -1) {
      // Has existing frontmatter - update title
      const frontmatter = content.slice(3, endIndex);
      const body = content.slice(endIndex + 3);

      // Update or add title in frontmatter
      const lines = frontmatter.split("\n");
      let titleFound = false;
      const updatedLines = lines.map(line => {
        if (line.startsWith("title:")) {
          titleFound = true;
          return `title: "${newTitle}"`;
        }
        return line;
      });

      if (!titleFound) {
        updatedLines.unshift(`title: "${newTitle}"`);
      }

      updatedContent = `---\n${updatedLines.join("\n").trim()}\n---${body}`;
    } else {
      // Malformed frontmatter - add proper one
      updatedContent = `---\ntitle: "${newTitle}"\n---\n\n${content}`;
    }
  } else {
    // No frontmatter - add it
    updatedContent = `---\ntitle: "${newTitle}"\n---\n\n${content}`;
  }

  await savePageContent(workbookDir, pageId, updatedContent);
}

/**
 * Save MDX content for a page by ID
 */
async function savePageContent(workbookDir: string, pageId: string, content: string): Promise<void> {
  const pagesDir = join(workbookDir, "pages");

  // Ensure pages directory exists
  await mkdir(pagesDir, { recursive: true });

  // Try to find existing file first (.mdx or .md)
  const mdxPath = join(pagesDir, `${pageId}.mdx`);
  const mdPath = join(pagesDir, `${pageId}.md`);

  // Write to existing file location, or default to .mdx
  if (existsSync(mdPath)) {
    await writeFile(mdPath, content, "utf-8");
  } else {
    await writeFile(mdxPath, content, "utf-8");
  }
}
