import { createRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useCallback } from "react";
import {
  useWorkbooks,
  useCreateWorkbook,
  useOpenWorkbook,
  useActiveRuntime,
  useRuntimePort,
} from "@/hooks/useWorkbook";
import { useActiveSession } from "@/hooks/useNavState";
import { useSessions } from "@/hooks/useSession";
import { startSSESync, setNavigateCallback } from "@/lib/sse";
import { useDbSync } from "@/hooks/useDbHooks";
import { queryClient } from "@/App";
import type { ChangeRecord } from "@/hooks/useDbHooks";

import { NotebookShell } from "@/components/Notebook/NotebookShell";
import { rootRoute } from "./__root";
import type { NavSearchParams } from "@/hooks/useNavState";

export const notebookRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_notebook",
  component: NotebookLayout,
  validateSearch: (search: Record<string, unknown>): NavSearchParams => ({
    panel: search.panel as NavSearchParams["panel"],
    tab: search.tab as NavSearchParams["tab"],
    session: search.session as string | undefined,
  }),
});

function NotebookLayout() {
  const navigate = useNavigate();
  const runtimePort = useRuntimePort();
  const { data: activeRuntime } = useActiveRuntime();
  const { sessionId: activeSessionId, setSession: setActiveSession } = useActiveSession();

  // Set up navigate callback for SSE
  useEffect(() => {
    setNavigateCallback((page: string) => {
      const pageId = page.replace(/^\//, "").replace(/\//g, "-") || "index";
      navigate({ to: "/page/$pageId", params: { pageId } });
    });
  }, [navigate]);

  // Start SSE sync on mount
  useEffect(() => {
    const cleanup = startSSESync(queryClient);
    return cleanup;
  }, []);

  // Track if DB browser has been opened for this session
  const dbBrowserOpenedRef = useRef(false);

  // Handle new database changes
  const handleDbChange = useCallback(
    (change: ChangeRecord) => {
      if (dbBrowserOpenedRef.current) return;
      if (runtimePort && activeRuntime?.workbook_id) {
        console.log("[notebook] DB change:", change.op, change.table);
        dbBrowserOpenedRef.current = true;
      }
    },
    [runtimePort, activeRuntime?.workbook_id]
  );

  // Start database change SSE subscription
  useDbSync(handleDbChange);

  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const { data: workbooks, isLoading: workbooksLoading } = useWorkbooks();
  const createWorkbook = useCreateWorkbook();
  const openWorkbook = useOpenWorkbook();

  // Track initialization
  const initialized = useRef(false);
  const initializingRef = useRef(false);

  // On startup: if no active runtime, open most recent workbook or create one
  useEffect(() => {
    if (initialized.current || initializingRef.current) return;
    if (workbooksLoading || workbooks === undefined) return;
    if (createWorkbook.isPending || openWorkbook.isPending) return;

    // If we already have an active runtime from Tauri, we're done
    if (activeRuntime) {
      console.log("[notebook] Already have active runtime:", activeRuntime.workbook_id);
      initialized.current = true;
      return;
    }

    initializingRef.current = true;
    console.log("[notebook] No active runtime, starting one...");

    if (workbooks.length > 0) {
      const mostRecent = workbooks[0];
      console.log("[notebook] Opening most recent workbook:", mostRecent.id);
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
            console.log("[notebook] Created new workbook:", workbook.id);
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
        }
      );
    }
  }, [workbooks, workbooksLoading, activeRuntime, createWorkbook, openWorkbook]);

  // Clear activeSessionId if it points to a deleted session
  useEffect(() => {
    if (sessionsLoading || !sessions) return;
    if (activeSessionId && !sessions.some((s) => s.id === activeSessionId)) {
      setActiveSession(null);
    }
  }, [sessions, sessionsLoading, activeSessionId, setActiveSession]);

  return (
    <NotebookShell>
      <Outlet />
    </NotebookShell>
  );
}
