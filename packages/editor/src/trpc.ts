/**
 * Vanilla tRPC Client for Editor
 *
 * Unlike the desktop app which uses @trpc/react-query,
 * the editor runs in an iframe and needs a vanilla client.
 */

import type { AppRouter } from "@hands/runtime/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";

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
