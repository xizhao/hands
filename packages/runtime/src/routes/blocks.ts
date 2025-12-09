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

    // Return the worker's response
    return new Response(workerResponse.body, {
      status: workerResponse.status,
      headers: {
        ...Object.fromEntries(workerResponse.headers.entries()),
        "Access-Control-Allow-Origin": "*",
      },
    });
  });
}
