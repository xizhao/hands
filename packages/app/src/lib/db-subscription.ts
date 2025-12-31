/**
 * Database Change Subscription
 *
 * SSE-based subscription for SQLite database changes.
 * Used to trigger TanStack DB collection refetches.
 */

import { useCallback, useEffect, useRef } from "react";

export interface DbChangeEvent {
  type: "change" | "connected";
  dataVersion: number;
  timestamp?: number;
}

export type DbChangeListener = (event: DbChangeEvent) => void;

/**
 * Create a database subscription manager
 */
export function createDbSubscriptionClient(runtimePort: number) {
  const listeners = new Set<DbChangeListener>();
  let eventSource: EventSource | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let isConnecting = false;

  function connect() {
    if (eventSource || isConnecting) return;
    isConnecting = true;

    const url = `http://localhost:${runtimePort}/db/subscribe`;
    eventSource = new EventSource(url);

    eventSource.onopen = () => {
      console.log("[db-subscription] Connected to database changes");
      isConnecting = false;
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as DbChangeEvent;
        for (const listener of listeners) {
          listener(data);
        }
      } catch (err) {
        console.error("[db-subscription] Failed to parse event:", err);
      }
    };

    eventSource.onerror = () => {
      console.warn("[db-subscription] Connection error, reconnecting...");
      disconnect();
      isConnecting = false;
      // Reconnect after 2 seconds
      reconnectTimer = setTimeout(connect, 2000);
    };
  }

  function disconnect() {
    if (eventSource) {
      eventSource.close();
      eventSource = null;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function subscribe(listener: DbChangeListener): () => void {
    listeners.add(listener);
    // Start connection if this is the first listener
    if (listeners.size === 1) {
      connect();
    }
    return () => {
      listeners.delete(listener);
      // Disconnect if no more listeners
      if (listeners.size === 0) {
        disconnect();
      }
    };
  }

  return { subscribe, connect, disconnect };
}

// Singleton client (lazily initialized)
let dbClient: ReturnType<typeof createDbSubscriptionClient> | null = null;

/**
 * Get the database subscription client
 */
export function getDbSubscriptionClient(runtimePort: number) {
  if (!dbClient) {
    dbClient = createDbSubscriptionClient(runtimePort);
  }
  return dbClient;
}

/**
 * Hook to subscribe to database changes
 */
export function useDbSubscription(
  runtimePort: number | null,
  onChange: (event: DbChangeEvent) => void,
) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!runtimePort) return;

    const client = getDbSubscriptionClient(runtimePort);
    const unsubscribe = client.subscribe((event) => {
      onChangeRef.current(event);
    });

    return unsubscribe;
  }, [runtimePort]);
}

/**
 * Hook that returns a callback to invalidate queries on db changes
 */
export function useDbChangeInvalidation(runtimePort: number | null, invalidate: () => void) {
  const invalidateRef = useRef(invalidate);
  invalidateRef.current = invalidate;

  const handleChange = useCallback((event: DbChangeEvent) => {
    if (event.type === "change") {
      invalidateRef.current();
    }
  }, []);

  useDbSubscription(runtimePort, handleChange);
}
