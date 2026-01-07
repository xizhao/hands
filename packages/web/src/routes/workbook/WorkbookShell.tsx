/**
 * WorkbookShell - Lazy-loaded workbook container
 *
 * Contains all heavy dependencies (agent, SQLite, etc.)
 * Only loaded when navigating to /w/:workbookId routes.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMatches } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "sonner";

// Heavy imports - only loaded when this module is imported
import { ChatPanel, PlatformProvider, ApiKeyProvider, LoadingState, useAgentReady, TooltipProvider, initTheme, type ApiKeyContextValue, type EditorContext, type MessageOperations } from "@hands/app";

// Initialize full theme system when workbook loads
initTheme();
import { ContentTabBar } from "../../components/workbook/ContentTabBar";
import { api as browserApi, subscribeToEvents, getStoredConfig, setStoredConfig, getContextStats, type ServerEvent, type MessageWithParts, type Session, type SessionStatus, type Todo, type Part } from "@hands/agent/browser";
import { AgentProvider } from "../../agent/AgentProvider";
import { LocalDatabaseProvider } from "../../db/LocalDatabaseProvider";
import { createLocalPlatformAdapter } from "../../platform/LocalAdapter";
import { LocalTRPCProvider } from "../../trpc/LocalTRPCProvider";
import { SettingsPopover } from "../../components/SettingsPopover";
import { WorkbookTitleEditor } from "../../components/WorkbookTitleEditor";
import { useTodos } from "../../hooks/useTodos";
import { WebShell } from "../../shell/WebShell";
import { LandingSidebar } from "../../shell/LandingSidebar";

// Lazy load content views
const WorkbookIndex = lazy(() => import("./WorkbookIndex"));
const PageView = lazy(() => import("./PageView"));
const TableView = lazy(() => import("./TableView"));

// Content view that renders based on current route
function ContentView() {
  const matches = useMatches();

  const pageMatch = matches.find((m) => m.routeId === "/w/$workbookId/pages/$pageId");
  if (pageMatch?.params?.pageId) {
    return <PageView />;
  }

  const tableMatch = matches.find((m) => m.routeId === "/w/$workbookId/tables/$tableId");
  if (tableMatch?.params?.tableId) {
    return <TableView />;
  }

  return <WorkbookIndex />;
}

// Query client passed from parent
import { queryClient } from "../../lib/queryClient";

// ============================================================================
// Chat Sidebar
// ============================================================================

function ChatSidebar({ workbookId }: { workbookId: string }) {
  const matches = useMatches();
  const isAgentReady = useAgentReady();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [pendingRetryContent, setPendingRetryContent] = useState<string | undefined>();
  const autoSendHandled = useRef(false);
  const autoSelectHandled = useRef(false);
  const lastPromptContent = useRef<string>("");

  // Auto-select latest session when workbook loads
  useEffect(() => {
    if (!isAgentReady) return;
    if (autoSelectHandled.current) return;
    if (activeSessionId) return; // Already have a session selected

    autoSelectHandled.current = true;

    // Fetch sessions and select the most recent one
    browserApi.sessions.list().then((sessions) => {
      if (sessions.length > 0) {
        // Sort by updated time descending, pick the latest
        const sorted = [...sessions].sort((a, b) => b.time.updated - a.time.updated);
        setActiveSessionId(sorted[0].id);
      }
    });
  }, [isAgentReady, activeSessionId]);

  // Get combined messages using opencode pattern (messages + parts from separate caches)
  const messages = useMessagesWithParts(activeSessionId, workbookId);

  // Fetch todos for the active session
  const { data: todos = [] } = useTodos(activeSessionId);

  // Compute context stats from messages
  const contextStats = useMemo(() => {
    if (!messages.length) return undefined;
    const config = getStoredConfig();
    const modelId = config?.modelId || "anthropic/claude-sonnet-4";
    return getContextStats({ messages, modelId });
  }, [messages]);

  // Detect current page/table from route
  const editorContext = useMemo<EditorContext>(() => {
    const pageMatch = matches.find((m) => m.routeId === "/w/$workbookId/pages/$pageId");
    if (pageMatch?.params?.pageId) {
      return { type: "page", id: pageMatch.params.pageId as string };
    }
    const tableMatch = matches.find((m) => m.routeId === "/w/$workbookId/tables/$tableId");
    if (tableMatch?.params?.tableId) {
      return { type: "table", id: tableMatch.params.tableId as string };
    }
    return { type: "none" };
  }, [matches]);

  // Check if API key is configured
  const hasApiKey = useMemo(() => {
    const config = getStoredConfig();
    return !!config?.apiKey;
  }, []);

  // Save API key and trigger retry
  const saveApiKey = useCallback((key: string) => {
    setStoredConfig({ type: "openrouter", apiKey: key });
  }, []);

  // Called after API key is saved - retry the failed message
  const onApiKeySaved = useCallback(async () => {
    if (!pendingRetryContent || !activeSessionId) return;

    const content = pendingRetryContent;
    setPendingRetryContent(undefined);

    try {
      await browserApi.promptAsync(activeSessionId, content, { agent: "hands" });
    } catch (err) {
      console.error("[ChatSidebar] Retry failed:", err);
    }
  }, [pendingRetryContent, activeSessionId]);

  // API key context value
  const apiKeyContextValue = useMemo<ApiKeyContextValue>(() => ({
    hasApiKey,
    saveApiKey,
    onApiKeySaved,
    pendingRetryContent,
    setPendingRetryContent,
  }), [hasApiKey, saveApiKey, onApiKeySaved, pendingRetryContent]);

  // Browser API operations - uses browserApi instead of desktop opencode API
  const messageOperations = useMemo<MessageOperations>(() => ({
    createSession: async (body) => {
      return browserApi.sessions.create(body);
    },
    sendMessage: async (sessionId, content, system) => {
      await browserApi.promptAsync(sessionId, content, { agent: "hands", system });
    },
    deleteSession: async (sessionId) => {
      await browserApi.sessions.delete(sessionId);
    },
    abortSession: async (sessionId) => {
      await browserApi.abort(sessionId);
    },
  }), []);

  // Extract ?q= param and auto-send when agent is ready
  useEffect(() => {
    if (autoSendHandled.current) return;
    if (!isAgentReady) return;

    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");

    if (!q) return;

    // Clear the param from URL
    const url = new URL(window.location.href);
    url.searchParams.delete("q");
    window.history.replaceState({}, "", url.toString());

    autoSendHandled.current = true;
    lastPromptContent.current = q;

    (async () => {
      try {
        const session = await browserApi.sessions.create();
        setActiveSessionId(session.id);
        await browserApi.promptAsync(session.id, q, { agent: "hands" });
        setPendingRetryContent(undefined);
      } catch (err) {
        console.error("[ChatSidebar] Auto-send failed:", err);
      }
    })();
  }, [isAgentReady]);

  return (
    <ApiKeyProvider value={apiKeyContextValue}>
      <div className="flex flex-col h-full">
        <ChatPanel
          sessionId={activeSessionId}
          onSessionSelect={setActiveSessionId}
          compact={true}
          showBackButton={true}
          inputValue={inputValue}
          onInputChange={setInputValue}
          editorContext={editorContext}
          todos={todos}
          messages={messages}
          operations={messageOperations}
          contextStats={contextStats}
        />
      </div>
    </ApiKeyProvider>
  );
}

// ============================================================================
// Browser Event Sync - Opencode Pattern
// ============================================================================

/**
 * Parts are stored separately from messages (opencode pattern).
 * This handles the race condition where parts arrive before their parent message.
 *
 * Cache structure:
 * - ["messages", sessionId, workbookId] → Message[] (info only, no parts)
 * - ["parts", sessionId, workbookId] → Record<messageId, Part[]>
 *
 * Components combine at render time via useMessagesWithParts hook.
 */
