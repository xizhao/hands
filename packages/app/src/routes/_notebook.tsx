import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";
import { queryClient } from "@/App";
import { NotebookShell } from "@/components/workbook/NotebookShell";
import { useNeedsTrafficLightOffset } from "@/hooks/useFullscreen";
import type { NavSearchParams } from "@/hooks/useNavState";
import { useActiveSession, useClearNavigation } from "@/hooks/useNavState";
import { useRuntimeProcess } from "@/hooks/useRuntimeState";
import { useSessions } from "@/hooks/useSession";
import { useCreateWorkbook, useOpenWorkbook, useWorkbooks } from "@/hooks/useWorkbook";
import { setNavigateCallback, startSSESync } from "@/lib/sse";
import { cn } from "@/lib/utils";
import type { Workbook } from "@/lib/workbook";

export const Route = createFileRoute("/_notebook")({
  component: NotebookLayout,
  validateSearch: (search: Record<string, unknown>): NavSearchParams => ({
    panel: search.panel as NavSearchParams["panel"],
    tab: search.tab as NavSearchParams["tab"],
    session: search.session as string | undefined,
  }),
});

function NotebookLayout() {
  const navigate = useNavigate();
  // Use minimal platform hook (works without TRPCProvider)
  const { workbookId, isReady } = useRuntimeProcess();
  const { sessionId: activeSessionId, setSession: setActiveSession } = useActiveSession();

  // Set up navigate callback for SSE - routes to correct page based on path
  useEffect(() => {
    setNavigateCallback((path: string) => {
      const cleanPath = path.replace(/^\//, "");
      const [routeType, id] = cleanPath.split("/");

      if (!id) {
        console.warn("[navigate] Invalid path, missing id:", path);
        return;
      }

      // Route to domain-based views (tables and pages are now domain tabs)
      switch (routeType) {
        case "pages":
        case "tables":
        case "domains": {
          // All navigate to domain view - pages go to page tab, tables to sheet tab
          const tab = routeType === "tables" ? "sheet" : "page";
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          navigate({ to: "/domains/$domainId", params: { domainId: id }, search: { tab } } as any);
          break;
        }
        case "actions":
          navigate({ to: "/actions/$actionId", params: { actionId: id } });
          break;
        default:
          console.warn("[navigate] Unknown route type:", routeType, "from path:", path);
      }
    });
  }, [navigate]);

  // Start SSE sync on mount
  useEffect(() => {
    const cleanup = startSSESync(queryClient);
    return cleanup;
  }, []);

  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const { data: workbooks, isLoading: workbooksLoading } = useWorkbooks();
  const createWorkbook = useCreateWorkbook();
  const openWorkbook = useOpenWorkbook();

  // Track initialization
  const initialized = useRef(false);
  const initializingRef = useRef(false);

  // On startup: if no workbook selected, open most recent workbook or create one
  // This should only run once on app start, not during workbook switching
  useEffect(() => {
    if (initialized.current || initializingRef.current) return;
    if (workbooksLoading || workbooks === undefined) return;
    if (createWorkbook.isPending || openWorkbook.isPending) return;

    // If we have a workbookId (even with port=0 during switching), don't auto-init
    if (workbookId) {
      initialized.current = true;
      return;
    }

    initializingRef.current = true;

    if (workbooks.length > 0) {
      const mostRecent = workbooks[0];
      openWorkbook.mutate(mostRecent, {
        onSettled: () => {
          initialized.current = true;
          initializingRef.current = false;
        },
      });
    } else {
      createWorkbook.mutate(
        { name: "My Workbook" },
        {
          onSuccess: (workbook) => {
            openWorkbook.mutate(workbook, {
              onSettled: () => {
                initialized.current = true;
                initializingRef.current = false;
              },
            });
          },
          onError: () => {
            initialized.current = true;
            initializingRef.current = false;
          },
        },
      );
    }
  }, [workbooks, workbooksLoading, workbookId, createWorkbook, openWorkbook, isReady]);

  // Clear activeSessionId if it points to a deleted session
  useEffect(() => {
    if (sessionsLoading || !sessions) return;
    if (activeSessionId && !sessions.some((s) => s.id === activeSessionId)) {
      setActiveSession(null);
    }
  }, [sessions, sessionsLoading, activeSessionId, setActiveSession]);

  // Current workbook from Tauri data (available without runtime)
  // If no workbookId yet (runtime starting), show the most recent workbook (which will be opened)
  const currentWorkbook = workbookId ? workbooks?.find((w) => w.id === workbookId) : workbooks?.[0];
  const needsTrafficLightOffset = useNeedsTrafficLightOffset();
  const clearNavigation = useClearNavigation();

  // Handle workbook switch - works without runtime
  const _handleSwitchWorkbook = useCallback(
    (workbook: Workbook) => {
      clearNavigation();
      openWorkbook.mutate(workbook);
    },
    [clearNavigation, openWorkbook],
  );

  // When runtime not ready, show clean loading state that matches NotebookShell structure
  // This prevents layout shifts when transitioning to full UI
  if (!isReady) {
    return (
      <div className="h-full flex flex-col bg-background overflow-hidden relative before:absolute before:inset-0 before:bg-black/[0.03] before:dark:bg-black/[0.15] before:pointer-events-none">
        {/* Match NotebookShell's header exactly */}
        <header
          data-tauri-drag-region
          className={cn(
            "h-10 flex items-center justify-between pr-4 pt-0.5 shrink-0",
            needsTrafficLightOffset ? "pl-[80px]" : "pl-4",
          )}
        >
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/30 animate-pulse" />
            <span className="text-sm font-medium text-muted-foreground">
              {currentWorkbook?.name ?? "Loading..."}
            </span>
          </div>
          {/* Placeholder for right side buttons */}
          <div className="flex items-center gap-1">
            <div className="h-4 w-8 bg-muted/50 rounded animate-pulse" />
            <div className="h-4 w-8 bg-muted/50 rounded animate-pulse" />
          </div>
        </header>
        {/* Content skeleton matching index page exactly */}
        <div className="flex-1 flex items-center justify-center">
          <div className="space-y-3 w-48">
            <div className="h-3 bg-muted/50 rounded animate-pulse" />
            <div className="h-3 bg-muted/50 rounded animate-pulse w-3/4" />
            <div className="h-3 bg-muted/50 rounded animate-pulse w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <NotebookShell>
      <Outlet />
    </NotebookShell>
  );
}
