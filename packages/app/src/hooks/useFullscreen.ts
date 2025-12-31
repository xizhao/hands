/**
 * Fullscreen Hook
 *
 * Provides fullscreen detection for macOS traffic light offset.
 * Uses the platform adapter for cross-platform compatibility.
 */

import { useEffect, useState } from "react";
import { useIsDesktop, usePlatform } from "../platform";

// Check platform synchronously via navigator (fallback for SSR)
const isMac = typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac");

/**
 * Hook to detect if we need the macOS traffic light offset.
 * Returns true only on macOS desktop when NOT in fullscreen mode.
 */
export function useNeedsTrafficLightOffset() {
  const platform = usePlatform();
  const isDesktop = useIsDesktop();

  // Start with offset on mac desktop (most common case), no offset on other platforms
  const [needsOffset, setNeedsOffset] = useState(isMac && isDesktop);

  useEffect(() => {
    // Only check on mac desktop with window APIs
    if (!isMac || !isDesktop || !platform.window?.isFullscreen) {
      setNeedsOffset(false);
      return;
    }

    // Check initial fullscreen state
    platform.window.isFullscreen().then((fs) => setNeedsOffset(!fs));

    // Listen for fullscreen changes via window events
    if (platform.windowEvents?.onResize) {
      return platform.windowEvents.onResize(async () => {
        if (platform.window?.isFullscreen) {
          const fullscreen = await platform.window.isFullscreen();
          setNeedsOffset(!fullscreen);
        }
      });
    }
  }, [isDesktop, platform.window, platform.windowEvents]);

  return needsOffset;
}
