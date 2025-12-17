'use client';

/**
 * Sandboxed Block Element
 *
 * Renders an iframe to runtime/preview/{src} with lazy loading:
 * - Iframes only load when scrolled into view (triggerOnce)
 * - Preloads 200px before visible for smooth experience
 * - Once loaded, stays mounted (no re-loading on scroll)
 *
 * States:
 * - editing: Block being created (shimmer placeholder)
 * - loading: iframe loading (skeleton)
 * - error: iframe failed to load (error placeholder)
 * - default: iframe rendered successfully
 */

import type { TElement } from 'platejs';
import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useElement,
  useReadOnly,
  useSelected,
  useEditorRef,
} from 'platejs/react';
import * as React from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useInView } from 'react-intersection-observer';

import { cn } from '@/lib/utils';
import { PORTS } from '@/lib/ports';
import { HandsLogo } from '@/components/ui/hands-logo';
import { useStableIframe, getCachedIframeState } from './useStableIframe';
import { useCreateSession, useSendMessage } from '@/hooks/useSession';

// Detailed error info from sandbox-error messages (render errors from BlockErrorBoundary)
export interface SandboxErrorInfo {
  message: string;
  name?: string;
  stack?: string;
  componentStack?: string;
  source?: string;
  line?: number;
  column?: number;
  blockId?: string;
  isRenderError?: boolean;
  isBuildError?: boolean;
}

// Cache for block states to persist across remounts
const blockStateCache = new Map<string, {
  state: 'loading' | 'error' | 'ready';
  height: number;
  error: string | null;
  errorInfo?: SandboxErrorInfo | null;
}>();

// Retry configuration
const MAX_AUTO_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff: 1s, 2s, 4s

export const SANDBOXED_BLOCK_KEY = 'sandboxed_block';

/**
 * Get CSS variables using getComputedStyle (FAST - no stylesheet iteration)
 * Only extracts the theme variables we use, not all CSS rules
 */
export function getThemeVariables(): string {
  const computed = getComputedStyle(document.documentElement);
  const vars: string[] = [];

  const varNames = [
    '--background', '--foreground', '--card', '--card-foreground',
    '--popover', '--popover-foreground', '--primary', '--primary-foreground',
    '--secondary', '--secondary-foreground', '--muted', '--muted-foreground',
    '--accent', '--accent-foreground', '--destructive', '--destructive-foreground',
    '--border', '--input', '--ring', '--radius',
    '--brand', '--brand-foreground', '--brand-10', '--brand-15', '--brand-25',
    '--brand-50', '--brand-80', '--brand-90', '--highlight',
  ];

  for (const name of varNames) {
    const value = computed.getPropertyValue(name).trim();
    if (value) vars.push(`${name}:${value}`);
  }

  return `:root{${vars.join(';')}}`;
}

// ============================================================================
// Element Type
// ============================================================================

export interface TSandboxedBlockElement extends TElement {
  type: typeof SANDBOXED_BLOCK_KEY;
  /** Block source ID - used to fetch from /preview/{src} */
  src?: string;
  /** Whether this block is being created (shows shimmer) */
  editing?: boolean;
  /** User prompt for AI to build this block (only set when editing) */
  prompt?: string;
  /** Height of the iframe */
  height?: number;
  /** Tables linked/referenced by this block's SQL queries */
  linkedTables?: string[];
  /** Build error from manifest - shows error without attempting to load iframe */
  buildError?: string;
}

// ============================================================================
// Loading Placeholder
// ============================================================================

function LoadingPlaceholder({ retryAttempt }: { retryAttempt?: number }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
      {/* Spinner */}
      <div className="size-8 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/60" />
      {/* Text */}
      <span className="text-sm text-muted-foreground">
        {retryAttempt && retryAttempt > 0
          ? `Retrying... (attempt ${retryAttempt}/${MAX_AUTO_RETRIES})`
          : 'Loading block...'}
      </span>
    </div>
  );
}

// ============================================================================
// Not In View Placeholder (shown before lazy loading triggers)
// ============================================================================

