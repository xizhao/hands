/**
 * RSC Render Cache & Transitions
 *
 * Caches rendered HTML in localStorage for:
 * - Instant display on page load (before RSC fetch completes)
 * - Smooth transitions during mutations (show cached, fade while loading)
 *
 * Also provides FLIP animations for surgical element transitions
 * when elements move/reorder during mutations.
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

// ============================================================================
// View Transition for RSC Updates
// ============================================================================

/**
 * Check if View Transitions API is available
 */
export function supportsViewTransitions(): boolean {
  return 'startViewTransition' in document
}

/**
 * Perform a view transition for RSC content updates.
 * Falls back to instant swap if View Transitions not supported.
 */
export async function performViewTransition(
  updateCallback: () => void | Promise<void>
): Promise<void> {
  if (!supportsViewTransitions()) {
    await updateCallback()
    return
  }

  // @ts-ignore - View Transitions API
  const transition = document.startViewTransition(async () => {
    await updateCallback()
  })

  await transition.finished
}

// ============================================================================
// Simple Crossfade Transition Hook
// ============================================================================

interface UseContentTransitionOptions {
  containerRef: React.RefObject<HTMLElement | null>
  duration?: number
}

interface UseContentTransitionReturn {
  /** Whether a transition is in progress */
  isTransitioning: boolean
  /** Start transition - call before content changes */
  startTransition: () => void
  /** End transition - call after new content renders */
  endTransition: () => void
}

export function useContentTransition({
  containerRef,
  duration = 150,
}: UseContentTransitionOptions): UseContentTransitionReturn {
  const [isTransitioning, setIsTransitioning] = useState(false)
  const snapshotRef = useRef<string | null>(null)
  const ghostRef = useRef<HTMLDivElement | null>(null)

  const startTransition = useCallback(() => {
    if (!containerRef.current) return

    // Capture current HTML
    snapshotRef.current = containerRef.current.innerHTML

    // Create ghost layer with snapshot
    const ghost = document.createElement('div')
    ghost.className = 'transition-ghost'
    ghost.style.cssText = `
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 100;
      opacity: 1;
      transition: opacity ${duration}ms ease-out;
    `
    ghost.innerHTML = snapshotRef.current

    // Insert ghost before container content
    containerRef.current.style.position = 'relative'
    containerRef.current.insertBefore(ghost, containerRef.current.firstChild)
    ghostRef.current = ghost

    setIsTransitioning(true)
  }, [containerRef, duration])

  const endTransition = useCallback(() => {
    if (!ghostRef.current) return

    // Fade out ghost
    ghostRef.current.style.opacity = '0'

    // Remove ghost after fade
    const ghost = ghostRef.current
    setTimeout(() => {
      ghost.remove()
      ghostRef.current = null
      snapshotRef.current = null
      setIsTransitioning(false)
    }, duration)
  }, [duration])

  return {
    isTransitioning,
    startTransition,
    endTransition,
  }
}
