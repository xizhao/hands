/**
 * Agent Provider
 *
 * Sets up the browser agent tool context with database and pages access.
 * Must be used within LocalDatabaseProvider.
 *
 * Pages and sessions are stored in SQLite for per-workbook persistence.
 */

import { type ReactNode, useEffect, useRef, useState } from "react";
import {
  setToolContext,
  createPagesStorage,
  createSessionStorage,
  emitEvent,
  type ToolContext,
  type DatabaseContext,
  type TodoContext,
  type TodoItem,
} from "@hands/agent/browser";
import { AgentReadyProvider } from "@hands/app";
import { useLocalDatabase } from "../db/LocalDatabaseProvider";

// ============================================================================
// Provider
// ============================================================================

interface AgentProviderProps {
  children: ReactNode;
}

/**
 * Provider that wires up the browser agent with database and pages access.
 * Place this inside LocalDatabaseProvider and LocalTRPCProvider.
 *
 * All data (pages, sessions, user tables) is stored in SQLite via OPFS.
 */
export function AgentProvider({ children }: AgentProviderProps) {
  const { query, execute, schema, notifyChange, isReady } = useLocalDatabase();
  const [isAgentReady, setIsAgentReady] = useState(false);

  // Use refs to avoid stale closures in the database context
  const queryRef = useRef(query);
  const executeRef = useRef(execute);
  const schemaRef = useRef(schema);
  const notifyChangeRef = useRef(notifyChange);

  // Todo state - stored per session
  const todosRef = useRef<Record<string, TodoItem[]>>({});

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

    // Create database context for SQL operations
    const db: DatabaseContext = {
      query: async (sql: string, params?: unknown[]) => {
        return queryRef.current(sql, params);
      },
      execute: async (sql: string, params?: unknown[]) => {
        await executeRef.current(sql, params);
      },
      getSchema: () => {
        return schemaRef.current.map((t) => ({
          table_name: t.table_name,
          columns: t.columns,
        }));
      },
      notifyChange: () => {
        notifyChangeRef.current();
      },
    };

    // Create pages context using SQLite storage (via _pages table)
    const pages = createPagesStorage(db);

    // Create session storage for todo persistence
    const storage = createSessionStorage(db);

    // Create todo context - persists to SQLite and emits events for UI
    const todo: TodoContext = {
      getTodos: (sessionId: string) => todosRef.current[sessionId] ?? [],
      setTodos: (sessionId: string, todos: TodoItem[]) => {
        // Update in-memory cache
        todosRef.current[sessionId] = todos;

        // Persist to SQLite (fire-and-forget)
        storage.saveTodos(sessionId, todos.map((t) => ({
          id: t.content,
          content: t.content,
          status: t.status,
          activeForm: t.activeForm,
        }))).catch((err) => {
          console.error("[AgentProvider] Failed to persist todos:", err);
        });

        // Emit event for React Query cache update
        emitEvent({
          type: "todo.updated",
          sessionId,
          todos: todos.map((t) => ({
            id: t.content,
            content: t.content,
            status: t.status,
            activeForm: t.activeForm,
          })),
        });
      },
    };

    const toolContext: ToolContext = {
      db,
      pages,
      todo,
      corsProxy: "https://corsproxy.io/?",
    };

    setToolContext(toolContext);
    setIsAgentReady(true);
    console.log("[AgentProvider] Tool context set with SQLite persistence, agent ready");

    return () => {
      setToolContext(null);
      setIsAgentReady(false);
    };
  }, [isReady]);

  return (
    <AgentReadyProvider isReady={isAgentReady}>
      {children}
    </AgentReadyProvider>
  );
}
