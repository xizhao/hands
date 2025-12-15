/**
 * Shared RSC rendering utilities
 */

import React from "react";
import { renderToReadableStream } from "react-server-dom-webpack/server";

/**
 * Client manifest proxy - provides module info for RSC wire format
 */
export const clientManifestProxy = new Proxy(
  {},
  {
    get(_, key) {
      return { id: key, name: key, chunks: [] };
    },
  }
);

/**
 * Render a React element to RSC stream
 */
export function renderToRscStream(element: React.ReactElement): ReadableStream {
  return renderToReadableStream(element, clientManifestProxy);
}

/**
 * Create RSC response with appropriate headers
 */
export function createRscResponse(stream: ReadableStream): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/x-component",
      "Cache-Control": "no-cache",
    },
  });
}

/**
 * Create error JSON response
 */
export function createErrorResponse(
  err: unknown,
  context: string
): Response {
  const error = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  console.error(`[worker] ${context}:`, err);
  return Response.json({ error, stack }, { status: 500 });
}

/**
 * Extract props from URL search params, removing internal params
 */
export function extractPropsFromUrl(url: URL): Record<string, string> {
  const props = Object.fromEntries(url.searchParams);
  delete props.edit;
  delete props._ts;
  return props;
}
