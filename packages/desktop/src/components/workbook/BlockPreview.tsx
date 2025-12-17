/**
 * BlockPreview - Lightweight block preview in iframe
 *
 * Renders a block via runtime's /preview/{blockId} endpoint.
 * No editor overhead - just SSR'd block with theme sync and react-grab.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { PORTS } from '@/lib/ports';

type PreviewState = 'loading' | 'error' | 'ready';

// CSS variables to sync to iframe
const THEME_VARS = [
  '--background', '--foreground', '--card', '--card-foreground',
  '--popover', '--popover-foreground', '--primary', '--primary-foreground',
  '--secondary', '--secondary-foreground', '--muted', '--muted-foreground',
  '--accent', '--accent-foreground', '--destructive', '--destructive-foreground',
  '--border', '--input', '--ring', '--radius',
  '--brand', '--brand-foreground', '--brand-10', '--brand-15', '--brand-25',
  '--brand-50', '--brand-80', '--brand-90', '--highlight',
];

function getThemeCSS(): string {
  const computed = getComputedStyle(document.documentElement);
  const vars: string[] = [];

  for (const name of THEME_VARS) {
    const value = computed.getPropertyValue(name).trim();
    if (value) vars.push(`${name}:${value}`);
  }

  return `:root{${vars.join(';')}}`;
}

interface BlockPreviewProps {
  blockId: string;
  className?: string;
  /** Called when react-grab copies element context */
  onGrabContext?: (content: string) => void;
  /** Called when react-grab state changes */
  onGrabStateChange?: (isActive: boolean) => void;
}

export function BlockPreview({
  blockId,
  className,
  onGrabContext,
  onGrabStateChange,
}: BlockPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<PreviewState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [height, setHeight] = useState(200);
  const readyRef = useRef(false);

  const previewUrl = `http://localhost:${PORTS.WORKER}/preview/${blockId}`;

  // Send theme to iframe
  const sendTheme = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    const css = getThemeCSS();
    const isDark = document.documentElement.classList.contains('dark');
    iframe.contentWindow.postMessage({ type: 'theme', css, isDark }, '*');
  }, []);

  // Activate react-grab in iframe
  const activateGrab = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({ type: 'grab-activate' }, '*');
  }, []);

  // Deactivate react-grab in iframe
  const deactivateGrab = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.postMessage({ type: 'grab-deactivate' }, '*');
  }, []);

  // Listen for messages from iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.source !== iframeRef.current?.contentWindow) return;

      // Sandbox ready
      if (e.data?.type === 'sandbox-ready' && !readyRef.current) {
        readyRef.current = true;
        sendTheme();
        const h = typeof e.data.height === 'number' && e.data.height > 0 ? e.data.height : 200;
        setHeight(h);
        setState('ready');
      }

      // Resize
      if (e.data?.type === 'sandbox-resize') {
        if (typeof e.data.height === 'number' && e.data.height > 0) {
          setHeight(e.data.height);
        }
      }

      // Error
      if (e.data?.type === 'sandbox-error') {
        console.error('[BlockPreview] Error from iframe:', e.data.error);
        setError(e.data.error?.message || 'Unknown error in block');
        setState('error');
      }

      // React-grab context captured
      if (e.data?.type === 'grab-context') {
        onGrabContext?.(e.data.content);
      }

      // React-grab state change
      if (e.data?.type === 'grab-state') {
        onGrabStateChange?.(e.data.isActive);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [sendTheme, onGrabContext, onGrabStateChange]);

  // Fallback timeout for ready
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!readyRef.current) {
        readyRef.current = true;
        sendTheme();
        setState('ready');
      }
    }, 3000);

    return () => clearTimeout(timeout);
  }, [sendTheme]);

  // Sync theme changes
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

  // Error state
  if (state === 'error' && error) {
    return (
      <div className={cn('flex items-center justify-center bg-background', className)}>
        <div className="text-center p-8">
          <p className="text-sm font-medium text-destructive">Failed to load block</p>
          <p className="text-xs text-muted-foreground mt-1">{error}</p>
          <button
            type="button"
            onClick={() => {
              readyRef.current = false;
              setState('loading');
              setError(null);
            }}
            className="mt-3 px-3 py-1.5 text-sm bg-muted hover:bg-muted/80 rounded-md transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('relative bg-background', className)}>
      {/* Loading overlay */}
      {state === 'loading' && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
            <span className="text-sm font-medium">Loading block...</span>
          </div>
        </div>
      )}

      {/* Preview iframe */}
      <iframe
        ref={iframeRef}
        src={previewUrl}
        className={cn(
          'w-full bg-transparent transition-opacity duration-75',
          state === 'ready' ? 'opacity-100' : 'opacity-0'
        )}
        style={{ height, border: 'none' }}
        title={`Block: ${blockId}`}
        sandbox="allow-scripts allow-same-origin"
        onError={() => {
          setError('Failed to load block');
          setState('error');
        }}
      />
    </div>
  );
}
