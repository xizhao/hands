/**
 * RuntimeProvider - Centralized runtime state management
 *
 * Single source of truth for:
 * - Runtime connection status
 * - Manifest (pages, blocks, sources, tables)
 * - Ready state
 *
 * Architecture:
 * - Directly connects to runtime (no Tauri polling middleman)
 * - Uses SSE for real-time manifest updates
 * - Clear state machine: idle → connecting → booting → ready → error
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUIStore } from "@/stores/ui";

// Types
export interface WorkbookPage {
  id: string;
  title: string;
  route?: string;
  path?: string;
}

export interface WorkbookBlock {
  id: string;
  title: string;
  path: string;
  description?: string;
}

export interface WorkbookSource {
  name: string;
  title: string;
  description?: string;
  enabled: boolean;
}

export interface WorkbookManifest {
  workbookId: string;
  workbookDir: string;
  pages: WorkbookPage[];
  blocks: WorkbookBlock[];
  sources: WorkbookSource[];
  tables: string[];
  isEmpty: boolean;
}

export type RuntimeState =
  | "idle" // No workbook selected
  | "connecting" // Trying to connect to runtime
  | "booting" // Runtime starting up
  | "ready" // Runtime fully ready
  | "error"; // Connection failed

export interface RuntimeContextValue {
  // State
  state: RuntimeState;
  port: number;
  manifest: WorkbookManifest | null;
  error: string | null;

  // Derived
  isReady: boolean;
  isConnecting: boolean;

  // Actions
  connect: (port: number) => void;
  disconnect: () => void;
  invalidateManifest: () => void;
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

// Default ports
const DEFAULT_PORT = 55000;

interface RuntimeProviderProps {
  children: ReactNode;
  workbookId: string | null;
  /** Optional initial port - if not provided, will try default port */
  initialPort?: number;
}

export function RuntimeProvider({
  children,
  workbookId,
  initialPort,
}: RuntimeProviderProps) {
  const [state, setState] = useState<RuntimeState>("idle");
  const [port, setPort] = useState(initialPort ?? 0);
  const [manifest, setManifest] = useState<WorkbookManifest | null>(null);
  const [error, setError] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const healthCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup function
  const cleanup = useCallback(() => {
    if (eventSourceRef.current) {
      console.log("[runtime-provider] Closing SSE connection");
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (healthCheckIntervalRef.current) {
      clearInterval(healthCheckIntervalRef.current);
      healthCheckIntervalRef.current = null;
    }
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  // Connect to runtime
  const connect = useCallback(
    (runtimePort: number) => {
      console.log("[runtime-provider] Connecting to port:", runtimePort);
      cleanup();
      setPort(runtimePort);
      setState("connecting");
      setError(null);
    },
    [cleanup]
  );

  // Disconnect
  const disconnect = useCallback(() => {
    console.log("[runtime-provider] Disconnecting");
    cleanup();
    setState("idle");
    setPort(0);
    setManifest(null);
    setError(null);
  }, [cleanup]);

  // Invalidate manifest queries
  const invalidateManifest = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["page-content"] });
    queryClient.invalidateQueries({ queryKey: ["block"] });
  }, [queryClient]);

  // Auto-discover runtime when workbook changes
  useEffect(() => {
    if (!workbookId) {
      disconnect();
      return;
    }

    // Try to discover runtime port
    const discoverRuntime = async () => {
      setState("connecting");

      // Try the provided initial port or default
      const portToTry = initialPort || DEFAULT_PORT;

      try {
        const healthUrl = `http://localhost:${portToTry}/health`;
        console.log("[runtime-provider] Checking health at:", healthUrl);

        const response = await fetch(healthUrl, {
          signal: AbortSignal.timeout(3000),
        });

        if (response.ok) {
          const health = await response.json();
          console.log("[runtime-provider] Health response:", health);

          if (health.status === "ready") {
            setPort(portToTry);
            setState("ready");
          } else if (health.status === "booting") {
            setPort(portToTry);
            setState("booting");
          } else {
            setPort(portToTry);
            setState("connecting");
          }
          return;
        }
      } catch (e) {
        console.log("[runtime-provider] Health check failed, will retry...", e);
      }

      // Retry after delay
      retryTimeoutRef.current = setTimeout(() => {
        if (workbookId) {
          discoverRuntime();
        }
      }, 2000);
    };

    discoverRuntime();

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, [workbookId, initialPort, disconnect]);

  // Sync port to UI store for backwards compatibility
  const setRuntimePort = useUIStore((s) => s.setRuntimePort);
  useEffect(() => {
    if (state === "ready" && port > 0) {
      console.log("[runtime-provider] Syncing port to UI store:", port);
      setRuntimePort(port);
    } else if (state === "idle") {
      setRuntimePort(null);
    }
  }, [state, port, setRuntimePort]);

  // Connect SSE when we have a port
  useEffect(() => {
    if (!port || state === "idle") {
      return;
    }

    const sseUrl = `http://localhost:${port}/workbook/manifest/sse`;
    console.log("[runtime-provider] Connecting to SSE:", sseUrl);

    const eventSource = new EventSource(sseUrl);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      console.log("[runtime-provider] SSE connected");
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WorkbookManifest;
        console.log("[runtime-provider] Manifest received:", {
          pages: data.pages?.length ?? 0,
          blocks: data.blocks?.length ?? 0,
          tables: data.tables?.length ?? 0,
        });
        setManifest(data);
        setState("ready");
        setError(null);

        // Invalidate related queries when manifest changes
        invalidateManifest();
      } catch (e) {
        console.error("[runtime-provider] Failed to parse manifest:", e);
      }
    };

    eventSource.onerror = (e) => {
      console.error("[runtime-provider] SSE error:", e);

      // Don't immediately error - might be temporary
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log("[runtime-provider] SSE connection closed, will retry");
        setState("connecting");
      }
    };

    // Periodic health check to update state
    healthCheckIntervalRef.current = setInterval(async () => {
      try {
        const response = await fetch(`http://localhost:${port}/health`, {
          signal: AbortSignal.timeout(3000),
        });
        if (response.ok) {
          const health = await response.json();
          if (health.status === "ready" && state !== "ready") {
            setState("ready");
          } else if (health.status === "booting" && state === "ready") {
            setState("booting");
          }
        }
      } catch {
        // Ignore health check failures - SSE will reconnect
      }
    }, 5000);

    return () => {
      console.log("[runtime-provider] Cleaning up SSE");
      eventSource.close();
      if (healthCheckIntervalRef.current) {
        clearInterval(healthCheckIntervalRef.current);
      }
    };
  }, [port, state, invalidateManifest]);

  const value: RuntimeContextValue = {
    state,
    port,
    manifest,
    error,
    isReady: state === "ready",
    isConnecting: state === "connecting" || state === "booting",
    connect,
    disconnect,
    invalidateManifest,
  };

  return (
    <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>
  );
}

// Hook to access runtime context - THE ONLY HOOK YOU NEED
export function useRuntime(): RuntimeContextValue {
  const context = useContext(RuntimeContext);
  if (!context) {
    throw new Error("useRuntime must be used within a RuntimeProvider");
  }
  return context;
}
