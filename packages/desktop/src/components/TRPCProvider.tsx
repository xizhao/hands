/**
 * tRPC Provider
 *
 * Wraps the app to provide tRPC context.
 * Only initializes after runtime is connected to ensure type-safe API calls.
 */

import type { QueryClient } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import { type ReactNode, useMemo } from "react";
import { trpc } from "@/lib/trpc";

interface TRPCProviderProps {
  children: ReactNode;
  queryClient: QueryClient;
  /** Runtime port - required, only render this provider when port is available */
  runtimePort: number;
}

/**
 * tRPC Provider - requires a valid runtime port
 *
 * Usage: Only render this component after runtime is connected.
 * The parent component should check for runtime availability.
 *
 * @example
 * ```tsx
 * const { data: runtime } = useActiveRuntime();
 * if (!runtime?.runtime_port) return <LoadingScreen />;
 * return (
 *   <TRPCProvider runtimePort={runtime.runtime_port} queryClient={queryClient}>
 *     <App />
 *   </TRPCProvider>
 * );
 * ```
 */
export function TRPCProvider({ children, queryClient, runtimePort }: TRPCProviderProps) {
  // Create tRPC client - recreate when port changes
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
