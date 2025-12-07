import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSessions, useCreateSession, useEventSubscription } from "@/hooks/useSession";
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

  const { data: sessions, isLoading: sessionsLoading } = useSessions();
  const createSession = useCreateSession();
  const { activeSessionId, activeWorkbookId, setActiveSession, setActiveWorkbook } = useUIStore();

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
