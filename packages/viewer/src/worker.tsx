/**
 * Hands Viewer Worker
 *
 * Multi-tenant viewer for published workbooks.
 * Uses rwsdk for SSR/hydration, D1 HTTP API for data.
 */

import { render, route } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";
import { parseMdxToPlate } from "@hands/core/primitives/serialization/mdx-parser";
import { PageStatic } from "@hands/runtime/components/PageStatic";
import { Document } from "./Document";
import { D1Client, type D1ClientConfig } from "./lib/d1-client";
import { createViewerDbAdapter } from "./lib/db-adapter";
import {
  setEnv,
  getEnv,
  setNavPages,
  setWorkbookTitle,
  clearContext,
} from "./lib/request-context";

// =============================================================================
// Types
// =============================================================================

interface ViewerEnv {
  CF_ACCOUNT_ID: string;
  CF_API_TOKEN: string;
  ASSETS: Fetcher;
}

interface PageRow {
  id: string;
  path: string;
  title: string;
  content: string;
}

// =============================================================================
// D1 Database Registry
// =============================================================================

const DB_REGISTRY: Record<string, string> = {};

async function getWorkbookDbId(
  workbookId: string,
  config: D1ClientConfig
): Promise<string | null> {
  if (DB_REGISTRY[workbookId]) {
    return DB_REGISTRY[workbookId];
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/d1/database`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${config.apiToken}` }
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    success: boolean;
    result: Array<{ uuid: string; name: string }>;
  };

  if (!data.success) return null;

  const dbName = `hands-wb-${workbookId.slice(0, 40)}`;
  const db = data.result.find((d) => d.name === dbName);

  if (db) {
    DB_REGISTRY[workbookId] = db.uuid;
    return db.uuid;
  }

  return null;
}

// =============================================================================
// Page Component
// =============================================================================

interface ViewerPageProps {
  page: PageRow;
  dbAdapter: ReturnType<typeof createViewerDbAdapter>;
}

function ViewerPage({ page, dbAdapter }: ViewerPageProps) {
  const { value, errors } = parseMdxToPlate(page.content);
  if (errors.length > 0) {
    console.error("MDX parse errors:", errors);
  }

  return <PageStatic value={value} blocks={{}} db={dbAdapter} />;
}

// =============================================================================
// App
// =============================================================================