type PartsCache = Record<string, Part[]>;
type Message = MessageWithParts["info"];

/**
 * Helper to upsert into a sorted array by id
 */
function upsertSorted<T extends { id: string }>(arr: T[], item: T): T[] {
  // Filter out any items without valid id (handles cache format migration)
  const validArr = arr.filter((x) => x && typeof x.id === "string");

  const idx = validArr.findIndex((x) => x.id === item.id);
  if (idx >= 0) {
    const updated = [...validArr];
    updated[idx] = item;
    return updated;
  }
  const result = [...validArr, item];
  result.sort((a, b) => a.id.localeCompare(b.id));
  return result;
}

function BrowserEventSync({ workbookId }: { workbookId: string }) {
  const qc = useQueryClient();

  useEffect(() => {
    const cleanup = subscribeToEvents((event: ServerEvent) => {
      switch (event.type) {
        case "session.created":
          qc.setQueryData<Session[]>(["sessions", workbookId], (old) => {
            if (!old) return [event.session];
            if (old.some((s) => s.id === event.session.id)) return old;
            return [event.session, ...old];
          });
          break;

        case "session.updated":
          qc.setQueryData<Session[]>(["sessions", workbookId], (old) =>
            old?.map((s) => (s.id === event.session.id ? event.session : s))
          );
          break;

        case "session.status":
          qc.setQueryData<Record<string, SessionStatus>>(
            ["session-statuses", workbookId],
            (old) => ({ ...old, [event.sessionId]: event.status })
          );
          break;

        case "message.updated":
          // Store message info only (no parts) - opencode pattern
          // Use "message-info" key to avoid collision with app's "messages" key
          qc.setQueryData<Message[]>(
            ["message-info", event.message.sessionId, workbookId],
            (old) => upsertSorted(old ?? [], event.message)
          );
          break;

        case "message.part.updated":
          // Store parts separately - opencode pattern
          // "Don't filter by message existence - parts can arrive before their parent message"
          qc.setQueryData<PartsCache>(
            ["message-parts", event.sessionId, workbookId],
            (old) => ({
              ...old,
              [event.messageId]: upsertSorted(old?.[event.messageId] ?? [], event.part),
            })
          );
          break;

        case "todo.updated":
          qc.setQueryData<Todo[]>(["todos", event.sessionId, workbookId], event.todos);
          break;

        case "page.updated":
          qc.invalidateQueries({ queryKey: ["pages"] });
          break;
      }
    });

    return cleanup;
  }, [qc, workbookId]);

  return null;
}

