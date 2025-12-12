/**
 * RSC Render Cache
 *
 * Caches rendered HTML in localStorage for:
 * - Instant display on page load (before RSC fetch completes)
 * - Showing cached content (faded) during mutations while new RSC loads
 */

// ============================================================================
// Types
// ============================================================================

interface RscCacheEntry {
  html: string
  timestamp: number
}

// ============================================================================
// Constants
// ============================================================================

const RSC_CACHE_PREFIX = 'hands-rsc-cache:'
const RSC_CACHE_TTL = 1000 * 60 * 60 // 1 hour

// ============================================================================
// Cache Key
// ============================================================================

function getCacheKey(blockId: string): string {
  return `${RSC_CACHE_PREFIX}${blockId}`
}

// ============================================================================
// Get Cached HTML
// ============================================================================

export function getCachedRscHtml(blockId: string): string | null {
  try {
    const raw = localStorage.getItem(getCacheKey(blockId))
    if (!raw) return null

    const entry: RscCacheEntry = JSON.parse(raw)

    // Check TTL
    if (Date.now() - entry.timestamp > RSC_CACHE_TTL) {
      localStorage.removeItem(getCacheKey(blockId))
      return null
    }

    return entry.html
  } catch {
    return null
  }
}

// ============================================================================
// Set Cached HTML
// ============================================================================

export function setCachedRscHtml(blockId: string, html: string): void {
  try {
    const entry: RscCacheEntry = { html, timestamp: Date.now() }
    localStorage.setItem(getCacheKey(blockId), JSON.stringify(entry))
  } catch {
    // localStorage full or unavailable, ignore
  }
}

// ============================================================================
// Invalidate Cache
// ============================================================================

export function invalidateCachedRscHtml(blockId?: string): void {
  try {
    if (blockId) {
      localStorage.removeItem(getCacheKey(blockId))
    } else {
      // Clear all RSC cache entries
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (key?.startsWith(RSC_CACHE_PREFIX)) {
          keysToRemove.push(key)
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key))
    }
  } catch {
    // Ignore errors
  }
}

// ============================================================================
// React Hook for Cache
// ============================================================================

import { useState, useCallback, useRef } from 'react'

interface UseRscCacheOptions {
  blockId: string
  containerRef: React.RefObject<HTMLElement | null>
}

interface UseRscCacheReturn {
  /** Cached HTML from localStorage (null if none) */
  cachedHtml: string | null
  /** Whether we have cached content to show during loading */
  hasCachedContent: boolean
  /** Update cache from current container content */
  updateCache: () => void
}

export function useRscCache({
  blockId,
  containerRef,
}: UseRscCacheOptions): UseRscCacheReturn {
  const [cachedHtml, setCachedHtml] = useState<string | null>(() =>
    getCachedRscHtml(blockId)
  )

  // Update cache from container
  const updateCache = useCallback(() => {
    if (!containerRef.current) return

    const html = containerRef.current.innerHTML
    if (html) {
      setCachedHtml(html)
      setCachedRscHtml(blockId, html)
    }
  }, [blockId, containerRef])

  return {
    cachedHtml,
    hasCachedContent: cachedHtml !== null,
    updateCache,
  }
}

