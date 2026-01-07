/**
 * Pages Storage Layer
 *
 * Persists MDX pages to SQLite via DatabaseContext.
 * Uses internal _pages table to separate from user data.
 */

import type { DatabaseContext, PagesContext, PageValidationResult, PageValidationError } from "./tools";
import { emitEvent } from "./api";
import { extractMdxComponents, validateMdxContent, type ValidationContext } from "@hands/core/validation";

// ============================================================================
// Types
// ============================================================================

interface PageRow {
  path: string;
  content: string;
  title: string | null;
  created_at: number;
  updated_at: number;
}

interface PageInfo {
  pageId: string;
  title: string;
}

interface PageContent {
  content: string;
  title: string;
}

interface SearchResult {
  pageId: string;
  title: string;
  matches: string[];
}

// ============================================================================
// Helpers
// ============================================================================

/** Extract title from MDX frontmatter */
function extractTitle(content: string): string {
  const match = content.match(/^---\s*\n[\s\S]*?title:\s*["']?(.+?)["']?\s*\n[\s\S]*?---/);
  return match?.[1]?.trim() ?? "Untitled";
}

/** Convert path to pageId (strip .mdx extension) */
function pathToPageId(path: string): string {
  return path.replace(/\.mdx$/, "");
}

/** Convert pageId to path (add .mdx extension) */
function pageIdToPath(pageId: string): string {
  return pageId.endsWith(".mdx") ? pageId : `${pageId}.mdx`;
}

// ============================================================================
// Pages Storage Implementation
// ============================================================================

/**
 * Create a PagesContext backed by SQLite storage.
 * Uses the _pages internal table.
 */
export function createPagesStorage(db: DatabaseContext): PagesContext {
  async function listPages(): Promise<PageInfo[]> {
    const rows = await db.query<PageRow>(
      "SELECT path, title, content FROM _pages ORDER BY updated_at DESC"
    );

    return (rows as PageRow[]).map((row) => ({
      pageId: pathToPageId(row.path),
      title: row.title ?? extractTitle(row.content),
    }));
  }

  async function readPage(pageId: string): Promise<PageContent | null> {
    const path = pageIdToPath(pageId);
    const rows = await db.query<PageRow>(
      "SELECT content, title FROM _pages WHERE path = ?",
      [path]
    );

    const row = (rows as PageRow[])[0];
    if (!row) return null;

    return {
      content: row.content,
      title: row.title ?? extractTitle(row.content),
    };
  }

  async function writePage(pageId: string, content: string): Promise<void> {
    const path = pageIdToPath(pageId);
    const title = extractTitle(content);
    const now = Date.now();

    // Upsert - try update first, then insert if not exists
    await db.execute(
      `INSERT INTO _pages (path, content, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(path) DO UPDATE SET
         content = excluded.content,
         title = excluded.title,
         updated_at = excluded.updated_at`,
      [path, content, title, now, now]
    );

    db.notifyChange();
    emitEvent({ type: "page.updated", pageId });
  }

  async function deletePage(pageId: string): Promise<void> {
    const path = pageIdToPath(pageId);
    await db.execute("DELETE FROM _pages WHERE path = ?", [path]);
    db.notifyChange();
    emitEvent({ type: "page.updated", pageId });
  }

  async function searchPages(query: string): Promise<SearchResult[]> {
    // Use LIKE for simple text search
    // For better search, consider FTS5 extension
    const searchPattern = `%${query}%`;

    const rows = await db.query<PageRow>(
      `SELECT path, title, content FROM _pages
       WHERE content LIKE ?
       ORDER BY updated_at DESC`,
      [searchPattern]
    );

    const results: SearchResult[] = [];
    const lowerQuery = query.toLowerCase();

    for (const row of rows as PageRow[]) {
      const lines = row.content.split("\n");
      const matches: string[] = [];

      for (const line of lines) {
        if (line.toLowerCase().includes(lowerQuery)) {
          matches.push(line.trim());
          if (matches.length >= 3) break; // Limit context lines
        }
      }

      if (matches.length > 0) {
        results.push({
          pageId: pathToPageId(row.path),
          title: row.title ?? extractTitle(row.content),
          matches,
        });
      }
    }

    return results;
  }

  async function validatePage(content: string): Promise<PageValidationResult> {
    const errors: PageValidationError[] = [];
    const queryTests: PageValidationResult["queryTests"] = [];

    // Get schema for validation context
    const schema = db.getSchema();
    const pages = await listPages();

    // Build validation context for static validation
    const ctx: ValidationContext = {
      pageRefs: pages.map(p => p.pageId),
      schema: schema.map(t => ({
        name: t.table_name,
        columns: t.columns.map(c => c.name),
      })),
    };

    // Static validation (MDX structure, component props)
    // Skip SQL schema validation here - we'll do runtime validation instead
    const staticErrors = validateMdxContent(content, ctx);
    for (const err of staticErrors) {
      // Skip static SQL errors - runtime validation is more accurate
      if (err.prop === "query" && err.message.startsWith("Unknown table")) {
        continue;
      }
      errors.push({
        line: err.line,
        component: err.component || undefined,
        message: err.message,
        severity: err.severity,
      });
    }

    // Runtime validation: Actually execute each LiveValue query
    // This catches real errors like missing tables, bad syntax, etc.
    const components = extractMdxComponents(content);
    for (const comp of components) {
      if (comp.name === "LiveValue" && comp.props.query) {
        const query = comp.props.query;
        try {
          const rows = await db.query(query);
          queryTests.push({
            query,
            success: true,
            rowCount: Array.isArray(rows) ? rows.length : 0,
          });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          queryTests.push({
            query,
            success: false,
            error: errorMessage,
          });
          errors.push({
            line: comp.line,
            component: "LiveValue",
            message: `Query failed: ${errorMessage}`,
            severity: "error",
          });
        }
      }
    }

    return {
      valid: errors.filter(e => e.severity === "error").length === 0,
      errors,
      queryTests,
    };
  }

  return {
    listPages,
    readPage,
    writePage,
    deletePage,
    searchPages,
    validatePage,
  };
}
