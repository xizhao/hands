import { queryClient } from "@/App";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { NotebookShell } from "@/components/workbook/NotebookShell";
import { useNeedsTrafficLightOffset } from "@/hooks/useFullscreen";
import type { NavSearchParams } from "@/hooks/useNavState";
import { useActiveSession, useClearNavigation } from "@/hooks/useNavState";
import { useRuntimeProcess } from "@/hooks/useRuntimeState";
import { useSessions } from "@/hooks/useSession";
import {
  useCreateWorkbook,
  useOpenWorkbook,
  useWorkbooks,
} from "@/hooks/useWorkbook";
import { setNavigateCallback, startSSESync } from "@/lib/sse";
import { cn } from "@/lib/utils";
import type { Workbook } from "@/lib/workbook";
import { CaretDown, Check, Plus } from "@phosphor-icons/react";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef } from "react";

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
  // Use minimal Tauri-only hook (works without TRPCProvider)
  const { workbookId, port } = useRuntimeProcess();
  const { sessionId: activeSessionId, setSession: setActiveSession } =
    useActiveSession();

  // Set up navigate callback for SSE - routes to correct page based on path
  useEffect(() => {
    setNavigateCallback((path: string) => {
      const cleanPath = path.replace(/^\//, "");
      const [routeType, id] = cleanPath.split("/");

      if (!id) {
        console.warn("[navigate] Invalid path, missing id:", path);
        return;
      }

      // Route to the correct page based on route type
      switch (routeType) {
        case "pages":
          navigate({ to: "/pages/$pageId", params: { pageId: id } });
          break;
        case "blocks":
          navigate({ to: "/blocks/$blockId", params: { blockId: id } });
          break;
        case "tables":
          navigate({ to: "/tables/$tableId", params: { tableId: id } });
          break;
        case "actions":
          navigate({ to: "/actions/$actionId", params: { actionId: id } });
          break;
        default:
          console.warn(
            "[navigate] Unknown route type:",
            routeType,
            "from path:",
            path
          );
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
      console.log("[notebook] Workbook already selected:", workbookId);
      initialized.current = true;
      return;
    }

    initializingRef.current = true;
    console.log("[notebook] No workbook selected, opening one...");

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
  }, [workbooks, workbooksLoading, workbookId, createWorkbook, openWorkbook]);

  // Clear activeSessionId if it points to a deleted session
  useEffect(() => {
    if (sessionsLoading || !sessions) return;
    if (activeSessionId && !sessions.some((s) => s.id === activeSessionId)) {
      setActiveSession(null);
    }
  }, [sessions, sessionsLoading, activeSessionId, setActiveSession]);

  // Current workbook from Tauri data (available without runtime)
  // If no workbookId yet (runtime starting), show the most recent workbook (which will be opened)
  const currentWorkbook = workbookId
    ? workbooks?.find((w) => w.id === workbookId)
    : workbooks?.[0];
  const needsTrafficLightOffset = useNeedsTrafficLightOffset();
  const clearNavigation = useClearNavigation();

  // Handle workbook switch - works without runtime
  const handleSwitchWorkbook = useCallback(
    (workbook: Workbook) => {
      clearNavigation();
      openWorkbook.mutate(workbook);
    },
    [clearNavigation, openWorkbook]
  );

  // When no port, show minimal shell - just header with workbook switcher
  // No ChatBar/Thread here - those need runtime to be useful
  if (!port) {
    return (
      <div className="h-screen flex flex-col bg-background">
        <header
          data-tauri-drag-region
          className={cn(
            "h-11 flex items-center pr-4 border-b border-border/50 bg-background shrink-0",
            needsTrafficLightOffset ? "pl-[80px]" : "pl-4"
          )}
        >
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
            <span className="text-sm font-medium">
              {currentWorkbook?.name ?? "Untitled"}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center justify-center w-5 h-5 rounded-sm text-muted-foreground/70 hover:text-muted-foreground hover:bg-accent/50">
                <CaretDown weight="bold" className="h-3 w-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[200px]">
                {workbooks?.map((wb) => (
                  <DropdownMenuItem
                    key={wb.id}
                    onClick={() => handleSwitchWorkbook(wb)}
                    className="flex items-center justify-between"
                  >
                    <span className="truncate text-[13px]">{wb.name}</span>
                    {wb.id === workbookId && (
                      <Check
                        weight="bold"
                        className="h-3.5 w-3.5 text-primary shrink-0"
                      />
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    createWorkbook.mutate({ name: "New Notebook" })
                  }
                >
                  <Plus weight="bold" className="h-3.5 w-3.5 mr-2" />
                  <span className="text-[13px]">New Notebook</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <div className="flex-1" />
      </div>
    );
  }

  return (
    <NotebookShell>
      <Outlet />
    </NotebookShell>
  );
}
