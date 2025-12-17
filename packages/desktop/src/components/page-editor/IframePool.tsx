/**
 * IframePool - Keeps iframes alive outside Plate's render tree
 *
 * Problem: When Plate re-renders the document tree, React unmounts/remounts
 * components even if memoized, causing iframes to reload.
 *
 * Solution: Render iframes in a portal outside Plate, position them over
 * placeholder elements using absolute positioning. Iframes persist across
 * Plate re-renders.
 */

import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { BlockIframe, type BlockIframeProps, getThemeVariables } from './SandboxedBlock';
import { PORTS } from '@/lib/ports';

// ============================================================================
// Types
// ============================================================================

interface IframeRegistration {
  id: string;
  src: string;
  placeholderRef: React.RefObject<HTMLDivElement>;
  onReady: (height: number) => void;
  onResize: (height: number) => void;
  onError: (error: string) => void;
}

interface IframeState {
  id: string;
  src: string;
  height: number;
  isLoading: boolean;
  isGrabActive: boolean;
  rect: DOMRect | null;
}

interface IframePoolContextValue {
  register: (reg: IframeRegistration) => void;
  unregister: (id: string) => void;
  setGrabActive: (id: string, active: boolean) => void;
  updateRect: (id: string) => void;
}

const IframePoolContext = createContext<IframePoolContextValue | null>(null);

// ============================================================================
// Hook for consumers
// ============================================================================

export function useIframePool() {
  const ctx = useContext(IframePoolContext);
  if (!ctx) {
    throw new Error('useIframePool must be used within IframePoolProvider');
  }
  return ctx;
}

// ============================================================================
// Provider Component
// ============================================================================

interface IframePoolProviderProps {
  children: ReactNode;
}

export function IframePoolProvider({ children }: IframePoolProviderProps) {
  const [iframes, setIframes] = useState<Map<string, IframeState>>(new Map());
  const registrations = useRef<Map<string, IframeRegistration>>(new Map());
  const portalContainer = useRef<HTMLDivElement | null>(null);

  // Create portal container on mount
  useEffect(() => {
    const container = document.createElement('div');
    container.id = 'iframe-pool-portal';
    container.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;pointer-events:none;z-index:10;';
    document.body.appendChild(container);
    portalContainer.current = container;

    return () => {
      document.body.removeChild(container);
    };
  }, []);

  // Update positions on scroll/resize
  useEffect(() => {
    const updateAllRects = () => {
      setIframes(prev => {
        const next = new Map(prev);
        for (const [id, state] of next) {
          const reg = registrations.current.get(id);
          if (reg?.placeholderRef.current) {
            const rect = reg.placeholderRef.current.getBoundingClientRect();
            next.set(id, { ...state, rect });
          }
        }
        return next;
      });
    };

    window.addEventListener('scroll', updateAllRects, true);
    window.addEventListener('resize', updateAllRects);

    // Also update on RAF for smooth tracking
    let rafId: number;
    const rafUpdate = () => {
      updateAllRects();
      rafId = requestAnimationFrame(rafUpdate);
    };
    rafId = requestAnimationFrame(rafUpdate);

    return () => {
      window.removeEventListener('scroll', updateAllRects, true);
      window.removeEventListener('resize', updateAllRects);
      cancelAnimationFrame(rafId);
    };
  }, []);

  const register = useCallback((reg: IframeRegistration) => {
    registrations.current.set(reg.id, reg);

    const rect = reg.placeholderRef.current?.getBoundingClientRect() ?? null;

    setIframes(prev => {
      const next = new Map(prev);
      // Check if we already have this iframe (persisted across remounts)
      const existing = next.get(reg.id);
      if (existing) {
        // Update rect but keep other state
        next.set(reg.id, { ...existing, rect });
      } else {
        // New iframe
        next.set(reg.id, {
          id: reg.id,
          src: reg.src,
          height: 100,
          isLoading: true,
          isGrabActive: false,
          rect,
        });
      }
      return next;
    });
  }, []);

  const unregister = useCallback((id: string) => {
    registrations.current.delete(id);
    // Don't remove from iframes - keep it alive for potential remount
    // Only remove rect so it's not rendered
    setIframes(prev => {
      const next = new Map(prev);
      const existing = next.get(id);
      if (existing) {
        next.set(id, { ...existing, rect: null });
      }
      return next;
    });
  }, []);

  const setGrabActive = useCallback((id: string, active: boolean) => {
    setIframes(prev => {
      const next = new Map(prev);
      const existing = next.get(id);
      if (existing) {
        next.set(id, { ...existing, isGrabActive: active });
      }
      return next;
    });
  }, []);

  const updateRect = useCallback((id: string) => {
    const reg = registrations.current.get(id);
    if (!reg?.placeholderRef.current) return;

    const rect = reg.placeholderRef.current.getBoundingClientRect();
    setIframes(prev => {
      const next = new Map(prev);
      const existing = next.get(id);
      if (existing) {
        next.set(id, { ...existing, rect });
      }
      return next;
    });
  }, []);

  const handleReady = useCallback((id: string, height: number) => {
    const reg = registrations.current.get(id);
    reg?.onReady(height);

    setIframes(prev => {
      const next = new Map(prev);
      const existing = next.get(id);
      if (existing) {
        next.set(id, { ...existing, height, isLoading: false });
      }
      return next;
    });
  }, []);

  const handleResize = useCallback((id: string, height: number) => {
    const reg = registrations.current.get(id);
    reg?.onResize(height);

    setIframes(prev => {
      const next = new Map(prev);
      const existing = next.get(id);
      if (existing) {
        next.set(id, { ...existing, height });
      }
      return next;
    });
  }, []);

  const handleError = useCallback((id: string, error: string) => {
    const reg = registrations.current.get(id);
    reg?.onError(error);
  }, []);

  const contextValue: IframePoolContextValue = {
    register,
    unregister,
    setGrabActive,
    updateRect,
  };

  return (
    <IframePoolContext.Provider value={contextValue}>
      {children}
      {/* Render iframes in portal */}
      {portalContainer.current && createPortal(
        <>
          {Array.from(iframes.values()).map(iframe => {
            // Only render if we have a valid rect (placeholder is mounted)
            if (!iframe.rect) return null;

            const previewUrl = `http://localhost:${PORTS.WORKER}/preview/${iframe.src}`;

            return (
              <div
                key={iframe.id}
                style={{
                  position: 'fixed',
                  top: iframe.rect.top,
                  left: iframe.rect.left,
                  width: iframe.rect.width,
                  height: iframe.height,
                  pointerEvents: 'auto',
                }}
              >
                <BlockIframe
                  src={iframe.src}
                  previewUrl={previewUrl}
                  height={iframe.height}
                  isLoading={iframe.isLoading}
                  isGrabActive={iframe.isGrabActive}
                  onReady={(h) => handleReady(iframe.id, h)}
                  onResize={(h) => handleResize(iframe.id, h)}
                  onError={(e) => handleError(iframe.id, e)}
                />
              </div>
            );
          })}
        </>,
        portalContainer.current
      )}
    </IframePoolContext.Provider>
  );
}