function NotInViewPlaceholder({ height = 100 }: { height?: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg border border-border/30 bg-muted/10"
      style={{ minHeight: height }}
    >
      <div className="flex items-center gap-2 text-muted-foreground/50">
        <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M9 21V9" />
        </svg>
        <span className="text-xs">Block</span>
      </div>
    </div>
  );
}

// ============================================================================
// Editing Placeholder (shimmer effect for new blocks)
// ============================================================================

function EditingPlaceholder({ prompt }: { prompt?: string }) {
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-lg border border-brand/30 bg-brand/5 px-4 py-3">
      {/* Aggressive shimmer sweep */}
      <div className="absolute inset-0 animate-shimmer-fast bg-gradient-to-r from-transparent via-brand/40 to-transparent" />

      {/* Icon */}
      <div className="relative flex size-8 shrink-0 items-center justify-center rounded-md bg-brand/10">
        <svg
          className="size-5 text-brand"
          viewBox="0 0 32 32"
          fill="currentColor"
        >
          <path d="M8 12h4v8H8zM14 10h4v10h-4zM20 14h4v6h-4z" />
        </svg>
      </div>

      {/* Text */}
      <span className="text-sm font-medium text-brand/80">
        Creating {prompt ? `"${prompt}"` : 'block'}...
      </span>
    </div>
  );
}

// ============================================================================
// Error Placeholder
// ============================================================================

function ErrorPlaceholder({
  error,
  errorInfo,
  isBuildError,
  onRetry,
  onFixWithAI,
  isFixing,
}: {
  error: string;
  errorInfo?: SandboxErrorInfo | null;
  /** Build-time error from manifest (syntax error, duplicate export, etc.) */
  isBuildError?: boolean;
  onRetry?: () => void;
  onFixWithAI?: () => void;
  isFixing?: boolean;
}) {
  // Show fix button for render errors and build errors
  const showFixWithAI = errorInfo?.isRenderError || isBuildError;
  const sourceLocation = errorInfo?.source
    ? `${errorInfo.source}${errorInfo.line ? `:${errorInfo.line}` : ''}${errorInfo.column ? `:${errorInfo.column}` : ''}`
    : null;

  return (
    <div className="relative overflow-hidden rounded-lg border border-red-500/30 bg-gradient-to-r from-red-500/5 via-red-500/10 to-red-500/5 px-4 py-3">
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div className="relative flex size-8 shrink-0 items-center justify-center rounded-md bg-red-500/10">
          <svg
            className="size-5 text-red-500"
            viewBox="0 0 32 32"
            fill="currentColor"
          >
            <path d="M8 12h4v8H8zM14 10h4v10h-4zM20 14h4v6h-4z" />
          </svg>
        </div>

        {/* Error message and source */}
        <div className="flex-1 min-w-0">
          <span className="block truncate text-sm text-red-400">{error}</span>
          {sourceLocation && (
            <span className="block truncate text-xs text-muted-foreground/70 mt-0.5">
              {sourceLocation}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Fix with AI button (for render errors and build errors) */}
          {showFixWithAI && onFixWithAI && (
            <button
              type="button"
              disabled={isFixing}
              onClick={(e) => {
                e.stopPropagation();
                onFixWithAI();
              }}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                isFixing
                  ? "bg-brand/20 text-brand/60 cursor-wait"
                  : "bg-brand/10 text-brand hover:bg-brand/20"
              )}
            >
              {isFixing ? (
                <span className="flex items-center gap-1.5">
                  <div className="size-3 animate-spin rounded-full border-2 border-brand/30 border-t-brand" />
                  Fixing...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <HandsLogo className="size-3.5" />
                  Fix with AI
                </span>
              )}
            </button>
          )}

          {/* Retry button */}
          {onRetry && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRetry();
              }}
              className="rounded-md bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-300"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Memoized Iframe Component (exported for standalone use)
// ============================================================================

