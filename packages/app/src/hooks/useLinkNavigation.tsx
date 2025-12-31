/**
 * Link Navigation Hook
 *
 * Provides context-aware link handling:
 * - In workbook browser: uses TanStack Router directly
 * - In floating chat: routes through Tauri to open/focus workbook window
 */

import { useNavigate } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { createContext, type ReactNode, useCallback, useContext, useEffect } from "react";

interface LinkNavigationContextValue {
  /** Whether we're in floating chat mode (vs workbook browser) */
  isFloatingChat: boolean;
  /** Current workbook ID */
  workbookId: string | null;
  /** Navigate to an internal route */
  navigateTo: (route: string) => void;
  /** Handle a link click - returns true if handled internally */
  handleLinkClick: (href: string, event?: React.MouseEvent) => boolean;
}

const LinkNavigationContext = createContext<LinkNavigationContextValue | null>(null);

interface LinkNavigationProviderProps {
  children: ReactNode;
  /** Whether this is the floating chat context */
  isFloatingChat?: boolean;
  /** Workbook ID for the current context */
  workbookId?: string | null;
}

/**
 * Provider for link navigation context.
 *
 * In workbook browser: listens for "navigate" events from Tauri
 * In floating chat: routes through Tauri to workbook windows
 */
export function LinkNavigationProvider({
  children,
  isFloatingChat = false,
  workbookId = null,
}: LinkNavigationProviderProps) {
  const navigate = useNavigate();

  // Listen for navigation events from Tauri (workbook windows only)
  useEffect(() => {
    if (isFloatingChat) return;

    const unlisten = listen<string>("navigate", (event) => {
      const route = event.payload;
      console.log("[LinkNavigation] Received navigate event:", route);
      if (route.startsWith("/")) {
        navigate({ to: route });
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [isFloatingChat, navigate]);

  const navigateTo = useCallback(
    async (route: string) => {
      if (isFloatingChat) {
        // In floating chat: route through Tauri to open/focus workbook
        if (workbookId) {
          try {
            await invoke("navigate_in_workbook", {
              workbookId,
              route,
            });
          } catch (err) {
            console.error("[LinkNavigation] Failed to navigate:", err);
          }
        }
      } else {
        // In workbook browser: use router directly
        navigate({ to: route });
      }
    },
    [isFloatingChat, workbookId, navigate],
  );

  const handleLinkClick = useCallback(
    (href: string, event?: React.MouseEvent): boolean => {
      // External links - open in browser
      if (href.startsWith("http://") || href.startsWith("https://")) {
        // Let default behavior handle it (opens in browser)
        return false;
      }

      // Internal routes (start with /)
      if (href.startsWith("/")) {
        event?.preventDefault();
        navigateTo(href);
        return true;
      }

      // Relative routes - prefix with /
      if (!href.includes("://")) {
        event?.preventDefault();
        navigateTo(`/${href}`);
        return true;
      }

      return false;
    },
    [navigateTo],
  );

  return (
    <LinkNavigationContext.Provider
      value={{
        isFloatingChat,
        workbookId,
        navigateTo,
        handleLinkClick,
      }}
    >
      {children}
    </LinkNavigationContext.Provider>
  );
}

/**
 * Hook to access link navigation context.
 * Returns null if used outside of provider.
 */
export function useLinkNavigation(): LinkNavigationContextValue | null {
  return useContext(LinkNavigationContext);
}

/**
 * Hook that requires link navigation context.
 * Throws if used outside of provider.
 */
export function useLinkNavigationRequired(): LinkNavigationContextValue {
  const context = useContext(LinkNavigationContext);
  if (!context) {
    throw new Error("useLinkNavigationRequired must be used within LinkNavigationProvider");
  }
  return context;
}

interface LinkClickHandlerProps {
  children: ReactNode;
  className?: string;
}

/**
 * Wrapper component that intercepts link clicks and routes them appropriately.
 * Uses event delegation to catch all <a> tag clicks within.
 */
export function LinkClickHandler({ children, className }: LinkClickHandlerProps) {
  const context = useLinkNavigation();

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      // Find if click was on an anchor element
      const target = event.target as HTMLElement;
      const anchor = target.closest("a");

      if (!anchor) return;

      const href = anchor.getAttribute("href");
      if (!href) return;

      // Use context if available, otherwise handle inline
      if (context) {
        const handled = context.handleLinkClick(href, event);
        if (handled) return;
      }

      // Default behavior for internal links without context
      if (href.startsWith("/") || (!href.includes("://") && !href.startsWith("#"))) {
        // Internal link - let it fall through to router if no context
        return;
      }

      // External links - open in new tab
      if (href.startsWith("http://") || href.startsWith("https://")) {
        event.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
      }
    },
    [context],
  );

  return (
    <div onClick={handleClick} className={className}>
      {children}
    </div>
  );
}
