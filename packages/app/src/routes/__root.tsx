import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SettingsModal } from "@/components/SettingsModal";
import { useAppHotkeys, useHotkeys } from "@/hooks/useHotkeys";
import { LinkNavigationProvider } from "@/hooks/useLinkNavigation";
import { useActiveRuntime } from "@/hooks/useWorkbook";
import { initTheme } from "@/lib/theme";
import { usePlatform } from "@/platform";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const platform = usePlatform();
  const { data: runtime } = useActiveRuntime();
  const workbookId = runtime?.workbook_id ?? null;

  // Global hotkeys (Cmd+W to close page, etc.)
  useAppHotkeys();

  // Initialize theme on mount
  useEffect(() => {
    initTheme();
  }, []);

  // Disable right-click context menu (desktop only)
  useEffect(() => {
    if (platform.platform !== "desktop") return;

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener("contextmenu", handleContextMenu);
    return () => document.removeEventListener("contextmenu", handleContextMenu);
  }, [platform.platform]);

  // Cmd+, to open settings (using hotkey system)
  useHotkeys([
    {
      key: ",",
      meta: true,
      handler: () => {
        setSettingsOpen(true);
        return true;
      },
      description: "Open settings",
    },
  ]);

  return (
    <LinkNavigationProvider isFloatingChat={false} workbookId={workbookId}>
      <Outlet />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </LinkNavigationProvider>
  );
}
