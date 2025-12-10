/**
 * RuntimeProvider - Centralized runtime state management
 *
 * Single source of truth for:
 * - Runtime connection status
 * - Manifest (pages, blocks, sources, tables)
 * - Ready state
 *
 * Architecture:
 * - Polls runtime health and manifest every 1s
 * - Simple polling instead of SSE (more reliable, no WebKit issues)
 * - Clear state machine: idle → connecting → ready → error
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
  title?: string;
  description?: string;
  enabled: boolean;
}

export interface WorkbookManifest {
  workbookId: string;
  workbookDir: string;
  pages: WorkbookPage[];
  blocks: WorkbookBlock[];
  sources?: WorkbookSource[];
  tables?: string[];
  isEmpty: boolean;
}

export type RuntimeState =
  | "idle" // No workbook selected
  | "connecting" // Trying to connect to runtime
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
  refetchManifest: () => Promise<void>;
}

const RuntimeContext = createContext<RuntimeContextValue | null>(null);

// Default port
const DEFAULT_PORT = 55000;
const POLL_INTERVAL = 1000; // 1 second

interface RuntimeProviderProps {
  children: ReactNode;
  workbookId: string | null;
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
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastManifestRef = useRef<string>("");

  // Cleanup function
  const cleanup = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // Fetch manifest from runtime
  const fetchManifest = useCallback(async (runtimePort: number): Promise<WorkbookManifest | null> => {
    try {
      const response = await fetch(`http://localhost:${runtimePort}/workbook/manifest`, {
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Silent fail - polling will retry
    }
    return null;
  }, []);

  // Check health
  const checkHealth = useCallback(async (runtimePort: number): Promise<boolean> => {
    try {
      const response = await fetch(`http://localhost:${runtimePort}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        const health = await response.json();
        return health.status === "ready";
      }
    } catch {
      // Silent fail
    }
    return false;
  }, []);

  // Connect to runtime
  const connect = useCallback(
    (runtimePort: number) => {
      cleanup();
      setPort(runtimePort);
      setState("connecting");
      setError(null);
    },
    [cleanup]
  );

  // Disconnect
  const disconnect = useCallback(() => {
    cleanup();
    setState("idle");
    setPort(0);
    setManifest(null);
    setError(null);
    lastManifestRef.current = "";
  }, [cleanup]);

  // Invalidate manifest queries
  const invalidateManifest = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["page-content"] });
    queryClient.invalidateQueries({ queryKey: ["block"] });
  }, [queryClient]);

  // Refetch manifest manually
  const refetchManifest = useCallback(async () => {
    if (port > 0) {
      const data = await fetchManifest(port);
      if (data) {
        setManifest(data);
        invalidateManifest();
      }
    }
  }, [port, fetchManifest, invalidateManifest]);

  // Handle workbook changes - reset and start polling
  useEffect(() => {
    if (!workbookId) {
      disconnect();
      return;
    }

    // Reset state when workbook changes
    setManifest(null);
    setError(null);
    lastManifestRef.current = "";
    cleanup();

    const portToUse = initialPort || DEFAULT_PORT;
    setPort(portToUse);
    setState("connecting");

    // Poll function - checks health and fetches manifest
    const poll = async () => {
      const isReady = await checkHealth(portToUse);

      if (isReady) {
        const data = await fetchManifest(portToUse);
        if (data) {
          // Only update if manifest changed
          const manifestJson = JSON.stringify(data);
          if (manifestJson !== lastManifestRef.current) {
            lastManifestRef.current = manifestJson;
            setManifest(data);
            invalidateManifest();
          }
          setState("ready");
        }
      } else {
        setState("connecting");
      }
    };

    // Initial poll
    poll();

    // Start polling interval
    pollIntervalRef.current = setInterval(poll, POLL_INTERVAL);

    return cleanup;
  }, [workbookId, initialPort]); // Only re-run when workbook or port changes

  // Sync port to UI store for backwards compatibility
  const setRuntimePort = useUIStore((s) => s.setRuntimePort);
  useEffect(() => {
    if (state === "ready" && port > 0) {
      setRuntimePort(port);
    } else if (state === "idle") {
      setRuntimePort(null);
    }
  }, [state, port, setRuntimePort]);

  const value: RuntimeContextValue = {
    state,
    port,
    manifest,
    error,
    isReady: state === "ready",
    isConnecting: state === "connecting",
    connect,
    disconnect,
    invalidateManifest,
    refetchManifest,
  };

  return (
    <RuntimeContext.Provider value={value}>{children}</RuntimeContext.Provider>
  );
}

// Hook to access runtime context
export function useRuntime(): RuntimeContextValue {
  const context = useContext(RuntimeContext);
  if (!context) {
    throw new Error("useRuntime must be used within a RuntimeProvider");
  }
  return context;
}
