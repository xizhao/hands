import { createRootRoute, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { initTheme } from "@/lib/theme";

export const rootRoute = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
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

  return <Outlet />;
}
