import { createRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useUIStore } from "@/stores/ui";
import { useWorkbooks, useCreateWorkbook, useOpenWorkbook, RuntimeStatus } from "@/hooks/useWorkbook";
import type { Workbook } from "@/lib/workbook";
import { useSessions } from "@/hooks/useSession";
import { startSSESync, setNavigateCallback } from "@/lib/sse";
import { useDbSync } from "@/store/db-hooks";
import { queryClient } from "@/App";
import type { ChangeRecord } from "@/store/db-hooks";

import { NotebookShell } from "@/components/Notebook/NotebookShell";
import { rootRoute } from "./__root";

export const notebookRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: "_notebook",
  component: NotebookLayout,
});

function NotebookLayout() {
  const navigate = useNavigate();
  const { setActivePage } = useUIStore();

  // Set up navigate callback for SSE
  useEffect(() => {
    setNavigateCallback((page: string) => {
      const pageId = page.replace(/^\//, "").replace(/\//g, "-") || "index";
      setActivePage(pageId);
      navigate({ to: "/page/$pageId", params: { pageId } });
    });
  }, [navigate, setActivePage]);

  // Start SSE sync on mount
  useEffect(() => {
    const cleanup = startSSESync(queryClient);
    return cleanup;
  }, []);

  // Track if DB browser has been opened for this session
  const dbBrowserOpenedRef = useRef(false);

  // Handle new database changes
  const handleDbChange = useCallback((change: ChangeRecord) => {
    if (dbBrowserOpenedRef.current) return;
    const runtimePort = useUIStore.getState().runtimePort;
    const workbookId = useUIStore.getState().activeWorkbookId;
    if (runtimePort && workbookId) {
      console.log("[notebook] DB change:", change.op, change.table);
      dbBrowserOpenedRef.current = true;
    }
  }, []);

  // Start database change SSE subscription
  useDbSync(handleDbChange);

  const { setActiveWorkbook, setActiveSession, activeSessionId } = useUIStore();
  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const { data: workbooks, isLoading: workbooksLoading } = useWorkbooks();
  const createWorkbook = useCreateWorkbook();
  const openWorkbook = useOpenWorkbook();

  // Track initialization
  const initialized = useRef(false);
  const initializingRef = useRef(false);

  // On startup: check Tauri for active runtime, or start one
  useEffect(() => {
    if (initialized.current || initializingRef.current) return;
    if (workbooksLoading || workbooks === undefined) return;
    if (createWorkbook.isPending || openWorkbook.isPending) return;

    initializingRef.current = true;

    invoke<RuntimeStatus | null>("get_active_runtime").then((active) => {
      if (active) {
        console.log("[notebook] Tauri has active runtime:", active.workbook_id);
        setActiveWorkbook(active.workbook_id, active.directory);
        initialized.current = true;
        initializingRef.current = false;
        return;
      }

      console.log("[notebook] No active runtime, starting one...");

      if (workbooks.length > 0) {
        const mostRecent = workbooks[0];
        console.log("[notebook] Opening most recent workbook:", mostRecent.id);
        setActiveWorkbook(mostRecent.id, mostRecent.directory);
        openWorkbook.mutate(mostRecent, {
          onSettled: () => {
            initialized.current = true;
            initializingRef.current = false;
          }
        });
      } else {
        createWorkbook.mutate(
          { name: "My Workbook" },
          {
            onSuccess: (workbook) => {
              console.log("[notebook] Created new workbook:", workbook.id);
              setActiveWorkbook(workbook.id, workbook.directory);
              openWorkbook.mutate(workbook, {
                onSettled: () => {
                  initialized.current = true;
                  initializingRef.current = false;
                }
              });
            },
            onError: () => {
              initialized.current = true;
              initializingRef.current = false;
            }
          }
        );
      }
    }).catch((err) => {
      console.error("[notebook] Failed to check active runtime:", err);
      initialized.current = true;
      initializingRef.current = false;
    });
  }, [workbooks, workbooksLoading, setActiveWorkbook, createWorkbook, openWorkbook]);

  // Clear activeSessionId if it points to a deleted session
  useEffect(() => {
    if (sessionsLoading || !sessions) return;
    if (activeSessionId && !sessions.some(s => s.id === activeSessionId)) {
      setActiveSession(null);
    }
  }, [sessions, sessionsLoading, activeSessionId, setActiveSession]);

  return (
    <NotebookShell>
      <Outlet />
    </NotebookShell>
  );
}
