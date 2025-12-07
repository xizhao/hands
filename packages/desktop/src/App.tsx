import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSessions, useCreateSession, useEventSubscription } from "@/hooks/useSession";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toolbar } from "@/components/Toolbar";
import { SlidePanel } from "@/components/SlidePanel";
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
  const [hasData] = useState(false); // TODO: Check if DB has tables

  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const createSession = useCreateSession();
  const { activeSessionId, activeWorkbookId, setActiveSession, setActiveWorkbook } = useUIStore();

  // Auto-create workbook and session on first launch
  useEffect(() => {
    if (sessionsLoading || createSession.isPending) return;

    // Create a default workbook if none exists
    // TODO: This should actually create a workbook via Tauri command
    if (!activeWorkbookId) {
      // For now, we'll work without a workbook selected
      // The session will be created in the default context
    }

    // If no sessions exist, create one
    if (sessions && sessions.length === 0) {
      createSession.mutate(undefined, {
        onSuccess: (newSession) => {
          setActiveSession(newSession.id);
        },
      });
      return;
    }

    // If sessions exist but none is active, select the first one
    if (sessions && sessions.length > 0 && !activeSessionId) {
      setActiveSession(sessions[0].id);
    }
  }, [sessions, sessionsLoading, activeSessionId, activeWorkbookId, createSession, setActiveSession, setActiveWorkbook]);

  return (
    <div className="h-screen flex flex-col">
      <Toolbar
        expanded={expanded}
        onExpandChange={setExpanded}
        hasData={hasData}
      />
      <SlidePanel
        expanded={expanded}
        hasData={hasData}
        onCollapse={() => setExpanded(false)}
        onExpand={() => setExpanded(true)}
      />
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
