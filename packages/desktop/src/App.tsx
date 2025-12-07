import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSessions, useEventSubscription } from "@/hooks/useSession";
import { useWorkbooks, useCreateWorkbook } from "@/hooks/useWorkbook";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toolbar } from "@/components/Toolbar";
import { Thread } from "@/components/Thread";
import { SettingsPanel } from "@/components/SettingsPanel";
import { useUIStore } from "@/stores/ui";
import { useThemeStore } from "@/stores/theme";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      refetchOnWindowFocus: false,
    },
  },
});

function FloatingApp() {
  useEventSubscription();
  const [expanded, setExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [hasData] = useState(false); // TODO: Check if DB has tables

  const { activeSessionId, activeWorkbookId, setActiveSession, setActiveWorkbook } = useUIStore();
  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const { data: workbooks, isLoading: workbooksLoading } = useWorkbooks();
  const createWorkbook = useCreateWorkbook();

  // Auto-select or create a workbook on startup
  useEffect(() => {
    if (workbooksLoading || activeWorkbookId) return;

    if (workbooks && workbooks.length > 0) {
      // Select the most recently opened workbook
      const mostRecent = workbooks[0];
      setActiveWorkbook(mostRecent.id, mostRecent.directory);
    } else if (!createWorkbook.isPending) {
      // No workbooks exist, create a default one
      createWorkbook.mutate(
        { name: "Default Workbook", description: "Auto-created workspace" },
        {
          onSuccess: (workbook) => {
            setActiveWorkbook(workbook.id, workbook.directory);
          },
        }
      );
    }
  }, [workbooks, workbooksLoading, activeWorkbookId, setActiveWorkbook, createWorkbook]);

  // If sessions exist but none is active, select the first one
  useEffect(() => {
    if (sessionsLoading) return;
    if (sessions && sessions.length > 0 && !activeSessionId) {
      setActiveSession(sessions[0].id);
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
          onCollapse={() => setExpanded(false)}
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