// App definition with routes
const app = defineApp([
  // Health check
  route("/health", () => new Response("ok")),

  // Live action endpoint
  route("/:workbookId/_action", async ({ params, request }) => {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const workbookId = params.workbookId;
    const env = getEnv();
    const d1Config: D1ClientConfig = {
      accountId: env.CF_ACCOUNT_ID,
      apiToken: env.CF_API_TOKEN,
    };

    const dbId = await getWorkbookDbId(workbookId, d1Config);
    if (!dbId) {
      return Response.json({ error: "Workbook not found" }, { status: 404 });
    }

    try {
      const body = (await request.json()) as { sql: string; params?: unknown[] };
      const db = new D1Client(dbId, d1Config);
      const result = await db.liveAction(body.sql, body.params);
      return Response.json({ success: true, changes: result.changes });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Action failed" },
        { status: 500 }
      );
    }
  }),

  // Serve workbook pages with SSR + hydration - need both routes since * requires at least one char
  render(Document, [
    // @ts-expect-error - rwsdk route types are overly strict for our multi-tenant pattern
    route("/:workbookId", async ({ params, request }) => {
      const workbookId = params.workbookId;
      const pagePath = "/";

      console.log(`[viewer] Request (bare): ${workbookId}${pagePath}`);

      const env = getEnv();
      const d1Config: D1ClientConfig = {
        accountId: env.CF_ACCOUNT_ID,
        apiToken: env.CF_API_TOKEN,
      };

      const dbId = await getWorkbookDbId(workbookId, d1Config);
      if (!dbId) {
        return new Response("Workbook not found", { status: 404 });
      }

      const db = new D1Client(dbId, d1Config);

      // Try to find index page
      let pages = await db.liveQuery<PageRow>(
        `SELECT id, path, title, content FROM _pages WHERE id = 'index' OR path = '/'`
      );
      let page = pages[0];

      // Redirect to first page if no index
      if (!page) {
        const firstPage = await db.liveQuery<PageRow>(
          `SELECT path FROM _pages ORDER BY path LIMIT 1`
        );
        if (firstPage[0]) {
          return new Response(null, {
            status: 302,
            headers: { Location: `/${workbookId}${firstPage[0].path}` },
          });
        }
      }

      if (!page) {
        return new Response("Page not found", { status: 404 });
      }

      const dbAdapter = createViewerDbAdapter(db);
      return <ViewerPage page={page} dbAdapter={dbAdapter} />;
    }),
    // @ts-expect-error - rwsdk route types are overly strict for our multi-tenant pattern
    route("/:workbookId/*", async ({ params, request }) => {
      const workbookId = params.workbookId;
      const url = new URL(request.url);
      const pathAfter = url.pathname.slice(workbookId.length + 1); // Skip "/:workbookId"
      const pagePath = pathAfter || "/";

      console.log(`[viewer] Request: ${workbookId}${pagePath}`);

      const env = getEnv();
      const d1Config: D1ClientConfig = {
        accountId: env.CF_ACCOUNT_ID,
        apiToken: env.CF_API_TOKEN,
      };

      const dbId = await getWorkbookDbId(workbookId, d1Config);
      if (!dbId) {
        return new Response("Workbook not found", { status: 404 });
      }

      const db = new D1Client(dbId, d1Config);

      // Fetch page (nav data already prefetched before Document renders)
      let pages = await db.liveQuery<PageRow>(
        `SELECT id, path, title, content FROM _pages WHERE path = ?`,
        [pagePath]
      );

      let page = pages[0];

      // Try variations
      if (!page && pagePath !== "/") {
        pages = await db.liveQuery<PageRow>(
          `SELECT id, path, title, content FROM _pages WHERE path = ?`,
          [pagePath === "/" ? "/" : `${pagePath}/`]
        );
        page = pages[0];
      }

      if (!page && pagePath === "/") {
        pages = await db.liveQuery<PageRow>(
          `SELECT id, path, title, content FROM _pages WHERE id = 'index' OR path = '/'`
        );
        page = pages[0];
      }

      // Redirect to first page if at root with no index
      if (!page && pagePath === "/") {
        const firstPage = await db.liveQuery<PageRow>(
          `SELECT path FROM _pages ORDER BY path LIMIT 1`
        );
        if (firstPage[0]) {
          return new Response(null, {
            status: 302,
            headers: { Location: `/${workbookId}${firstPage[0].path}` },
          });
        }
      }

      if (!page) {
        return new Response("Page not found", { status: 404 });
      }

      const dbAdapter = createViewerDbAdapter(db);

      return <ViewerPage page={page} dbAdapter={dbAdapter} />;
    }),
  ]),
]);

// Pre-fetch nav data before Document renders (must happen before app.fetch)
async function prefetchNavData(request: Request, env: ViewerEnv) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/([^/]+)/);

  if (!match || match[1] === "health") return;

  const workbookId = match[1];
  const d1Config: D1ClientConfig = {
    accountId: env.CF_ACCOUNT_ID,
    apiToken: env.CF_API_TOKEN,
  };

  const dbId = await getWorkbookDbId(workbookId, d1Config);
  if (!dbId) return;

  const db = new D1Client(dbId, d1Config);
  const allPages = await db.liveQuery<{ id: string; path: string; title: string }>(
    `SELECT id, path, title FROM _pages ORDER BY path`
  );

  setNavPages(allPages.map(p => ({
    id: p.id,
    path: `/${workbookId}${p.path}`,
    title: p.title,
  })));
  setWorkbookTitle(workbookId);
}

// Export a wrapper that captures env and pre-fetches nav before delegating to rwsdk
export default {
  fetch: async (request: Request, env: ViewerEnv, ctx: ExecutionContext) => {
    setEnv(env);

    // Pre-fetch nav data so it's available when Document renders
    await prefetchNavData(request, env);

    try {
      // Cast env - viewer uses D1 HTTP API instead of bound DB
      return await app.fetch(request, env as unknown as Parameters<typeof app.fetch>[1], ctx);
    } finally {
      clearContext();
    }
  },
};
