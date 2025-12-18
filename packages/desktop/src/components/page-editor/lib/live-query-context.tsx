"use client";

/**
 * LiveQueryContext
 *
 * Provides data binding context for LiveQuery template rendering.
 * Child text nodes check this context to replace {{field}} bindings.
 */

import { createContext, useContext, type ReactNode } from "react";

export interface LiveQueryData {
  /** Current row data for bindings */
  row: Record<string, unknown>;
  /** All rows (for reference) */
  rows: Record<string, unknown>[];
  /** Current row index (1-indexed) */
  index: number;
}

const LiveQueryContext = createContext<LiveQueryData | null>(null);

export function LiveQueryProvider({
  row,
  rows,
  index,
  children,
}: LiveQueryData & { children: ReactNode }) {
  return (
    <LiveQueryContext.Provider value={{ row, rows, index }}>
      {children}
    </LiveQueryContext.Provider>
  );
}

/**
 * Hook to access LiveQuery data bindings.
 * Returns null if not inside a LiveQuery context.
 */
export function useLiveQueryContext(): LiveQueryData | null {
  return useContext(LiveQueryContext);
}

/**
 * Replace {{field}} bindings in text with data values.
 */
export function replaceTextBindings(
  text: string,
  data: Record<string, unknown>,
  index?: number
): string {
  const keys = Object.keys(data);
  const firstKey = keys[0];

  return text.replace(/\{\{(\w+)\}\}/g, (_, field) => {
    // Special _index field for numbered lists
    if (field === "_index" && index !== undefined) {
      return String(index);
    }

    // Try exact field match first
    if (field in data) {
      const value = data[field];
      if (value === null || value === undefined) return "";
      return String(value);
    }

    // Fallback: "value" or "name" -> use first field
    if ((field === "value" || field === "name") && firstKey) {
      const value = data[firstKey];
      if (value === null || value === undefined) return "";
      return String(value);
    }

    return "";
  });
}
