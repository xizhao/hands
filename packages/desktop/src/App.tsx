import { useEffect, useState, useRef, useCallback } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { useWorkbooks, useCreateWorkbook, useOpenWorkbook, RuntimeStatus } from "@/hooks/useWorkbook";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toolbar } from "@/components/Toolbar";
import { Thread } from "@/components/Thread";
import { SettingsPanel } from "@/components/SettingsPanel";
import { useUIStore } from "@/stores/ui";
import { useThemeStore } from "@/stores/theme";
import { startSSESync } from "@/lib/sse";
import { useSessions } from "@/hooks/useSession";
import { useDbSync } from "@/store/db-hooks";
import type { ChangeRecord } from "@/store/db-hooks";


// Export queryClient so SSE handler can access it
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: false,
    },
  },
});

function FloatingApp() {
  // Start SSE sync on mount
  useEffect(() => {
    const cleanup = startSSESync(queryClient);
    return cleanup;
  }, []);

  // Track if DB browser has been opened for this session (to avoid re-opening constantly)
  const dbBrowserOpenedRef = useRef(false);

  // Handle new database changes - auto-open DB browser on first change
  const handleDbChange = useCallback((change: ChangeRecord) => {
    // Only auto-open once per session to avoid being annoying
    if (dbBrowserOpenedRef.current) return;

    const runtimePort = useUIStore.getState().runtimePort;
    const workbookId = useUIStore.getState().activeWorkbookId;

    if (runtimePort && workbookId) {
      console.log("[app] Auto-opening DB browser for change:", change.op, change.table);
      dbBrowserOpenedRef.current = true;
      invoke("open_db_browser", { runtimePort, workbookId }).catch((err) => {
        console.error("[app] Failed to auto-open DB browser:", err);
        dbBrowserOpenedRef.current = false; // Reset so we can try again
      });
    }
  }, []);

  // Start database change SSE subscription (uses runtimePort from UIStore)
  useDbSync(handleDbChange);

  const [expanded, setExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [hasData] = useState(false); // TODO: Check if DB has tables

  const { activeSessionId, activeWorkbookId, setActiveSession, setActiveWorkbook } = useUIStore();
  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const { data: workbooks, isLoading: workbooksLoading } = useWorkbooks();
  const createWorkbook = useCreateWorkbook();
  const openWorkbook = useOpenWorkbook();

  // Track if we've initialized this session (persists across hot reloads)
  const initialized = useRef(false);
  const initializingRef = useRef(false);

  // On startup: check Tauri for active runtime, or start one
  useEffect(() => {
    // Prevent multiple concurrent initializations
    if (initialized.current || initializingRef.current) return;
    if (workbooksLoading || workbooks === undefined) return;
    if (createWorkbook.isPending || openWorkbook.isPending) return;

    initializingRef.current = true;

    // Check if Tauri already has an active runtime
    invoke<RuntimeStatus | null>("get_active_runtime").then((active) => {
      if (active) {
        console.log("[app] Tauri has active runtime:", active.workbook_id, "ports:", active.runtime_port, active.postgres_port, active.worker_port);
        setActiveWorkbook(active.workbook_id, active.directory);
        initialized.current = true;
        initializingRef.current = false;
        return;
      }

      // No active runtime - start one
      console.log("[app] No active runtime, starting one...");

      if (workbooks.length > 0) {
        const mostRecent = workbooks[0];
        console.log("[app] Opening most recent workbook:", mostRecent.id);
        setActiveWorkbook(mostRecent.id, mostRecent.directory);
        openWorkbook.mutate(mostRecent, {
          onSettled: () => {
            initialized.current = true;
            initializingRef.current = false;
          }
        });
      } else {
        // No workbooks exist, create a default one
        createWorkbook.mutate(
          { name: "My Workbook" },
          {
            onSuccess: (workbook) => {
              console.log("[app] Created new workbook:", workbook.id);
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
      console.error("[app] Failed to check active runtime:", err);
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
    <div className="h-screen flex flex-col">
      <Toolbar
        expanded={expanded}
        onExpandChange={setExpanded}
        hasData={hasData}
        onOpenSettings={() => { setShowSettings(true); setExpanded(true); }}
      />
      {showSettings ? (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      ) : (
        <Thread
          expanded={expanded}
          hasData={hasData}
          onCollapse={() => { setExpanded(false); setActiveSession(null); }}
          onExpand={() => setExpanded(true)}
        />
      )}
    </div>
  );
}

export default function App() {
  const { initTheme } = useThemeStore();

  // Initialize theme on mount
  useEffect(() => {
    initTheme();
  }, [initTheme]);

  // Disable right-click context menu
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener("contextmenu", handleContextMenu);
    return () => document.removeEventListener("contextmenu", handleContextMenu);
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <FloatingApp />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
