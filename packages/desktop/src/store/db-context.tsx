/**
 * Database Browser Context
 *
 * Provides runtime port context for the standalone DB browser window.
 * This allows the DB hooks to work without depending on the main app's UIStore.
 */

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useUIStore } from "@/stores/ui";

interface DbContextValue {
  runtimePort: number | null;
  setRuntimePort: (port: number) => void;
}

const DbContext = createContext<DbContextValue | null>(null);

export function DbContextProvider({ children }: { children: ReactNode }) {
  const [runtimePort, setRuntimePort] = useState<number | null>(null);

  // Get runtime port from URL params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const port = params.get("port");
    if (port) {
      setRuntimePort(parseInt(port, 10));
    }
  }, []);

  return (
    <DbContext.Provider value={{ runtimePort, setRuntimePort }}>
      {children}
    </DbContext.Provider>
  );
}

export function useDbContext() {
  const ctx = useContext(DbContext);
  if (!ctx) {
    throw new Error("useDbContext must be used within DbContextProvider");
  }
  return ctx;
}

/**
 * Hook to get runtime port - works in both main app and standalone window
 */
export function useRuntimePort(): number | null {
  // Try context first (standalone window)
  const ctx = useContext(DbContext);
  if (ctx?.runtimePort) {
    return ctx.runtimePort;
  }

  // Try UIStore (main app window)
  const storePort = useUIStore((s) => s.runtimePort);
  if (storePort) {
    return storePort;
  }

  // Fallback: try URL params
  const params = new URLSearchParams(window.location.search);
  const port = params.get("port");
  if (port) {
    return parseInt(port, 10);
  }

  return null;
}
