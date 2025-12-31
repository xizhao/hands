/**
 * tRPC Client Setup
 *
 * Type-safe API client for communicating with the runtime.
 * Provides end-to-end type safety from database to UI.
 */

import type { AppRouter } from "@hands/workbook-server/trpc";
import { createTRPCReact, httpBatchLink } from "@trpc/react-query";

// Create the tRPC React hooks
export const trpc = createTRPCReact<AppRouter>();

/**
 * Create a tRPC client for a specific runtime port
 */
export function createTRPCClient(runtimePort: number) {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: `http://localhost:${runtimePort}/trpc`,
        // Batch requests for efficiency
        maxURLLength: 2083,
      }),
    ],
  });
}

// Alias for backwards compatibility
export const getTRPCClient = createTRPCClient;

// Re-export types for convenience
export type { AppRouter };
export type {
  ActionRunLog,
  ActionRunRecord,
  RecentItem,
  StepRecord,
  UiState,
} from "@hands/workbook-server/trpc";
