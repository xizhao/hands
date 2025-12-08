import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useWorkbooks, useCreateWorkbook, useOpenWorkbook } from "@/hooks/useWorkbook";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toolbar } from "@/components/Toolbar";
import { Thread } from "@/components/Thread";
import { SettingsPanel } from "@/components/SettingsPanel";
import { useUIStore } from "@/stores/ui";
import { useThemeStore } from "@/stores/theme";
import { startSync } from "@/store";
import { useSessions } from "@/store/hooks";

// React Query client - only used for workbook hooks now
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: false,
    },
  },
});

function FloatingApp() {
  // Start TanStack DB sync on mount
  useEffect(() => {
    const cleanup = startSync();
    return cleanup;
  }, []);

  const [expanded, setExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [hasData] = useState(false); // TODO: Check if DB has tables

  const { activeSessionId, activeWorkbookId, setActiveSession, setActiveWorkbook } = useUIStore();
  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const { data: workbooks, isLoading: workbooksLoading } = useWorkbooks();
  const createWorkbook = useCreateWorkbook();
  const openWorkbook = useOpenWorkbook();

  // Auto-select or create a workbook on startup
  useEffect(() => {
    // Wait for workbooks query to complete
    if (workbooksLoading || workbooks === undefined) return;
    // Skip if already have an active workbook
    if (activeWorkbookId) return;
    // Skip if mutation is in progress
    if (createWorkbook.isPending || openWorkbook.isPending) return;

    if (workbooks.length > 0) {
      // Open the most recently used workbook (starts runtime)
      const mostRecent = workbooks[0];
      setActiveWorkbook(mostRecent.id, mostRecent.directory);
      openWorkbook.mutate(mostRecent);
    } else {
      // No workbooks exist, create a default one
      createWorkbook.mutate(
        { name: "My Workbook" },
        {
          onSuccess: (workbook) => {
            setActiveWorkbook(workbook.id, workbook.directory);
            openWorkbook.mutate(workbook);
          },
        }
      );
    }
  }, [workbooks, workbooksLoading, activeWorkbookId, setActiveWorkbook, createWorkbook, openWorkbook]);

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
