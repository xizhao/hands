/**
 * Agent Provider
 *
 * Sets up the browser agent tool context with database access.
 * Must be used within LocalDatabaseProvider.
 */

import { type ReactNode, useEffect, useRef, useState } from "react";
import { setToolContext, type ToolContext, type DatabaseContext } from "@hands/agent/browser";
import { AgentReadyProvider } from "@hands/app";
import { useLocalDatabase } from "../db/LocalDatabaseProvider";

// ============================================================================
// Provider
// ============================================================================

interface AgentProviderProps {
  children: ReactNode;
}

/**
 * Provider that wires up the browser agent with database access.
 * Place this inside LocalDatabaseProvider and LocalTRPCProvider.
 */
export function AgentProvider({ children }: AgentProviderProps) {
  const { query, execute, schema, notifyChange, isReady } = useLocalDatabase();
  const [isAgentReady, setIsAgentReady] = useState(false);

  // Use refs to avoid stale closures in the database context
  const queryRef = useRef(query);
  const executeRef = useRef(execute);
  const schemaRef = useRef(schema);
  const notifyChangeRef = useRef(notifyChange);

  // Update refs when values change
  useEffect(() => {
    queryRef.current = query;
    executeRef.current = execute;
    schemaRef.current = schema;
    notifyChangeRef.current = notifyChange;
  }, [query, execute, schema, notifyChange]);

  // Set up tool context when database is ready
  useEffect(() => {
    if (!isReady) return;

    // Create database context that matches DatabaseContext interface
    const db: DatabaseContext = {
      // Execute a read query (async)
      query: async (sql: string, params?: unknown[]) => {
        return queryRef.current(sql, params);
      },

      // Execute a mutation (async)
      execute: async (sql: string, params?: unknown[]) => {
        await executeRef.current(sql, params);
      },

      // Get current schema
      getSchema: () => {
        return schemaRef.current.map((t) => ({
          table_name: t.table_name,
          columns: t.columns,
        }));
      },

      // Notify data change
      notifyChange: () => {
        notifyChangeRef.current();
      },

      // Page operations (stubs for now)
      getPages: async () => [],
      getPage: async () => null,
      savePage: async () => {},
    };

    const toolContext: ToolContext = {
      db,
      corsProxy: "https://corsproxy.io/?",
    };

    setToolContext(toolContext);
    setIsAgentReady(true);
    console.log("[AgentProvider] Tool context set, agent ready");

    // Cleanup on unmount
    return () => {
      setToolContext(null as unknown as ToolContext);
      setIsAgentReady(false);
    };
  }, [isReady]);

  return (
    <AgentReadyProvider isReady={isAgentReady}>
      {children}
    </AgentReadyProvider>
  );
}
