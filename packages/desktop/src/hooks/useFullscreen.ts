import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";

// Check platform synchronously via navigator
const isMac = navigator.platform.toLowerCase().includes("mac");

/**
 * Hook to detect if we need the macOS traffic light offset.
 * Returns true only on macOS when NOT in fullscreen mode.
 */
export function useNeedsTrafficLightOffset() {
  // Start with offset on mac (most common case), no offset on other platforms
  const [needsOffset, setNeedsOffset] = useState(isMac);

  useEffect(() => {
    if (!isMac) return;

    const window = getCurrentWindow();

    // Check initial fullscreen state
    window.isFullscreen().then((fs) => setNeedsOffset(!fs));

    // Listen for fullscreen changes
    const unlisten = window.onResized(async () => {
      const fullscreen = await window.isFullscreen();
      setNeedsOffset(!fullscreen);
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  return needsOffset;
}
