"use client";

/**
 * Mock Data Provider for Testing
 *
 * Provides mock SQL query results for LiveValue components during testing.
 */

import { createContext, useContext, type ReactNode } from "react";

// ============================================================================
// Types
// ============================================================================

export interface MockDataContextValue {
  /** Mock data to return for any query */
  data: Record<string, unknown>[];
  /** Whether to simulate loading state */
  isLoading?: boolean;
  /** Error to simulate */
  error?: Error | null;
}

// ============================================================================
// Context
// ============================================================================

const MockDataContext = createContext<MockDataContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

export interface MockDataProviderProps {
  /** Mock data to provide */
  data: Record<string, unknown>[];
  /** Simulate loading state */
  isLoading?: boolean;
  /** Simulate error */
  error?: Error | null;
  children: ReactNode;
}

/**
 * Provider for mock SQL query data.
 * LiveValue components will use this data instead of executing real queries.
 */
export function MockDataProvider({
  data,
  isLoading = false,
  error = null,
  children,
}: MockDataProviderProps) {
  return (
    <MockDataContext.Provider value={{ data, isLoading, error }}>
      {children}
    </MockDataContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access mock data from context.
 * Returns null if not inside a MockDataProvider.
 */
export function useMockData(): MockDataContextValue | null {
  return useContext(MockDataContext);
}
