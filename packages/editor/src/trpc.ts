/**
 * Vanilla tRPC Client for Editor
 *
 * Unlike the desktop app which uses @trpc/react-query,
 * the editor runs in an iframe and needs a vanilla client.
 *
 * Includes retry logic for resilience against runtime restarts.
 */

import type { AppRouter } from "@hands/runtime/trpc";
import { createTRPCClient, httpBatchLink, retryLink } from "@trpc/client";

let client: ReturnType<typeof createTRPCClient<AppRouter>> | null = null;
let currentPort: number | null = null;

/**
 * Get or create a tRPC client for the given runtime port
 */
export function getTRPCClient(runtimePort: number) {
  if (client && currentPort === runtimePort) {
    return client;
  }

  client = createTRPCClient<AppRouter>({
    links: [
      // Retry on network errors (connection closed, timeout, etc.)
      retryLink({
        retry: (opts) => {
          // Don't retry mutations by default (could cause duplicates)
          if (opts.op.type === "mutation") {
            return false;
          }

          // Retry up to 10 times for queries/subscriptions
          if (opts.attempts > 10) {
            return false;
          }

          // Retry on network errors
          const error = opts.error;
          const isNetworkError =
            error.message.includes("connection closed") ||
            error.message.includes("fetch failed") ||
            error.message.includes("Load failed") ||
            error.message.includes("NetworkError") ||
            error.message.includes("ECONNREFUSED");

          if (isNetworkError) {
            console.log(`[trpc] Retrying after network error (attempt ${opts.attempts})...`);
            return true;
          }

          return false;
        },
      }),
      httpBatchLink({
        url: `http://localhost:${runtimePort}/trpc`,
      }),
    ],
  });
  currentPort = runtimePort;

  return client;
}

// Re-export types
export type { AppRouter };
