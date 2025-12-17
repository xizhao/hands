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
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import { PORTS } from '@/lib/ports';

export const SANDBOXED_BLOCK_KEY = 'sandboxed_block';

// CSS variables to inject into iframe (must match theme)
const CSS_VARS = [
  'background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground',
  'primary', 'primary-foreground', 'secondary', 'secondary-foreground',
  'muted', 'muted-foreground', 'accent', 'accent-foreground',
  'destructive', 'destructive-foreground', 'border', 'input', 'ring', 'radius',
  'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5',
  'brand', 'brand-foreground', 'brand-active', 'brand-15', 'brand-25', 'brand-50',
  'highlight', 'subtle-foreground',
];

// HSL vars that need hsl() wrapper
const HSL_VARS = new Set(CSS_VARS.filter((v) => v !== 'radius'));

/** Generate CSS string from current theme */
function generateThemeStyles(): string {
  const root = document.documentElement;
  const computedStyle = getComputedStyle(root);

  const cssVars = CSS_VARS.map((v) => {
    const value = computedStyle.getPropertyValue(`--${v}`).trim();
    if (!value) return null;
    // Wrap HSL values in hsl() for Tailwind v4
    if (HSL_VARS.has(v) && !value.startsWith('hsl') && !value.startsWith('rgb')) {
      return `--${v}:hsl(${value})`;
    }
    return `--${v}:${value}`;
  }).filter(Boolean).join(';');

  return `:root{${cssVars}}`;
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
}

// ============================================================================
// Loading Skeleton
// ============================================================================

function LoadingSkeleton() {
  return (
    <div className="animate-pulse space-y-3 p-4">
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-lg bg-muted/60" />
        <div className="h-4 w-32 rounded bg-muted/60" />
      </div>
      {/* Content skeleton */}
      <div className="space-y-2">
        <div className="h-3 w-full rounded bg-muted/40" />
        <div className="h-3 w-4/5 rounded bg-muted/40" />
        <div className="h-3 w-3/5 rounded bg-muted/40" />
      </div>
      {/* Chart-like skeleton */}
      <div className="flex h-24 items-end gap-1 pt-4">
        {[40, 65, 45, 80, 55, 70, 50, 85, 60, 75].map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-muted/50"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Editing Placeholder (shimmer effect for new blocks)
// ============================================================================

function EditingPlaceholder({ prompt }: { prompt?: string }) {
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-lg border border-primary/20 bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 px-4 py-3">
      {/* Shimmer sweep */}
      <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

      {/* Icon */}
      <div className="relative flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10">
        <svg
          className="size-5 text-primary"
          viewBox="0 0 32 32"
          fill="currentColor"
        >
          <path d="M8 12h4v8H8zM14 10h4v10h-4zM20 14h4v6h-4z" />
        </svg>
      </div>

      {/* Text */}
      <span className="text-sm font-medium text-primary/80">
        Creating {prompt ? `"${prompt}"` : 'block'} with Hands...
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
// Component
// ============================================================================

type BlockState = 'loading' | 'error' | 'ready';

export function SandboxedBlockElement(props: PlateElementProps) {
  const element = useElement<TSandboxedBlockElement>();
  const selected = useSelected();
  const readOnly = useReadOnly();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const { src, editing, prompt, height: initialHeight = 400 } = element;

  // State management
  const [state, setState] = useState<BlockState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [iframeHeight, setIframeHeight] = useState(initialHeight);

  const previewUrl = src ? `http://localhost:${PORTS.WORKER}/preview/${src}` : null;

  // Send styles to iframe
  const sendStyles = useCallback(() => {
    if (!iframeRef.current?.contentWindow) return;
    const css = generateThemeStyles();
    const isDark = document.documentElement.classList.contains('dark');
    iframeRef.current.contentWindow.postMessage({ type: 'styles', css, isDark }, '*');
  }, []);

  // Listen for messages from this specific iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      // Only handle messages from our iframe
      if (e.source !== iframeRef.current?.contentWindow) return;

      if (e.data?.type === 'sandbox-ready') {
        sendStyles();
        setState('ready');
        setError(null);
        // Set initial height from iframe if provided
        if (typeof e.data.height === 'number' && e.data.height > 0) {
          setIframeHeight(e.data.height);
        }
      }

      if (e.data?.type === 'sandbox-resize') {
        // Update height when content size changes
        if (typeof e.data.height === 'number' && e.data.height > 0) {
          setIframeHeight(e.data.height);
        }
      }

      if (e.data?.type === 'sandbox-error') {
        console.error('[SandboxedBlock] Error from iframe:', e.data.error);
        setState('error');
        setError(e.data.error?.message || 'Unknown error in block');
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [sendStyles]);

  // Fallback: if no ready message after 5s, try sending styles anyway
  useEffect(() => {
    if (state !== 'loading' || !previewUrl) return;

    const timeout = setTimeout(() => {
      if (state === 'loading' && iframeRef.current?.contentWindow) {
        console.warn('[SandboxedBlock] No ready message received, sending styles anyway');
        sendStyles();
        setState('ready');
      }
    }, 5000);

    return () => clearTimeout(timeout);
  }, [state, previewUrl, sendStyles]);

  // Re-send styles when theme changes
  useEffect(() => {
    if (state !== 'ready') return;

    const observer = new MutationObserver(() => {
      sendStyles();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    return () => observer.disconnect();
  }, [state, sendStyles]);

  // Handle iframe error
  const handleError = useCallback(() => {
    setState('error');
    setError('Failed to load block');
  }, []);

  // Retry loading
  const handleRetry = useCallback(() => {
    setState('loading');
    setError(null);
    // Force iframe reload
    if (iframeRef.current && previewUrl) {
      iframeRef.current.src = previewUrl;
    }
  }, [previewUrl]);

  // Reset state when src changes
  useEffect(() => {
    if (src) {
      setState('loading');
      setError(null);
    }
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

    // Loading or ready - show iframe (with skeleton overlay when loading)
    return (
      <div className="relative" style={{ minHeight: iframeHeight }}>
        {/* Loading skeleton overlay */}
        {state === 'loading' && (
          <div className="absolute inset-0 z-10 bg-background">
            <LoadingSkeleton />
          </div>
        )}

        {/* Iframe */}
        <iframe
          ref={iframeRef}
          className={cn(
            'w-full rounded-md bg-transparent',
            state === 'loading' && 'invisible'
          )}
          src={previewUrl}
          style={{ height: iframeHeight, border: 'none' }}
          title={`Block: ${src}`}
          sandbox="allow-scripts allow-same-origin"
          onError={handleError}
        />
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
