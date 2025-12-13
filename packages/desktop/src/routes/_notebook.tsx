import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { queryClient } from "@/App";
import { NotebookShell } from "@/components/Notebook/NotebookShell";
import type { NavSearchParams } from "@/hooks/useNavState";
import { useActiveSession } from "@/hooks/useNavState";
import { useSessions } from "@/hooks/useSession";
import {
  useCreateWorkbook,
  useOpenWorkbook,
  useWorkbooks,
} from "@/hooks/useWorkbook";
import { useRuntimeState, usePrefetchOnDbReady } from "@/hooks/useRuntimeState";
import { setNavigateCallback, startSSESync } from "@/lib/sse";

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
  const { workbookId, port } = useRuntimeState();
  const { sessionId: activeSessionId, setSession: setActiveSession } = useActiveSession();

  // Prefetch schema when DB becomes ready (workbook-aware, no stale ref)
  usePrefetchOnDbReady();

  // For backward compatibility in the effect below
  const activeRuntime = port ? { workbook_id: workbookId } : null;

  // Set up navigate callback for SSE - navigates to blocks by ID
  useEffect(() => {
    setNavigateCallback((blockId: string) => {
      const cleanBlockId = blockId.replace(/^\//, "");
      navigate({ to: "/blocks/$blockId", params: { blockId: cleanBlockId } });
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
        },
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