export interface BlockIframeProps {
  src: string;
  previewUrl: string;
  height: number;
  isLoading: boolean;
  isGrabActive?: boolean;
  onReady: (height: number) => void;
  onResize: (height: number) => void;
  onError: (error: string) => void;
  onGrabActivate?: () => void;
  onGrabDeactivate?: () => void;
}

export const BlockIframe = memo(function BlockIframe({
  src,
  previewUrl,
  height,
  isLoading,
  isGrabActive,
  onReady,
  onResize,
  onError,
  onGrabActivate,
  onGrabDeactivate,
}: BlockIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);

  // Send theme variables to iframe (fast - uses getComputedStyle, no iteration)
  const sendTheme = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    const css = getThemeVariables();
    const isDark = document.documentElement.classList.contains('dark');
    iframe.contentWindow.postMessage({ type: 'theme', css, isDark }, '*');
  }, []);

  // Listen for messages from iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;

      if (e.data?.type === 'sandbox-ready' && !readyRef.current) {
        readyRef.current = true;
        sendTheme();
        const h = typeof e.data.height === 'number' && e.data.height > 0 ? e.data.height : 100;
        onReady(h);
      }

      if (e.data?.type === 'sandbox-resize') {
        if (typeof e.data.height === 'number' && e.data.height > 0) {
          onResize(e.data.height);
        }
      }

      if (e.data?.type === 'sandbox-error') {
        console.error('[SandboxedBlock] Error from iframe:', e.data.error);
        onError(e.data.error?.message || 'Unknown error in block');
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onReady, onResize, onError, sendTheme]);

  // Fallback timeout
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!readyRef.current) {
        readyRef.current = true;
        sendTheme();
        onReady(100);
      }
    }, 3000);

    return () => clearTimeout(timeout);
  }, [onReady, sendTheme]);

  // Sync theme changes (debounced)
  useEffect(() => {
    if (!readyRef.current) return;

    let timer: ReturnType<typeof setTimeout>;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(sendTheme, 50);
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });

    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, [sendTheme]);

  // Send grab activate/deactivate to iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow || !readyRef.current) return;

    if (isGrabActive) {
      iframe.contentWindow.postMessage({ type: 'grab-activate' }, '*');
    } else {
      iframe.contentWindow.postMessage({ type: 'grab-deactivate' }, '*');
    }
  }, [isGrabActive]);

  return (
    <iframe
      ref={iframeRef}
      className={cn(
        'w-full rounded-md bg-transparent',
        isLoading && 'invisible'
      )}
      src={previewUrl}
      style={{ height, border: 'none' }}
      title={`Block: ${src}`}
      sandbox="allow-scripts allow-same-origin"
      loading="lazy"
      onError={() => onError('Failed to load block')}
    />
  );
});

// ============================================================================
// Stable Iframe Component (survives Plate re-renders)
// ============================================================================

interface StableBlockIframeProps {
  src: string;
  previewUrl: string;
  height: number;
  isGrabActive: boolean;
  onReady: (height: number) => void;
  onResize: (height: number) => void;
  onError: (error: string) => void;
  /** Ref to expose reload function to parent */
  reloadRef?: React.MutableRefObject<(() => void) | null>;
}

function StableBlockIframe({
  src,
  previewUrl,
  height,
  isGrabActive,
  onReady,
  onResize,
  onError,
  reloadRef,
}: StableBlockIframeProps) {
  const { containerRef, isReady, height: stableHeight, sendGrabMessage, reload } = useStableIframe({
    src,
    previewUrl,
    onReady,
    onResize,
    onError,
  });

  // Expose reload to parent via ref
  useEffect(() => {
    if (reloadRef) {
      reloadRef.current = reload;
    }
    return () => {
      if (reloadRef) {
        reloadRef.current = null;
      }
    };
  }, [reload, reloadRef]);

  // Send grab messages when state changes
  useEffect(() => {
    if (isReady) {
      sendGrabMessage(isGrabActive ? 'grab-activate' : 'grab-deactivate');
    }
  }, [isGrabActive, isReady, sendGrabMessage]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-md bg-transparent"
      style={{ height: stableHeight || height, minHeight: height }}
    />
  );
}

