"use client";

/**
 * LiveValue Context for Charts
 *
 * Provides query data to child chart components.
 * Charts use useLiveValueData() to access data from parent LiveValue.
 */

import { createContext, useContext, type ReactNode } from "react";

// ============================================================================
// Types
// ============================================================================

export interface LiveValueContextData {
  /** Query result data */
  data: Record<string, unknown>[];
  /** Whether data is currently loading */
  isLoading: boolean;
  /** Error from query execution */
  error: Error | null;
}

// ============================================================================
// Context
// ============================================================================

const LiveValueContext = createContext<LiveValueContextData | null>(null);

// ============================================================================
// Provider
// ============================================================================

export interface LiveValueProviderProps extends LiveValueContextData {
  children: ReactNode;
}

/**
 * Provider for LiveValue data context.
 * Wrap charts in this provider to supply data from a LiveValue query.
 */
export function LiveValueProvider({
  data,
  isLoading,
  error,
  children,
}: LiveValueProviderProps) {
  return (
    <LiveValueContext.Provider value={{ data, isLoading, error }}>
      {children}
    </LiveValueContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access LiveValue data from parent context.
 * Returns null if not inside a LiveValue provider.
 *
 * @example
 * ```tsx
 * function MyChart() {
 *   const ctx = useLiveValueData();
 *   if (!ctx) return <div>No data context</div>;
 *   if (ctx.isLoading) return <div>Loading...</div>;
 *   if (ctx.error) return <div>Error: {ctx.error.message}</div>;
 *   return <Chart data={ctx.data} />;
 * }
 * ```
 */
export function useLiveValueData(): LiveValueContextData | null {
  return useContext(LiveValueContext);
}

/**
 * Hook that requires LiveValue data context.
 * Throws if not inside a LiveValue provider.
 */
export function useRequiredLiveValueData(): LiveValueContextData {
  const ctx = useContext(LiveValueContext);
  if (!ctx) {
    throw new Error(
      "useRequiredLiveValueData must be used inside a LiveValueProvider. " +
        "Wrap your chart in a <LiveValue> component.",
    );
  }
  return ctx;
}
