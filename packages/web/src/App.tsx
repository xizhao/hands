/**
 * Web App
 *
 * SPA with TanStack Router (browser history).
 * Single shell at root with conditional providers.
 */

import { initTheme, ChatPanel, PlatformProvider, TooltipProvider, ApiKeyProvider, LoadingState, HeaderActionsProvider, useAgentReady, type ApiKeyContextValue, type EditorContext } from "@hands/app";
import { ContentTabBar } from "./components/workbook/ContentTabBar";
import { api as browserApi, subscribeToEvents, getStoredConfig, setStoredConfig, type ServerEvent, type MessageWithParts, type Session, type SessionStatus, type Todo } from "@hands/agent/browser";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import {
  Outlet,
  redirect,
  RouterProvider,
  createRootRoute,
  createRoute,
  createRouter,
  useMatches,
} from "@tanstack/react-router";
import { lazy, type ReactNode, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Toaster } from "sonner";
import { getLastOpenedWorkbookId } from "./shared/lib/storage";
import { WebShell } from "./shell/WebShell";
import { LandingSidebar } from "./shell/LandingSidebar";
import { LandingContent } from "./routes/LandingPage";
import { AgentProvider } from "./agent/AgentProvider";
import { LocalDatabaseProvider } from "./db/LocalDatabaseProvider";
import { createLocalPlatformAdapter } from "./platform/LocalAdapter";
import { LocalTRPCProvider } from "./trpc/LocalTRPCProvider";
import { SettingsPopover } from "./components/SettingsPopover";
import { WorkbookTitleEditor } from "./components/WorkbookTitleEditor";

// Initialize theme
initTheme();

// Query client at module level
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 1000 * 60, retry: 1 },
  },
});

// Lazy load content views
const WorkbookIndex = lazy(() => import("./routes/workbook/WorkbookIndex"));
const PageView = lazy(() => import("./routes/workbook/PageView"));
const TableView = lazy(() => import("./routes/workbook/TableView"));

// Content loader - uses shared LoadingState component
function ContentLoader() {
  return <LoadingState />;
}

