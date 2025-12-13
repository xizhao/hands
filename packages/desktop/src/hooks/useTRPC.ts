/**
 * tRPC Hook
 *
 * Provides tRPC client and readiness checks.
 * The tRPC provider is only active when runtime is connected.
 */

import { useMemo } from "react";
import { createTRPCClient, trpc } from "@/lib/trpc";
import { useActiveRuntime } from "./useWorkbook";

/**
 * Get the tRPC client for the active runtime
 *
 * Note: This hook should only be called within components that are
 * rendered inside TRPCProvider (when runtime is connected).
 * Returns null if runtime is not connected.
 */
export function useTRPCClient() {
  const { data: activeRuntime } = useActiveRuntime();
  const port = activeRuntime?.runtime_port;

  const client = useMemo(() => {
    if (!port) return null;
    return createTRPCClient(port);
  }, [port]);

  return client;
}

/**
 * Hook to check if tRPC is ready (runtime is connected)
 */
export function useTRPCReady() {
  const { data: activeRuntime, isLoading } = useActiveRuntime();
  return {
    ready: !!activeRuntime?.runtime_port,
    isLoading,
    port: activeRuntime?.runtime_port,
  };
}

// Re-export the trpc hooks
export { trpc };
