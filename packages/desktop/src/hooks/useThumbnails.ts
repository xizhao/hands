/**
 * useThumbnail - tRPC hook for fetching page/block thumbnails
 *
 * Thumbnails are stored in the runtime's hands_admin.thumbnails table,
 * captured from iframe renders. Returns theme-appropriate thumbnail.
 */

import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";

// ============================================================================
// Types
// ============================================================================

export interface Thumbnail {
  id: string;
  type: "page" | "block";
  contentId: string;
  theme: "light" | "dark";
  thumbnail: string; // base64 PNG (800x600)
  lqip: string; // base64 PNG (20x15, blurred)
  contentHash?: string;
  createdAt: string;
}

export interface ThumbnailResult {
  light?: Thumbnail;
  dark?: Thumbnail;
}

// ============================================================================
// Theme Detection
// ============================================================================

/**
 * Hook to track current theme (light/dark) from document.documentElement
 */
function useCurrentTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof document === "undefined") return "dark";
    return document.documentElement.classList.contains("dark") ? "dark" : "light";
  });

  useEffect(() => {
    // Watch for theme changes via class mutations on <html>
    const observer = new MutationObserver(() => {
      const isDark = document.documentElement.classList.contains("dark");
      setTheme(isDark ? "dark" : "light");
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, []);

  return theme;
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Fetch thumbnail for a page or block
 *
 * Returns the theme-appropriate thumbnail (light or dark) based on current theme.
 * Uses staleTime: Infinity since we invalidate on save.
 */
export function useThumbnail(type: "page" | "block", contentId: string | undefined) {
  const theme = useCurrentTheme();

  const query = trpc.thumbnails.get.useQuery(
    { type, contentId: contentId! },
    {
      enabled: !!contentId,
      staleTime: Infinity, // Don't refetch - we invalidate on save
      gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes
    },
  );

  // Return theme-specific thumbnail, fallback to other theme if not available
  const thumbnail = query.data
    ? query.data[theme] ?? query.data[theme === "dark" ? "light" : "dark"] ?? null
    : null;

  return {
    ...query,
    data: thumbnail,
  };
}

/**
 * Fetch both light and dark thumbnails for a content item
 *
 * Useful when you need to show both variants (e.g., in settings preview).
 */
export function useThumbnails(type: "page" | "block", contentId: string | undefined) {
  return trpc.thumbnails.get.useQuery(
    { type, contentId: contentId! },
    {
      enabled: !!contentId,
      staleTime: Infinity,
      gcTime: 1000 * 60 * 30,
    },
  );
}

/**
 * Hook to invalidate thumbnails after content save
 *
 * Call this after saving page/block content to trigger re-capture.
 */
export function useInvalidateThumbnails() {
  const utils = trpc.useUtils();

  return {
    /**
     * Invalidate thumbnails for a specific content item
     */
    invalidate: (type: "page" | "block", contentId: string) => {
      utils.thumbnails.get.invalidate({ type, contentId });
    },

    /**
     * Invalidate all thumbnails (e.g., after theme change causes re-render)
     */
    invalidateAll: () => {
      utils.thumbnails.get.invalidate();
    },
  };
}

/**
 * Prefetch thumbnail for faster hover previews
 *
 * Call this when hovering near an item to preload the thumbnail.
 */
export function usePrefetchThumbnail() {
  const utils = trpc.useUtils();

  return (type: "page" | "block", contentId: string) => {
    if (!contentId) return;

    utils.thumbnails.get.prefetch(
      { type, contentId },
      { staleTime: Infinity },
    );
  };
}
