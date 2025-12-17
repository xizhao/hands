/**
 * useStableIframe - Keeps iframe elements alive across React remounts
 *
 * Problem: When Plate re-renders the document tree, React destroys and
 * recreates iframe elements, causing them to reload.
 *
 * Solution: Store iframe DOM nodes in a global cache keyed by src.
 * When component mounts, reuse existing iframe if available.
 * When component unmounts, keep iframe in cache (hidden) for potential reuse.
 */

import { useEffect, useRef, useCallback } from 'react';
import { getThemeVariables } from './SandboxedBlock';

// Global cache of iframe elements by src
const iframeCache = new Map<string, {
  iframe: HTMLIFrameElement;
  ready: boolean;
  height: number;
  /** Currently mounted container (null if hidden/unmounted) */
  activeContainer: HTMLDivElement | null;
}>();

// Debug helper - call from browser console: window.__debugIframeCache()
if (typeof window !== 'undefined') {
  (window as any).__debugIframeCache = () => {
    console.log('=== Iframe Cache Debug ===');
    console.log('Cache size:', iframeCache.size);
    for (const [src, cached] of iframeCache) {
      console.log(`  ${src}:`, {
        ready: cached.ready,
        height: cached.height,
        hasActiveContainer: !!cached.activeContainer,
        iframeInDOM: cached.iframe.isConnected,
        iframeParent: cached.iframe.parentElement?.tagName,
      });
    }
    console.log('All iframes in document:', document.querySelectorAll('iframe').length);
    document.querySelectorAll('iframe').forEach((iframe, i) => {
      console.log(`  iframe[${i}]:`, iframe.src, iframe.parentElement?.className);
    });
  };
}

// Callbacks registered for each iframe
const callbackRegistry = new Map<string, {
  onReady: (height: number) => void;
  onResize: (height: number) => void;
  onError: (error: string) => void;
}>();

// Global message listener (only one needed)
let listenerAttached = false;

function attachGlobalListener() {
  if (listenerAttached) return;
  listenerAttached = true;

  window.addEventListener('message', (e) => {
    // Find which iframe sent this message
    for (const [src, cached] of iframeCache) {
      if (e.source === cached.iframe.contentWindow) {
        const callbacks = callbackRegistry.get(src);
        if (!callbacks) return;

        if (e.data?.type === 'sandbox-ready') {
          cached.ready = true;
          // Send theme
          const css = getThemeVariables();
          const isDark = document.documentElement.classList.contains('dark');
          cached.iframe.contentWindow?.postMessage({ type: 'theme', css, isDark }, '*');

          const h = typeof e.data.height === 'number' && e.data.height > 0 ? e.data.height : 100;
          cached.height = h;
          callbacks.onReady(h);
        }

        if (e.data?.type === 'sandbox-resize') {
          if (typeof e.data.height === 'number' && e.data.height > 0) {
            cached.height = e.data.height;
            callbacks.onResize(e.data.height);
          }
        }

        if (e.data?.type === 'sandbox-error') {
          callbacks.onError(e.data.error?.message || 'Unknown error');
        }

        break;
      }
    }
  });
}

interface UseStableIframeOptions {
  src: string;
  previewUrl: string;
  onReady: (height: number) => void;
  onResize: (height: number) => void;
  onError: (error: string) => void;
}

interface UseStableIframeResult {
  containerRef: React.RefObject<HTMLDivElement | null>;
  isReady: boolean;
  height: number;
  sendGrabMessage: (type: 'grab-activate' | 'grab-deactivate') => void;
  /** Force reload the iframe (clears cache and recreates) */
  reload: () => void;
}

