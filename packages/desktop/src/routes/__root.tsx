import { createRootRoute, Outlet } from "@tanstack/react-router";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { SettingsModal } from "@/components/SettingsModal";
import { initTheme } from "@/lib/theme";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  // Cmd+, to open settings (fallback for keyboard shortcut)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === ",") {
        e.preventDefault();
        setSettingsOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <Outlet />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </>
  );
}