// Chat sidebar for workbook
function ChatSidebar() {
  const matches = useMatches();
  const isAgentReady = useAgentReady();
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [pendingRetryContent, setPendingRetryContent] = useState<string | undefined>();
  const autoSendHandled = useRef(false);
  const lastPromptContent = useRef<string>("");

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

    // Retry sending the message
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
    if (!isAgentReady) return; // Wait for agent to be ready

    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");

    if (!q) return;

    // Clear the param from URL
    const url = new URL(window.location.href);
    url.searchParams.delete("q");
    window.history.replaceState({}, "", url.toString());

    autoSendHandled.current = true;

    // Store the prompt content for potential retry
    lastPromptContent.current = q;
    setPendingRetryContent(q);

    // Use browser API directly (no HTTP server needed)
    (async () => {
      try {
        const session = await browserApi.sessions.create();
        setActiveSessionId(session.id);
        await browserApi.promptAsync(session.id, q, { agent: "hands" });
        // Clear pending if successful (no error)
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
        />
      </div>
    </ApiKeyProvider>
  );
}


// Browser event sync - connects browser API events to React Query cache
function BrowserEventSync() {
  const qc = useQueryClient();

  useEffect(() => {
    const cleanup = subscribeToEvents((event: ServerEvent) => {
      switch (event.type) {
        case "session.created":
          qc.setQueryData<Session[]>(["sessions", null], (old) => {
            if (!old) return [event.session];
            if (old.some((s) => s.id === event.session.id)) return old;
            return [event.session, ...old];
          });
          break;

        case "session.updated":
          qc.setQueriesData<Session[]>({ queryKey: ["sessions"], exact: false }, (old) =>
            old?.map((s) => (s.id === event.session.id ? event.session : s))
          );
          break;

        case "session.status":
          qc.setQueriesData<Record<string, SessionStatus>>(
            { queryKey: ["session-statuses"], exact: false },
            (old) => ({ ...old, [event.sessionId]: event.status })
          );
          break;

        case "message.updated":
          qc.setQueriesData<MessageWithParts[]>(
            { queryKey: ["messages", event.message.sessionId], exact: false },
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
          qc.setQueriesData<MessageWithParts[]>(
            { queryKey: ["messages", event.sessionId], exact: false },
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
          qc.setQueryData<Todo[]>(["todos", event.sessionId, null], event.todos);
          break;
      }
    });

    return cleanup;
  }, [qc]);

  return null;
}

// Render props type for WorkbookProviders
type WorkbookRenderProps = {
  isReady: boolean;
  workbookId?: string;
  workbookName?: string;
  onWorkbookNameChange?: (name: string) => void;
};

// Conditional providers - only activate when workbookId exists
function WorkbookProviders({
  workbookId,
  children
}: {
  workbookId: string | undefined;
  children: (props: WorkbookRenderProps) => ReactNode;
}) {
  const adapter = useMemo(() => createLocalPlatformAdapter(), []);
  const qc = useQueryClient();
  const [isReady, setIsReady] = useState(false);
  const [workbookName, setWorkbookName] = useState<string | undefined>();

  useEffect(() => {
    if (!workbookId) {
      setIsReady(false);
      setWorkbookName(undefined);
      // Clear runtime status when no workbook
      qc.setQueryData(["active-runtime"], null);
      return;
    }

    async function init() {
      try {
        console.log("[WorkbookProviders] Loading workbooks for:", workbookId);
        const workbooks = await adapter.workbook.list();
        console.log("[WorkbookProviders] Found workbooks:", workbooks.map(w => w.id));
        const found = workbooks.find((w) => w.id === workbookId);
        if (found) {
          console.log("[WorkbookProviders] Opening workbook:", found.id);
          await adapter.workbook.open(found);
          setWorkbookName(found.name);
          setIsReady(true);

          // Update query cache with runtime status so useTRPCReady works
          qc.setQueryData(["active-runtime"], {
            running: true,
            workbook_id: found.id,
            directory: found.id,
            runtime_port: 1, // Sentinel for local mode
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

  // Handler for name changes
  const handleWorkbookNameChange = useCallback((name: string) => {
    setWorkbookName(name);
  }, []);

  // No workbook - render without providers (landing page)
  if (!workbookId) {
    return <>{children({ isReady: false })}</>;
  }

  // Workbook - wrap in providers
  return (
    <PlatformProvider adapter={adapter}>
      <LocalDatabaseProvider initialWorkbookId={workbookId}>
        <LocalTRPCProvider queryClient={queryClient}>
          <AgentProvider>
            <BrowserEventSync />
            <TooltipProvider>
              <HeaderActionsProvider>
                {children({ isReady, workbookId, workbookName, onWorkbookNameChange: handleWorkbookNameChange })}
              </HeaderActionsProvider>
              <Toaster
                position="bottom-right"
                offset={16}
                gap={8}
                toastOptions={{
                  unstyled: true,
                  classNames: {
                    toast: "flex items-center gap-2 px-3 py-2 rounded-lg text-xs bg-popover border border-border text-popover-foreground shadow-lg max-w-xs",
                    error: "text-red-400 [&>svg]:text-red-400",
                    success: "text-green-400 [&>svg]:text-green-400",
                    title: "font-medium",
                    description: "text-muted-foreground",
                  },
                }}
                style={{ zIndex: 9999 }}
              />
            </TooltipProvider>
          </AgentProvider>
        </LocalTRPCProvider>
      </LocalDatabaseProvider>
    </PlatformProvider>
  );
}

// Root layout - single shell, providers wrap everything
function RootLayout() {
  const matches = useMatches();
  const workbookMatch = matches.find((m) => m.routeId === "/w/$workbookId");
  const workbookId = workbookMatch?.params?.workbookId as string | undefined;
  const [workbookCount, setWorkbookCount] = useState<number | null>(null);

  // Check workbook count on mount (for initial sidebar visibility)
  useEffect(() => {
    if (workbookId) return; // Will be updated by LandingSidebar
    const adapter = createLocalPlatformAdapter();
    adapter.workbook.list().then((workbooks) => {
      setWorkbookCount(workbooks.length);
    });
  }, [workbookId]);

  // Callback for LandingSidebar to update count
  const handleWorkbooksChange = useCallback((count: number) => {
    setWorkbookCount(count);
  }, []);

  // Determine sidebar content
  // ChatSidebar doesn't need isReady - it has its own loading states
  const getSidebar = () => {
    if (workbookId) {
      return <ChatSidebar />;
    }
    // Landing page: only show sidebar if there are workbooks
    if (workbookCount === null || workbookCount === 0) return undefined;
    return <LandingSidebar onWorkbooksChange={handleWorkbooksChange} />;
  };

  return (
    <QueryClientProvider client={queryClient}>
      <WorkbookProviders workbookId={workbookId}>
        {({ workbookId: wbId, workbookName, onWorkbookNameChange }) => (
          <WebShell
            sidebar={getSidebar()}
            floatingSidebar={workbookId ? <LandingSidebar onWorkbooksChange={handleWorkbooksChange} /> : undefined}
            inWorkbook={!!wbId}
            topbarLeft={
              wbId && workbookName ? (
                <WorkbookTitleEditor
                  workbookId={wbId}
                  name={workbookName}
                  onNameChange={onWorkbookNameChange}
                />
              ) : undefined
            }
            topbarActions={<SettingsPopover />}
          >
            <Outlet />
          </WebShell>
        )}
      </WorkbookProviders>
    </QueryClientProvider>
  );
}

// Landing content wrapper
function LandingWrapper() {
  return (
    <div className="h-full px-2 pb-2 pt-0.5">
      <div className="h-full border border-border/40 bg-background overflow-hidden shadow-sm rounded-lg flex items-center justify-center px-6">
        <LandingContent />
      </div>
    </div>
  );
}

// Workbook content wrapper
function WorkbookContent() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0 overflow-hidden px-2 pt-0.5">
        <div className="h-full border border-border/40 border-b-0 bg-background overflow-hidden shadow-sm rounded-t-lg">
          <Outlet />
        </div>
      </div>
      <div className="shrink-0 h-8 px-2 pb-1">
        <ContentTabBar />
      </div>
    </div>
  );
}

// Route definitions
const rootRoute = createRootRoute({
  component: RootLayout,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LandingWrapper,
});

const workbookRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/w/$workbookId",
  component: WorkbookContent,
  validateSearch: (search: Record<string, unknown>) => ({
    q: typeof search.q === "string" ? search.q : undefined,
  }),
});

const workbookIndexRoute = createRoute({
  getParentRoute: () => workbookRoute,
  path: "/",
  component: () => (
    <Suspense fallback={<ContentLoader />}>
      <WorkbookIndex />
    </Suspense>
  ),
});

const workbookPageRoute = createRoute({
  getParentRoute: () => workbookRoute,
  path: "/pages/$pageId",
  component: () => (
    <Suspense fallback={<ContentLoader />}>
      <PageView />
    </Suspense>
  ),
});

const workbookTableRoute = createRoute({
  getParentRoute: () => workbookRoute,
  path: "/tables/$tableId",
  component: () => (
    <Suspense fallback={<ContentLoader />}>
      <TableView />
    </Suspense>
  ),
});

// Redirect routes
const pageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/pages/$pageId",
  beforeLoad: async ({ params }) => {
    const workbookId = await getLastOpenedWorkbookId();
    if (workbookId) {
      throw redirect({
        to: "/w/$workbookId/pages/$pageId",
        params: { workbookId, pageId: params.pageId },
      });
    }
    throw redirect({ to: "/" });
  },
});

const tableRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tables/$tableId",
  beforeLoad: async ({ params }) => {
    const workbookId = await getLastOpenedWorkbookId();
    if (workbookId) {
      throw redirect({
        to: "/w/$workbookId/tables/$tableId",
        params: { workbookId, tableId: params.tableId },
      });
    }
    throw redirect({ to: "/" });
  },
});

// Build route tree
const routeTree = rootRoute.addChildren([
  indexRoute,
  workbookRoute.addChildren([
    workbookIndexRoute,
    workbookPageRoute,
    workbookTableRoute,
  ]),
  pageRoute,
  tableRoute,
]);

// Create router
const router = createRouter({
  routeTree,
  defaultPreload: "intent",
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function App() {
  return <RouterProvider router={router} />;
}