// ============================================================================
// Component
// ============================================================================

type BlockState = 'loading' | 'error' | 'ready';

// Minimum height for blocks
const MIN_BLOCK_HEIGHT = 50;

export function SandboxedBlockElement(props: PlateElementProps) {
  const element = useElement<TSandboxedBlockElement>();
  const editor = useEditorRef();
  const selected = useSelected();
  const readOnly = useReadOnly();

  const { src, editing, prompt, height: initialHeight = 400, linkedTables = [], buildError } = element;

  // Session hooks for AI fix
  const createSession = useCreateSession();
  const sendMessage = useSendMessage();

  // Lazy loading - only load iframe when scrolled into view
  // triggerOnce: true means it stays loaded after first view (no unloading)
  // rootMargin: preload 200px before visible for smooth experience
  const { ref: inViewRef, inView } = useInView({
    triggerOnce: true,
    rootMargin: '200px 0px',
  });

  // Get cached state or use defaults
  // IMPORTANT: Check iframe cache first - if iframe DOM is already cached, ready,
  // AND available (not in use by another block), we can skip loading state entirely
  const blockCached = src ? blockStateCache.get(src) : null;
  const iframeCached = src ? getCachedIframeState(src) : null;

  // Derive initial state: iframe cache is source of truth for ready state
  // Only skip loading if iframe is both ready AND available for reuse
  const canReuseIframe = iframeCached?.ready && iframeCached?.available;
  const initialState: BlockState = canReuseIframe
    ? 'ready'
    : (blockCached?.state ?? 'loading');
  const initialIframeHeight = iframeCached?.height ?? blockCached?.height ?? initialHeight;

  // State management - initialize from cache if available
  const [state, setState] = useState<BlockState>(initialState);
  const [error, setError] = useState<string | null>(blockCached?.error ?? null);
  const [errorInfo, setErrorInfo] = useState<SandboxErrorInfo | null>(blockCached?.errorInfo ?? null);
  const [isHovered, setIsHovered] = useState(false);
  const [iframeHeight, setIframeHeight] = useState(initialIframeHeight);
  const [retryCount, setRetryCount] = useState(0);
  const [autoRetryCount, setAutoRetryCount] = useState(0);
  const [isAutoRetrying, setIsAutoRetrying] = useState(false);
  const [isGrabActive, setIsGrabActive] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isFixingWithAI, setIsFixingWithAI] = useState(false);
  // Track if content has ever loaded successfully (for subtle reload indicator)
  // If iframe is already cached, ready, and available, content has definitely loaded before
  const [hasLoadedOnce, setHasLoadedOnce] = useState(canReuseIframe || blockCached?.state === 'ready');
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const iframeReloadRef = useRef<(() => void) | null>(null);
  const persistHeightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persist height to Plate element (debounced to avoid too many updates)
  const persistHeight = useCallback((height: number) => {
    if (readOnly) return;
    if (persistHeightTimeoutRef.current) {
      clearTimeout(persistHeightTimeoutRef.current);
    }
    persistHeightTimeoutRef.current = setTimeout(() => {
      editor.tf.setNodes<TSandboxedBlockElement>({ height }, { at: element });
    }, 300);
  }, [editor, element, readOnly]);

  // Memoize the URL to prevent unnecessary re-renders
  const previewUrl = useMemo(
    () => src ? `http://localhost:${PORTS.WORKER}/preview/${src}` : null,
    [src]
  );

  // Clear timeouts on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
      if (persistHeightTimeoutRef.current) {
        clearTimeout(persistHeightTimeoutRef.current);
      }
    };
  }, []);

  // Update block state cache when state changes
  useEffect(() => {
    if (src) {
      blockStateCache.set(src, { state, height: iframeHeight, error, errorInfo });
    }
  }, [src, state, iframeHeight, error, errorInfo]);

  // Memoized callbacks for iframe
  const handleReady = useCallback((height: number) => {
    setState('ready');
    setError(null);
    setErrorInfo(null);
    setAutoRetryCount(0); // Reset auto-retry count on success
    setIsAutoRetrying(false);
    setHasLoadedOnce(true); // Mark that content has loaded at least once
    setIframeHeight(height);
    // Persist initial height if element doesn't have one
    if (typeof element.height !== 'number') {
      persistHeight(height);
    }
  }, [element.height, persistHeight]);

  const handleResize = useCallback((height: number) => {
    setIframeHeight(height);
    persistHeight(height);
  }, [persistHeight]);

  // Handle error with auto-retry logic (for simple load errors)
  const handleError = useCallback((errorMsg: string) => {
    setError(errorMsg);

    // Check if we should auto-retry (only for non-render errors)
    if (!errorInfo?.isRenderError && autoRetryCount < MAX_AUTO_RETRIES) {
      const delay = RETRY_DELAYS[autoRetryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
      console.log(`[SandboxedBlock] Error loading ${src}, auto-retrying in ${delay}ms (attempt ${autoRetryCount + 1}/${MAX_AUTO_RETRIES})`);

      setIsAutoRetrying(true);
      setState('loading'); // Stay in loading state during retry

      retryTimeoutRef.current = setTimeout(() => {
        setAutoRetryCount((c) => c + 1);
        setRetryCount((c) => c + 1); // Increment to force iframe remount
        setIsAutoRetrying(false);
      }, delay);
    } else {
      // Max retries exceeded or render error, show error
      console.error(`[SandboxedBlock] Failed to load ${src}${errorInfo?.isRenderError ? ' (render error)' : ` after ${MAX_AUTO_RETRIES} retries`}`);
      setState('error');
      setIsAutoRetrying(false);
    }
  }, [src, autoRetryCount, errorInfo?.isRenderError]);

  // Listen for detailed error info from sandbox-error messages (render errors)
  useEffect(() => {
    const handleDetailedError = (e: MessageEvent) => {
      if (e.data?.type !== 'sandbox-error') return;
      const errData = e.data.error as SandboxErrorInfo | undefined;
      if (!errData) return;

      // Only capture if this error is for our block
      if (errData.blockId && src && errData.blockId !== src) return;

      console.log('[SandboxedBlock] Received detailed error:', errData);
      setErrorInfo(errData);

      // For render errors and build errors, don't auto-retry - show error immediately
      if (errData.isRenderError || errData.isBuildError) {
        setError(errData.message);
        setState('error');
        setIsAutoRetrying(false);
      }
    };

    window.addEventListener('message', handleDetailedError);
    return () => window.removeEventListener('message', handleDetailedError);
  }, [src]);

  // Handle "Fix with AI" - creates a session and asks @coder to fix the error
  const handleFixWithAI = useCallback(async () => {
    if (!errorInfo || !src) return;

    setIsFixingWithAI(true);

    try {
      // Create a new session
      const session = await createSession.mutateAsync({
        title: `Fix block: ${src}`,
      });

      // Build a prompt with error details
      const prompt = `Fix the render error in block "${src}":

Error: ${errorInfo.message}
${errorInfo.source ? `Source: ${errorInfo.source}${errorInfo.line ? `:${errorInfo.line}` : ''}` : ''}
${errorInfo.componentStack ? `\nComponent Stack:\n${errorInfo.componentStack}` : ''}
${errorInfo.stack ? `\nStack Trace:\n${errorInfo.stack}` : ''}

Please fix this error in the block file.`;

      // Send the message to @coder agent
      await sendMessage.mutateAsync({
        sessionId: session.id,
        content: prompt,
        agent: 'coder',
      });

      console.log('[SandboxedBlock] AI fix session started:', session.id);

      // Clear error state to show loading while AI works
      // The block will reload when the file is fixed
      setError(null);
      setErrorInfo(null);
      setState('loading');
      setAutoRetryCount(0);
    } catch (err) {
      console.error('[SandboxedBlock] Failed to start AI fix:', err);
    } finally {
      setIsFixingWithAI(false);
    }
  }, [errorInfo, src, createSession, sendMessage]);

  // Grab mode handlers
  const handleGrabActivate = useCallback(() => {
    setIsGrabActive(true);
  }, []);

  const handleGrabDeactivate = useCallback(() => {
    setIsGrabActive(false);
  }, []);

  // Resize handle mouse down handler
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();

    setIsResizing(true);
    const startY = e.clientY;
    const startHeight = iframeHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const newHeight = Math.max(MIN_BLOCK_HEIGHT, startHeight + deltaY);
      setIframeHeight(newHeight);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      // Persist the final height after user resizing
      const finalHeight = Math.max(MIN_BLOCK_HEIGHT, iframeHeight);
      persistHeight(finalHeight);

      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [readOnly, iframeHeight, persistHeight]);

  // Manual retry - resets auto-retry count and reloads iframe
  const handleRetry = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    if (src) {
      blockStateCache.delete(src);
    }
    setState('loading');
    setError(null);
    setErrorInfo(null);
    setAutoRetryCount(0); // Reset auto-retry count for manual retry
    setIsAutoRetrying(false);
    // Use the stable iframe reload if available
    if (iframeReloadRef.current) {
      iframeReloadRef.current();
    } else {
      setRetryCount((c) => c + 1);
    }
  }, [src]);

  // Render content based on state
  const renderContent = () => {
    // Editing mode - show shimmer (always render, no lazy loading)
    if (editing) {
      return <EditingPlaceholder prompt={prompt} />;
    }

    // No src - show error
    if (!src || !previewUrl) {
      return <ErrorPlaceholder error="No block source specified" />;
    }

    // Not yet in view - show lightweight placeholder (lazy loading)
    if (!inView) {
      return <NotInViewPlaceholder height={iframeHeight} />;
    }

    // Error state
    if (state === 'error' && error) {
      return (
        <ErrorPlaceholder
          error={error}
          errorInfo={errorInfo}
          isBuildError={errorInfo?.isBuildError}
          onRetry={handleRetry}
          onFixWithAI={handleFixWithAI}
          isFixing={isFixingWithAI}
        />
      );
    }

    // Loading or ready - show iframe (with loading overlay when loading)
    return (
      <div className="relative" style={{ minHeight: iframeHeight }}>
        {/* Initial loading overlay - full placeholder */}
        {state === 'loading' && !hasLoadedOnce && (
          <div className="absolute inset-0 z-10 bg-background">
            <LoadingPlaceholder retryAttempt={isAutoRetrying ? autoRetryCount : undefined} />
          </div>
        )}

        {/* Reload indicator - subtle spinner overlay (when reloading after content was shown) */}
        {state === 'loading' && hasLoadedOnce && (
          <div className="absolute right-2 top-2 z-10 flex items-center gap-2 rounded-md bg-background/90 px-2 py-1 shadow-sm border border-border/50">
            <div className="size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              {isAutoRetrying ? `Retrying (${autoRetryCount}/${MAX_AUTO_RETRIES})...` : 'Reloading...'}
            </span>
          </div>
        )}

        {/* Stable Iframe - survives Plate re-renders by caching DOM nodes */}
        <StableBlockIframe
          src={src}
          previewUrl={previewUrl}
          height={iframeHeight}
          isGrabActive={isGrabActive}
          onReady={handleReady}
          onResize={handleResize}
          onError={handleError}
          reloadRef={iframeReloadRef}
        />

        {/* Hover overlay with Edit button (left) and linked tables (right) */}
        {state === 'ready' && (isHovered || isResizing) && !readOnly && (
          <div className="absolute inset-x-0 top-0 bottom-[-8px] z-20 pointer-events-none">
            {/* Edit button - top left */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (isGrabActive) {
                  handleGrabDeactivate();
                } else {
                  handleGrabActivate();
                }
              }}
              onBlur={handleGrabDeactivate}
              className={cn(
                'pointer-events-auto absolute left-2 top-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium shadow-sm transition-all',
                isGrabActive
                  ? 'bg-brand text-brand-foreground'
                  : 'bg-background/90 text-foreground hover:bg-brand hover:text-brand-foreground border border-border/50'
              )}
            >
              <HandsLogo className="size-3.5" />
              Edit
            </button>

            {/* Linked tables - top right */}
            {linkedTables.length > 0 && (
              <div className="pointer-events-auto absolute right-2 top-2 flex items-center gap-1">
                {linkedTables.map((table) => (
                  <button
                    key={table}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      // TODO: Navigate to table in data browser
                      console.log('[SandboxedBlock] Navigate to table:', table);
                    }}
                    className="flex items-center gap-1 rounded-md bg-background/90 px-2 py-1 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground border border-border/50"
                  >
                    <svg className="size-3" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M0 2a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V2zm15 2h-4v3h4V4zm0 4h-4v3h4V8zm0 4h-4v3h3a1 1 0 0 0 1-1v-2zm-5 3v-3H6v3h4zm-5 0v-3H1v2a1 1 0 0 0 1 1h3zm-4-4h4V8H1v3zm0-4h4V4H1v3zm5-3v3h4V4H6zm4 4H6v3h4V8z"/>
                    </svg>
                    {table}
                  </button>
                ))}
              </div>
            )}

          </div>
        )}
      </div>
    );
  };

  return (
    <PlateElement
      className={cn('sandboxed-block-element group/block relative my-2')}
      {...props}
    >
      <div
        ref={inViewRef}
        contentEditable={false}
        className={cn(
          'group/block-content relative rounded transition-all duration-150 overflow-visible',
          !readOnly && (isHovered || isResizing) && 'bg-muted/30 ring-1 ring-border/50',
          isResizing && 'ring-brand/50',
          selected && 'ring-2 ring-primary/40'
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => !isResizing && setIsHovered(false)}
      >
        {renderContent()}

        {/* Resize handle - bottom (shows on hover) */}
        {!readOnly && (isHovered || isResizing) && state === 'ready' && (
          <div
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-30 flex h-6 w-24 cursor-ns-resize items-center justify-center"
            onMouseDown={handleResizeMouseDown}
          >
            <div className={cn(
              'h-1.5 w-16 rounded-full transition-colors',
              isResizing ? 'bg-brand/70' : 'bg-muted-foreground/40 hover:bg-brand/70'
            )} />
          </div>
        )}
      </div>

      {/* Slate requires children for void elements */}
      {props.children}
    </PlateElement>
  );
}

