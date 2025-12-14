/**
 * tRPC Provider
 *
 * Wraps the app to provide tRPC context.
 * Only rendered when runtime is connected (port is known).
 */

import type { QueryClient } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";

// ============================================================================
// Provider
// ============================================================================

interface TRPCProviderProps {
  children: ReactNode;
  queryClient: QueryClient;
  /** Runtime port - must be valid (provider only renders when connected) */
  runtimePort: number;
}

/**
 * tRPC Provider - only rendered when runtime is connected
 *
 * The App component gates this provider on runtime port existence.
 * When this renders, we always have a valid port to connect to.
 */
export function TRPCProvider({ children, queryClient, runtimePort }: TRPCProviderProps) {
  const trpcClient = useMemo(
    () =>
      trpc.createClient({
        links: [
          httpBatchLink({
            url: `http://localhost:${runtimePort}/trpc`,
            maxURLLength: 2083,
          }),
        ],
      }),
    [runtimePort],
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      {children}
    </trpc.Provider>
  );
}