// ============================================================================
// useMessagesWithParts - Combines messages + parts at render time
// ============================================================================

/**
 * Hook that combines messages with their parts from separate caches.
 * Uses useQuery to subscribe to cache updates - opencode pattern.
 *
 * Cache keys use "message-info" and "message-parts" to avoid collision
 * with the app package's "messages" key (which uses MessageWithParts[]).
 */
function useMessagesWithParts(sessionId: string | null, workbookId: string): MessageWithParts[] {
  const qc = useQueryClient();
  const initialFetchDone = useRef<Set<string>>(new Set());

  // One-time fetch for existing sessions (e.g., page refresh)
  // Uses setQueryData so it doesn't conflict with SSE updates
  useEffect(() => {
    if (!sessionId) return;
    if (initialFetchDone.current.has(sessionId)) return;
    initialFetchDone.current.add(sessionId);

    browserApi.messages.list(sessionId).then((fullMessages) => {
      if (fullMessages.length === 0) return;

      // Only set if cache is empty (SSE may have already populated it)
      const existing = qc.getQueryData<Message[]>(["message-info", sessionId, workbookId]);
      if (!existing || existing.length === 0) {
        qc.setQueryData<Message[]>(
          ["message-info", sessionId, workbookId],
          fullMessages.map((m) => m.info)
        );
      }

      // Same for parts
      const existingParts = qc.getQueryData<PartsCache>(["message-parts", sessionId, workbookId]);
      if (!existingParts || Object.keys(existingParts).length === 0) {
        const partsCache: PartsCache = {};
        for (const m of fullMessages) {
          if (m.parts.length > 0) {
            partsCache[m.info.id] = m.parts;
          }
        }
        if (Object.keys(partsCache).length > 0) {
          qc.setQueryData<PartsCache>(["message-parts", sessionId, workbookId], partsCache);
        }
      }
    });
  }, [sessionId, workbookId, qc]);

  // Subscribe to cache changes - empty queryFn, data comes from setQueryData (SSE)
  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["message-info", sessionId, workbookId],
    queryFn: () => [], // Never fetches - SSE populates via setQueryData
    enabled: !!sessionId,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const { data: partsCache = {} } = useQuery<PartsCache>({
    queryKey: ["message-parts", sessionId, workbookId],
    queryFn: () => ({}),
    enabled: !!sessionId,
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  // Combine at render time
  return useMemo(() => {
    return messages.map((info) => ({
      info,
      parts: partsCache[info.id] ?? [],
    }));
  }, [messages, partsCache]);
}

// ============================================================================
// Workbook Providers
// ============================================================================

type WorkbookRenderProps = {
  isReady: boolean;
  workbookId?: string;
  workbookName?: string;
  onWorkbookNameChange?: (name: string) => void;
};

function WorkbookProviders({
  workbookId,
  children
}: {
  workbookId: string;
  children: (props: WorkbookRenderProps) => ReactNode;
}) {
  const adapter = useMemo(() => createLocalPlatformAdapter(), []);
  const qc = useQueryClient();
  const [isReady, setIsReady] = useState(false);
  const [workbookName, setWorkbookName] = useState<string | undefined>();

  useEffect(() => {
    async function init() {
      try {
        console.log("[WorkbookProviders] Loading workbooks for:", workbookId);
        const workbooks = await adapter.workbook.list();
        const found = workbooks.find((w) => w.id === workbookId);
        if (found) {
          console.log("[WorkbookProviders] Opening workbook:", found.id);
          await adapter.workbook.open(found);
          setWorkbookName(found.name);
          setIsReady(true);

          qc.setQueryData(["active-runtime"], {
            running: true,
            workbook_id: found.id,
            directory: found.id,
            runtime_port: 1,
            message: "Local mode active",
          });
          console.log("[WorkbookProviders] Workbook ready");
        } else {
          console.warn("[WorkbookProviders] Workbook not found:", workbookId);
        }
      } catch (err) {
        console.error("[WorkbookProviders] Init error:", err);
      }
    }

    init();
  }, [adapter, workbookId, qc]);

  const handleWorkbookNameChange = useCallback((name: string) => {
    setWorkbookName(name);
  }, []);

  return (
    <TooltipProvider delayDuration={300}>
      <PlatformProvider adapter={adapter}>
        <LocalDatabaseProvider initialWorkbookId={workbookId}>
          <LocalTRPCProvider queryClient={queryClient}>
            <AgentProvider>
              <BrowserEventSync workbookId={workbookId} />
              {children({
                isReady,
                workbookId,
                workbookName,
                onWorkbookNameChange: handleWorkbookNameChange,
              })}
            </AgentProvider>
          </LocalTRPCProvider>
        </LocalDatabaseProvider>
      </PlatformProvider>
    </TooltipProvider>
  );
}

// ============================================================================
// Workbook Shell (exported)
// ============================================================================

export interface WorkbookShellProps {
  workbookId: string;
}

/**
 * WorkbookShell - Main workbook layout with chat sidebar + content
 *
 * This is the heavy-weight shell that contains:
 * - ChatSidebar (agent, session management)
 * - ContentTabBar (page/table tabs)
 * - ContentView (lazy-loaded page/table views)
 *
 * It's lazy-loaded from App.tsx to keep the landing page lightweight.
 * All heavy deps (agent, SQLite, Pyodide) only load when visiting /w/:workbookId routes.
 */
export default function WorkbookShell({ workbookId }: WorkbookShellProps) {
  // Use key to force remount when switching workbooks
  // This ensures all state (sessions, pages, etc.) is reset for the new workbook
  return (
    <WorkbookProviders key={workbookId} workbookId={workbookId}>
      {({ isReady, workbookName, onWorkbookNameChange }) => (
        <WebShell
          sidebar={<ChatSidebar workbookId={workbookId} />}
          floatingSidebar={<LandingSidebar />}
          topbarLeft={
            <WorkbookTitleEditor
              workbookId={workbookId}
              name={workbookName ?? "Untitled"}
              onNameChange={onWorkbookNameChange}
            />
          }
          topbarActions={<SettingsPopover />}
          contentHeader={<ContentTabBar />}
          sidebarWidth={340}
          inWorkbook
        >
          <Suspense fallback={<LoadingState />}>
            <ContentView />
          </Suspense>
        </WebShell>
      )}
    </WorkbookProviders>
  );
}