// ============================================================================
// Plugin
// ============================================================================

export const SandboxedBlockPlugin = createPlatePlugin({
  key: SANDBOXED_BLOCK_KEY,
  node: {
    isElement: true,
    isVoid: true,
    component: SandboxedBlockElement,
  },
});

// ============================================================================
// Markdown Serialization
// ============================================================================

export const sandboxedBlockMarkdownRule = {
  [SANDBOXED_BLOCK_KEY]: {
    serialize: (node: TSandboxedBlockElement) => {
      // Editing blocks serialize with prompt
      if (node.editing && node.prompt) {
        return {
          type: 'mdxJsxFlowElement',
          name: 'Block',
          attributes: [
            { type: 'mdxJsxAttribute', name: 'prompt', value: node.prompt },
            { type: 'mdxJsxAttribute', name: 'editing', value: null },
          ],
          children: [],
        };
      }

      // Completed blocks serialize with src and height
      const attributes: Array<{ type: 'mdxJsxAttribute'; name: string; value: any }> = [
        { type: 'mdxJsxAttribute', name: 'src', value: node.src || '' },
      ];

      // Include height if set (persists user resizing)
      if (typeof node.height === 'number' && node.height > 0) {
        attributes.push({
          type: 'mdxJsxAttribute',
          name: 'height',
          value: { type: 'mdxJsxAttributeValueExpression', value: String(node.height) },
        });
      }

      return {
        type: 'mdxJsxFlowElement',
        name: 'Block',
        attributes,
        children: [],
      };
    },
  },
};
