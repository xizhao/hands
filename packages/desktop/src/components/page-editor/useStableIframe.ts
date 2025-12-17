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
}>();

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

  // Mount/unmount iframe
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cached = iframeCache.get(src);

    if (cached) {
      // Reuse existing iframe - just move it to this container
      console.log('[useStableIframe] Reusing cached iframe:', src);
      container.appendChild(cached.iframe);
      cached.iframe.style.display = 'block';

      // If already ready, notify immediately
      if (cached.ready) {
        onReady(cached.height);
      }
    } else {
      // Create new iframe
      console.log('[useStableIframe] Creating new iframe:', src);
      const iframe = document.createElement('iframe');
      iframe.src = previewUrl;
      iframe.className = 'w-full rounded-md bg-transparent';
      iframe.style.cssText = 'border:none;width:100%;';
      iframe.title = `Block: ${src}`;
      iframe.sandbox.add('allow-scripts', 'allow-same-origin');
      iframe.loading = 'lazy';

      iframe.onerror = () => onError('Failed to load block');

      cached = { iframe, ready: false, height: 100 };
      iframeCache.set(src, cached);
      container.appendChild(iframe);

      // Fallback timeout
      const timeout = setTimeout(() => {
        if (!cached!.ready) {
          cached!.ready = true;
          cached!.height = 100;
          const css = getThemeVariables();
          const isDark = document.documentElement.classList.contains('dark');
          iframe.contentWindow?.postMessage({ type: 'theme', css, isDark }, '*');
          onReady(100);
        }
      }, 3000);

      return () => clearTimeout(timeout);
    }

    mountedRef.current = true;

    return () => {
      // Don't destroy iframe - just hide it and keep in cache
      if (cached) {
        cached.iframe.style.display = 'none';
        // Move to a hidden container to keep it alive
        document.body.appendChild(cached.iframe);
      }
      mountedRef.current = false;
    };
  }, [src, previewUrl, onReady, onError]);

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

      iframe.onerror = () => onError('Failed to load block');

      const newCached = { iframe, ready: false, height: 100 };
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
          onReady(100);
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

// Get cached iframe state (height, ready status)
export function getCachedIframeState(src: string): { ready: boolean; height: number } | null {
  const cached = iframeCache.get(src);
  if (!cached) return null;
  return { ready: cached.ready, height: cached.height };
}
