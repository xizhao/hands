/**
 * Sync routes - /sync/*
 */

import type { Router } from "../router";
import { json, sse } from "../router";
import type { RuntimeState } from "../state";
import type { DataSource, SyncProgress } from "../db";

export function registerSyncRoutes(router: Router, getState: () => RuntimeState | null): void {
  // GET /sync/sources - List all data sources
  router.get("/sync/sources", async () => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }
    const sources = await state.sync.getSources();
    return json(sources);
  });

  // GET /sync/sources/:id - Get a specific source
  router.get("/sync/sources/:id", async (_req, ctx) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    // Skip if this is a history request (handled by different route)
    if (ctx.params.id === "history") {
      return json({ error: "Not found" }, { status: 404 });
    }

    const source = await state.sync.getSource(ctx.params.id);
    if (!source) {
      return json({ error: "Source not found" }, { status: 404 });
    }
    return json(source);
  });

  // POST /sync/sources - Add a new data source
  router.post("/sync/sources", async (req) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }
    const body = await req.json() as { source: Omit<DataSource, "createdAt" | "updatedAt">; secret?: string };
    const source = await state.sync.addSource(body.source, body.secret);
    return json(source, { status: 201 });
  });

  // PUT /sync/sources/:id - Update a data source
  router.put("/sync/sources/:id", async (req, ctx) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }
    const body = await req.json() as { updates: Partial<DataSource>; secret?: string };
    const source = await state.sync.updateSource(ctx.params.id, body.updates, body.secret);
    if (!source) {
      return json({ error: "Source not found" }, { status: 404 });
    }
    return json(source);
  });

  // DELETE /sync/sources/:id - Delete a data source
  router.delete("/sync/sources/:id", async (_req, ctx) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }
    const deleted = await state.sync.deleteSource(ctx.params.id);
    if (!deleted) {
      return json({ error: "Source not found" }, { status: 404 });
    }
    return json({ success: true });
  });

  // POST /sync/sources/:id/sync - Sync a single source
  router.post("/sync/sources/:id/sync", async (_req, ctx) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }
    const result = await state.sync.syncSource(ctx.params.id);
    return json(result);
  });

  // POST /sync/sources/:id/cancel - Cancel an in-progress sync
  router.post("/sync/sources/:id/cancel", (_req, ctx) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }
    const cancelled = state.sync.cancelSync(ctx.params.id);
    return json({ cancelled });
  });

  // GET /sync/sources/:id/history - Get sync history for a source
  router.get("/sync/sources/:id/history", async (_req, ctx) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }
    const limit = parseInt(ctx.url.searchParams.get("limit") || "50");
    const history = await state.sync.getSyncHistory(ctx.params.id, limit);
    return json(history);
  });

  // POST /sync/run - Sync multiple sources
  router.post("/sync/run", async (req) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }
    const body = await req.json() as { sourceIds?: string[]; concurrency?: number };
    const result = body.sourceIds
      ? await state.sync.syncSources(body.sourceIds, body.concurrency)
      : await state.sync.syncAll(body.concurrency);
    return json(result);
  });

  // GET /sync/progress - SSE stream for sync progress
  router.get("/sync/progress", (req) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();

        const listener = (progress: SyncProgress) => {
          const data = `data: ${JSON.stringify(progress)}\n\n`;
          controller.enqueue(encoder.encode(data));
        };

        state.syncProgressListeners.add(listener);

        // Cleanup on close
        req.signal.addEventListener("abort", () => {
          state.syncProgressListeners.delete(listener);
        });
      },
    });

    return sse(stream);
  });
}
