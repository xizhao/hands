/**
 * Global Hotkey System
 *
 * Centralized hotkey handling for the desktop app.
 * Captures keyboard shortcuts before they reach native handlers.
 */

import { useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useCallback } from "react";

export interface HotkeyDefinition {
  /** Key to match (e.g., "w", "t", ",") */
  key: string;
  /** Require Cmd (Mac) or Ctrl (Windows/Linux) */
  meta?: boolean;
  /** Require Shift */
  shift?: boolean;
  /** Require Alt/Option */
  alt?: boolean;
  /** Handler function - return true to prevent default */
  handler: (e: KeyboardEvent) => boolean | void;
  /** Description for help/docs */
  description?: string;
  /** Whether this hotkey is enabled */
  enabled?: boolean;
}

/**
 * Check if the current platform is Mac
 */
const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().includes("MAC");

/**
 * Check if a keyboard event matches a hotkey definition
 */
function matchesHotkey(e: KeyboardEvent, hotkey: HotkeyDefinition): boolean {
  // Check modifier keys
  const metaMatch = hotkey.meta ? (isMac ? e.metaKey : e.ctrlKey) : true;
  const shiftMatch = hotkey.shift ? e.shiftKey : !e.shiftKey;
  const altMatch = hotkey.alt ? e.altKey : !e.altKey;

  // Check main key (case-insensitive)
  const keyMatch = e.key.toLowerCase() === hotkey.key.toLowerCase();

  return metaMatch && shiftMatch && altMatch && keyMatch;
}

/**
 * Hook to register global hotkeys
 *
 * @param hotkeys - Array of hotkey definitions
 */
export function useHotkeys(hotkeys: HotkeyDefinition[]) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if focus is in an input/textarea (unless it's a global shortcut)
      const target = e.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      for (const hotkey of hotkeys) {
        if (hotkey.enabled === false) continue;
        if (!matchesHotkey(e, hotkey)) continue;

        // For non-meta hotkeys, skip if in input
        if (!hotkey.meta && isInput) continue;

        const result = hotkey.handler(e);
        if (result !== false) {
          e.preventDefault();
          e.stopPropagation();
        }
        break;
      }
    };

    // Capture phase to intercept before native handlers
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [hotkeys]);
}

/**
 * Hook for common app-wide hotkeys
 *
 * Includes:
 * - Cmd+W: Close current page (navigate up one segment)
 * - More can be added here
 */
export function useAppHotkeys() {
  const navigate = useNavigate();
  const location = useLocation();

  const closeCurrentPage = useCallback(() => {
    const path = location.pathname;

    // Don't do anything on root
    if (path === "/" || path === "") {
      return false; // Don't prevent default - let it do nothing
    }

    // Navigate up one segment
    const segments = path.split("/").filter(Boolean);
    if (segments.length > 0) {
      segments.pop();
      const newPath = segments.length > 0 ? `/${segments.join("/")}` : "/";
      navigate({ to: newPath });
      return true; // Prevent default (don't close window)
    }

    return false;
  }, [location.pathname, navigate]);

  const hotkeys: HotkeyDefinition[] = [
    {
      key: "w",
      meta: true,
      handler: () => closeCurrentPage(),
      description: "Close current page",
    },
  ];

  useHotkeys(hotkeys);
}
