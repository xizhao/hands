import { createRootRoute, Outlet } from "@tanstack/react-router";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { SettingsModal } from "@/components/SettingsModal";
import { useAppHotkeys, useHotkeys } from "@/hooks/useHotkeys";
import { initTheme } from "@/lib/theme";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Global hotkeys (Cmd+W to close page, etc.)
  useAppHotkeys();

  // Initialize theme on mount
  useEffect(() => {
    initTheme();
  }, []);

  // Disable right-click context menu
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
    };
    document.addEventListener("contextmenu", handleContextMenu);
    return () => document.removeEventListener("contextmenu", handleContextMenu);
  }, []);

  // Listen for menu event from Tauri (Hands > Settings)
  useEffect(() => {
    const unlisten = listen("open-settings", () => {
      setSettingsOpen(true);
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

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
    <>
      <Outlet />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
