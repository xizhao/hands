/**
 * WorkbookShell - Lazy-loaded workbook container
 *
 * Contains all heavy dependencies (agent, SQLite, etc.)
 * Only loaded when navigating to /w/:workbookId routes.
 */

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMatches } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Toaster } from "sonner";

// Heavy imports - only loaded when this module is imported
import { ChatPanel, PlatformProvider, ApiKeyProvider, LoadingState, useAgentReady, TooltipProvider, initTheme, type ApiKeyContextValue, type EditorContext } from "@hands/app";

// Initialize full theme system when workbook loads
initTheme();
import { ContentTabBar } from "../../components/workbook/ContentTabBar";
import { api as browserApi, subscribeToEvents, getStoredConfig, setStoredConfig, type ServerEvent, type MessageWithParts, type Session, type SessionStatus, type Todo } from "@hands/agent/browser";
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

function ChatSidebar() {
  const matches = useMatches();
  const isAgentReady = useAgentReady();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [pendingRetryContent, setPendingRetryContent] = useState<string | undefined>();
  const autoSendHandled = useRef(false);
  const lastPromptContent = useRef<string>("");

  // Fetch todos for the active session
  const { data: todos = [] } = useTodos(activeSessionId);

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
        />
      </div>
    </ApiKeyProvider>
  );
}

// ============================================================================
// Browser Event Sync
// ============================================================================

function BrowserEventSync({ workbookId }: { workbookId: string }) {
  const qc = useQueryClient();

  // No manual cache clearing needed - queries include workbookId in their input,
  // so React Query naturally scopes cache per workbook

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
          qc.setQueryData<MessageWithParts[]>(
            ["messages", event.message.sessionId, workbookId],
            (old) => {
              if (!old) return [{ info: event.message, parts: [] }];
              const exists = old.some((m) => m.info.id === event.message.id);
              if (exists) {
                return old.map((m) => m.info.id === event.message.id ? { ...m, info: event.message } : m);
              }
              return [...old, { info: event.message, parts: [] }];
            }
          );
          break;

        case "message.part.updated":
          qc.setQueryData<MessageWithParts[]>(
            ["messages", event.sessionId, workbookId],
            (old) => {
              if (!old) return [{ info: { id: event.messageId, sessionId: event.sessionId, role: "assistant", time: { created: Date.now() } }, parts: [event.part] }];
              return old.map((m) => {
                if (m.info.id !== event.messageId) return m;
                const idx = m.parts.findIndex((p) => p.id === event.part.id);
                if (idx >= 0) {
                  const newParts = [...m.parts];
                  newParts[idx] = event.part;
                  return { ...m, parts: newParts };
                }
                return { ...m, parts: [...m.parts, event.part] };
              });
            }
          );
          break;

        case "todo.updated":
          qc.setQueryData<Todo[]>(["todos", event.sessionId, workbookId], event.todos);
          break;

        case "page.updated":
          // Agent created/updated/deleted a page - invalidate the pages list
          qc.invalidateQueries({ queryKey: ["pages"] });
          break;
      }
    });

    return cleanup;
  }, [qc, workbookId]);

  return null;
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
          sidebar={<ChatSidebar />}
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
