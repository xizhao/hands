import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useThemeStore } from "@/stores/theme";

export const rootRoute = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
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

  return <Outlet />;
}
