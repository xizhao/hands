import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

/**
 * Hook to detect if the window is in fullscreen mode.
 * On macOS, traffic lights are hidden in fullscreen, so we can skip the titlebar offset.
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const window = getCurrentWindow();

    // Check initial state
    window.isFullscreen().then(setIsFullscreen);

    // Listen for fullscreen changes
    const unlisten = window.onResized(async () => {
      const fullscreen = await window.isFullscreen();
      setIsFullscreen(fullscreen);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return isFullscreen;
}
