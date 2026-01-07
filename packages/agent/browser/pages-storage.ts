/**
 * Pages Storage Layer
 *
 * Persists MDX pages to SQLite via DatabaseContext.
 * Uses internal _pages table to separate from user data.
 */

import type { DatabaseContext, PagesContext } from "./tools";

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
  }

  async function deletePage(pageId: string): Promise<void> {
    const path = pageIdToPath(pageId);
    await db.execute("DELETE FROM _pages WHERE path = ?", [path]);
    db.notifyChange();
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

  return {
    listPages,
    readPage,
    writePage,
    deletePage,
    searchPages,
  };
}
