/**
 * Page Source Cache
 *
 * Caches MDX source in localStorage for:
 * - Instant display on page load (before source fetch completes)
 * - Showing cached content (faded) while fresh source loads
 */

// ============================================================================
// Types
// ============================================================================

interface PageCacheEntry {
  source: string;
  timestamp: number;
}

// ============================================================================
// Constants
// ============================================================================

const PAGE_CACHE_PREFIX = "hands-page-cache:";
const PAGE_CACHE_TTL = 1000 * 60 * 60; // 1 hour

// ============================================================================
// Cache Key
// ============================================================================

function getCacheKey(pageId: string): string {
  return `${PAGE_CACHE_PREFIX}${pageId}`;
}

// ============================================================================
// Get Cached Source
// ============================================================================

export function getCachedPageSource(pageId: string): string | null {
  try {
    const raw = localStorage.getItem(getCacheKey(pageId));
    if (!raw) return null;

    const entry: PageCacheEntry = JSON.parse(raw);

    // Check TTL
    if (Date.now() - entry.timestamp > PAGE_CACHE_TTL) {
      localStorage.removeItem(getCacheKey(pageId));
      return null;
    }

    return entry.source;
  } catch {
    return null;
  }
}

// ============================================================================
// Set Cached Source
// ============================================================================

export function setCachedPageSource(pageId: string, source: string): void {
  try {
    const entry: PageCacheEntry = { source, timestamp: Date.now() };
    localStorage.setItem(getCacheKey(pageId), JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable, ignore
  }
}

// ============================================================================
// Invalidate Cache
// ============================================================================

export function invalidateCachedPageSource(pageId?: string): void {
  try {
    if (pageId) {
      localStorage.removeItem(getCacheKey(pageId));
    } else {
      // Clear all page cache entries
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(PAGE_CACHE_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    }
  } catch {
    // Ignore errors
  }
}
