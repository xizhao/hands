"use client";

/**
 * LiveValueContext
 *
 * Provides data binding context for LiveValue template rendering.
 * Child text nodes check this context to replace {{field}} bindings.
 */

import { createContext, useContext, type ReactNode } from "react";

export interface LiveValueData {
  /** Current row data for bindings */
  row: Record<string, unknown>;
  /** All rows (for reference) */
  rows: Record<string, unknown>[];
  /** Current row index (1-indexed) */
  index: number;
}

const LiveValueContext = createContext<LiveValueData | null>(null);

export function LiveValueProvider({
  row,
  rows,
  index,
  children,
}: LiveValueData & { children: ReactNode }) {
  return (
    <LiveValueContext.Provider value={{ row, rows, index }}>
      {children}
    </LiveValueContext.Provider>
  );
}

/**
 * Hook to access LiveValue data bindings.
 * Returns null if not inside a LiveValue context.
 */
export function useLiveValueContext(): LiveValueData | null {
  return useContext(LiveValueContext);
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