export function useStableIframe({
  src,
  previewUrl,
  onReady,
  onResize,
  onError,
}: UseStableIframeOptions): UseStableIframeResult {
  const containerRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  // Attach global listener
  useEffect(() => {
    attachGlobalListener();
  }, []);

  // Register callbacks
  useEffect(() => {
    callbackRegistry.set(src, { onReady, onResize, onError });
    return () => {
      callbackRegistry.delete(src);
    };
  }, [src, onReady, onResize, onError]);

  // Mount/unmount iframe - use refs to avoid callback instability causing re-runs
  const onReadyRef = useRef(onReady);
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onReadyRef.current = onReady;
    onErrorRef.current = onError;
  }, [onReady, onError]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cached = iframeCache.get(src);
    let ownedIframe: HTMLIFrameElement | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    // Case 1: Cached iframe exists and is available (not in another container)
    if (cached && (cached.activeContainer === null || cached.activeContainer === container)) {
      // If already in this container, nothing to do
      if (cached.activeContainer === container && cached.iframe.parentElement === container) {
        console.log('[useStableIframe] Iframe already in container:', src);
        ownedIframe = cached.iframe;
        if (cached.ready) {
          onReadyRef.current(cached.height);
        }
      } else {
        // Move cached iframe to this container
        console.log('[useStableIframe] Reusing cached iframe:', src);
        container.appendChild(cached.iframe);
        cached.iframe.style.display = 'block';
        cached.activeContainer = container;
        ownedIframe = cached.iframe;

        if (cached.ready) {
          onReadyRef.current(cached.height);
        }
      }
    }
    // Case 2: No cache OR cached iframe is in use elsewhere - create new
    else {
      // First, clean up any orphaned iframes in this container
      const existingIframes = container.querySelectorAll('iframe');
      existingIframes.forEach(iframe => {
        console.warn('[useStableIframe] Removing orphaned iframe from container');
        iframe.remove();
      });

      if (cached) {
        console.log('[useStableIframe] Cached iframe in use elsewhere, creating new:', src);
      } else {
        console.log('[useStableIframe] Creating new iframe:', src);
      }

      const iframe = document.createElement('iframe');
      iframe.src = previewUrl;
      iframe.className = 'w-full rounded-md bg-transparent';
      iframe.style.cssText = 'border:none;width:100%;';
      iframe.title = `Block: ${src}`;
      iframe.sandbox.add('allow-scripts', 'allow-same-origin');
      iframe.loading = 'lazy';

      iframe.onerror = () => onErrorRef.current('Failed to load block');

      // Cache this iframe (overwrites any existing cache for this src)
      // This is intentional - the old cached iframe must be in use by another component
      // which will clean it up on unmount
      if (!cached) {
        cached = { iframe, ready: false, height: 100, activeContainer: container };
        iframeCache.set(src, cached);
        ownedIframe = iframe;
      }
      container.appendChild(iframe);

      // Fallback timeout
      timeoutId = setTimeout(() => {
        const currentCached = iframeCache.get(src);
        if (currentCached && currentCached.iframe === iframe && !currentCached.ready) {
          currentCached.ready = true;
          currentCached.height = 100;
          const css = getThemeVariables();
          const isDark = document.documentElement.classList.contains('dark');
          iframe.contentWindow?.postMessage({ type: 'theme', css, isDark }, '*');
          onReadyRef.current(100);
        }
      }, 3000);
    }

    mountedRef.current = true;

    // Cleanup
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      const currentCached = iframeCache.get(src);

      // Only release/cleanup if we own this iframe
      if (ownedIframe && currentCached && currentCached.iframe === ownedIframe) {
        if (currentCached.activeContainer === container) {
          // Release cached iframe back to body (hidden)
          currentCached.iframe.style.display = 'none';
          currentCached.activeContainer = null;
          document.body.appendChild(currentCached.iframe);
          console.log('[useStableIframe] Released iframe to cache:', src);
        }
      } else if (!ownedIframe) {
        // We didn't own the cached iframe - remove any non-cached iframes we created
        const iframes = container.querySelectorAll('iframe');
        iframes.forEach(iframe => {
          const isCached = currentCached && currentCached.iframe === iframe;
          if (!isCached) {
            console.log('[useStableIframe] Removing non-cached iframe:', src);
            iframe.remove();
          }
        });
      }

      mountedRef.current = false;
    };
  }, [src, previewUrl]); // Only depend on src and previewUrl - callbacks use refs

  // Update height when it changes
  const cached = iframeCache.get(src);
  useEffect(() => {
    if (cached?.iframe) {
      cached.iframe.style.height = `${cached.height}px`;
    }
  }, [cached?.height]);

  const sendGrabMessage = useCallback((type: 'grab-activate' | 'grab-deactivate') => {
    const cached = iframeCache.get(src);
    if (cached?.iframe.contentWindow && cached.ready) {
      cached.iframe.contentWindow.postMessage({ type }, '*');
    }
  }, [src]);

  // Force reload the iframe - clears cache entry and recreates
  const reload = useCallback(() => {
    const container = containerRef.current;
    const cached = iframeCache.get(src);

    if (cached) {
      // Remove from DOM
      cached.iframe.remove();
      // Clear from cache
      iframeCache.delete(src);
      callbackRegistry.delete(src);
    }

    // Create new iframe if container is available
    if (container) {
      console.log('[useStableIframe] Reloading iframe:', src);
      const iframe = document.createElement('iframe');
      iframe.src = previewUrl;
      iframe.className = 'w-full rounded-md bg-transparent';
      iframe.style.cssText = 'border:none;width:100%;height:100px;';
      iframe.title = `Block: ${src}`;
      iframe.sandbox.add('allow-scripts', 'allow-same-origin');
      iframe.loading = 'lazy';

      iframe.onerror = () => onErrorRef.current('Failed to load block');

      const newCached = { iframe, ready: false, height: 100, activeContainer: container };
      iframeCache.set(src, newCached);
      callbackRegistry.set(src, { onReady, onResize, onError });
      container.appendChild(iframe);

      // Fallback timeout
      setTimeout(() => {
        if (!newCached.ready) {
          newCached.ready = true;
          newCached.height = 100;
          const css = getThemeVariables();
          const isDark = document.documentElement.classList.contains('dark');
          iframe.contentWindow?.postMessage({ type: 'theme', css, isDark }, '*');
          onReadyRef.current(100);
        }
      }, 3000);
    }
  }, [src, previewUrl, onReady, onResize, onError]);

  return {
    containerRef,
    isReady: cached?.ready ?? false,
    height: cached?.height ?? 100,
    sendGrabMessage,
    reload,
  };
}

// Cleanup function to clear cache (call on route change if needed)
export function clearIframeCache() {
  for (const [, cached] of iframeCache) {
    cached.iframe.remove();
  }
  iframeCache.clear();
}

// Check if an iframe is cached and ready (can be called before mounting)
export function isIframeCached(src: string): boolean {
  const cached = iframeCache.get(src);
  return cached?.ready ?? false;
}

// Get cached iframe state (height, ready status, availability)
export function getCachedIframeState(src: string): {
  ready: boolean;
  height: number;
  /** Whether the cached iframe is available (not in use by another component) */
  available: boolean;
} | null {
  const cached = iframeCache.get(src);
  if (!cached) return null;
  return {
    ready: cached.ready,
    height: cached.height,
    available: cached.activeContainer === null,
  };
}
