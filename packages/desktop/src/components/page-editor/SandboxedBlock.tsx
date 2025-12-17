'use client';

/**
 * Sandboxed Block Element
 *
 * Renders an iframe to runtime/preview/{src} with three states:
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
} from 'platejs/react';
import * as React from 'react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { PORTS } from '@/lib/ports';
import { HandsLogo } from '@/components/ui/hands-logo';

// Cache for block states to persist across remounts
const blockStateCache = new Map<string, {
  state: 'loading' | 'error' | 'ready';
  height: number;
  error: string | null;
}>();

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
}

// ============================================================================
// Loading Placeholder
// ============================================================================

function LoadingPlaceholder() {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-muted/30 px-4 py-3">
      {/* Spinner */}
      <div className="size-8 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/20 border-t-muted-foreground/60" />
      {/* Text */}
      <span className="text-sm text-muted-foreground">Loading block...</span>
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
  onRetry,
}: {
  error: string;
  onRetry?: () => void;
}) {
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-lg border border-red-500/30 bg-gradient-to-r from-red-500/5 via-red-500/10 to-red-500/5 px-4 py-3">
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

      {/* Error message */}
      <span className="flex-1 truncate text-sm text-red-400">{error}</span>

      {/* Retry button */}
      {onRetry && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRetry();
          }}
          className="shrink-0 rounded-md bg-red-500/10 px-3 py-1.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-300"
        >
          Retry
        </button>
      )}
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
      onError={() => onError('Failed to load block')}
    />
  );
});

// ============================================================================
// Component
// ============================================================================

type BlockState = 'loading' | 'error' | 'ready';

export function SandboxedBlockElement(props: PlateElementProps) {
  const element = useElement<TSandboxedBlockElement>();
  const selected = useSelected();
  const readOnly = useReadOnly();

  const { src, editing, prompt, height: initialHeight = 400, linkedTables = [] } = element;

  // Get cached state or use defaults
  const cached = src ? blockStateCache.get(src) : null;

  // State management - initialize from cache if available
  const [state, setState] = useState<BlockState>(cached?.state ?? 'loading');
  const [error, setError] = useState<string | null>(cached?.error ?? null);
  const [isHovered, setIsHovered] = useState(false);
  const [iframeHeight, setIframeHeight] = useState(cached?.height ?? initialHeight);
  const [retryCount, setRetryCount] = useState(0);
  const [isGrabActive, setIsGrabActive] = useState(false);

  // Memoize the URL to prevent unnecessary re-renders
  const previewUrl = useMemo(
    () => src ? `http://localhost:${PORTS.WORKER}/preview/${src}` : null,
    [src]
  );

  // Update cache when state changes
  useEffect(() => {
    if (src) {
      blockStateCache.set(src, { state, height: iframeHeight, error });
    }
  }, [src, state, iframeHeight, error]);

  // Memoized callbacks for iframe
  const handleReady = useCallback((height: number) => {
    setState('ready');
    setError(null);
    setIframeHeight(height);
  }, []);

  const handleResize = useCallback((height: number) => {
    setIframeHeight(height);
  }, []);

  const handleError = useCallback((errorMsg: string) => {
    setState('error');
    setError(errorMsg);
  }, []);

  // Grab mode handlers
  const handleGrabActivate = useCallback(() => {
    setIsGrabActive(true);
  }, []);

  const handleGrabDeactivate = useCallback(() => {
    setIsGrabActive(false);
  }, []);

  // Retry loading - clear cache and force remount
  const handleRetry = useCallback(() => {
    if (src) {
      blockStateCache.delete(src);
    }
    setState('loading');
    setError(null);
    setRetryCount((c) => c + 1);
  }, [src]);

  // Render content based on state
  const renderContent = () => {
    // Editing mode - show shimmer
    if (editing) {
      return <EditingPlaceholder prompt={prompt} />;
    }

    // No src - show error
    if (!src || !previewUrl) {
      return <ErrorPlaceholder error="No block source specified" />;
    }

    // Error state
    if (state === 'error' && error) {
      return <ErrorPlaceholder error={error} onRetry={handleRetry} />;
    }

    // Loading or ready - show iframe (with loading overlay when loading)
    return (
      <div className="relative" style={{ minHeight: iframeHeight }}>
        {/* Loading overlay */}
        {state === 'loading' && (
          <div className="absolute inset-0 z-10 bg-background">
            <LoadingPlaceholder />
          </div>
        )}

        {/* Memoized Iframe - keyed by src+retry to prevent remounts */}
        <BlockIframe
          key={`${src}-${retryCount}`}
          src={src}
          previewUrl={previewUrl}
          height={iframeHeight}
          isLoading={state === 'loading'}
          isGrabActive={isGrabActive}
          onReady={handleReady}
          onResize={handleResize}
          onError={handleError}
          onGrabActivate={handleGrabActivate}
          onGrabDeactivate={handleGrabDeactivate}
        />

        {/* Hover overlay with Edit button (left) and linked tables (right) */}
        {state === 'ready' && isHovered && !readOnly && (
          <div className="absolute inset-0 z-20 pointer-events-none">
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
        contentEditable={false}
        className={cn(
          'rounded transition-all duration-150',
          !readOnly && isHovered && 'bg-muted/30 ring-1 ring-border/50',
          selected && 'ring-2 ring-primary/40'
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {renderContent()}
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

      // Completed blocks serialize with src
      return {
        type: 'mdxJsxFlowElement',
        name: 'Block',
        attributes: [
          { type: 'mdxJsxAttribute', name: 'src', value: node.src || '' },
        ],
        children: [],
      };
    },
  },
};
