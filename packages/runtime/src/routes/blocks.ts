/**
 * Blocks proxy routes - /blocks/*
 *
 * Proxies block requests to the worker for RSC rendering
 */

import type { Router } from "../router";
import { json } from "../router";
import type { RuntimeState } from "../state";

export function registerBlocksRoutes(router: Router, getState: () => RuntimeState | null): void {
  // Proxy /blocks/* to the worker
  router.on("*", "/blocks/*", async (req) => {
    const state = getState();
    if (!state) {
      return json({ error: "Not initialized" }, { status: 500 });
    }

    const workerPort = state.worker.status.port;
    if (!workerPort || !state.worker.status.up) {
      return json({ error: "Worker not ready" }, { status: 503 });
    }

    const url = new URL(req.url);

    // Forward the request to the worker
    const workerUrl = `http://localhost:${workerPort}${url.pathname}${url.search}`;
    const workerResponse = await fetch(workerUrl, {
      method: req.method,
      headers: req.headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
    });

    // Get the response body as text (this decompresses if needed)
    const body = await workerResponse.text();

    // Build response headers, excluding Content-Encoding to avoid double-encoding issues
    const headers: Record<string, string> = {
      "Content-Type": workerResponse.headers.get("Content-Type") || "text/html",
      "Access-Control-Allow-Origin": "*",
    };

    return new Response(body, {
      status: workerResponse.status,
      headers,
    });
  });
}
