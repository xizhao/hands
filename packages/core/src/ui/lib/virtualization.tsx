"use client";

/**
 * Viewport Virtualization System
 *
 * Provides efficient rendering of expensive components by deferring their
 * initialization until they enter the viewport. Uses a shared IntersectionObserver
 * for performance with many virtualized components.
 *
 * @example
 * ```tsx
 * // Wrap expensive component
 * <Virtualized height={300} placeholder="chart">
 *   <ExpensiveChart data={data} />
 * </Virtualized>
 *
 * // With render function (deferred instantiation)
 * <Virtualized height={300} placeholder="chart">
 *   {() => <ExpensiveChart data={data} />}
 * </Virtualized>
 *
 * // Custom placeholder
 * <Virtualized
 *   height={300}
 *   placeholder={<CustomSkeleton />}
 * >
 *   <ExpensiveChart data={data} />
 * </Virtualized>
 *
 * // Using the hook directly
 * function MyComponent() {
 *   const { ref, isVisible } = useViewportVisibility({ margin: "200px" });
 *   if (!isVisible) return <Placeholder ref={ref} />;
 *   return <ExpensiveContent />;
 * }
 * ```
 */

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
  type RefObject,
} from "react";

// ============================================================================
// Shared Observer Manager
// ============================================================================

type ObserverCallback = (isIntersecting: boolean) => void;

/**
 * Manages a single shared IntersectionObserver for all virtualized components.
 * Much more efficient than creating one observer per component.
 */
class ViewportObserverManager {
  private observer: IntersectionObserver | null = null;
  private callbacks = new Map<Element, ObserverCallback>();
  private rootMargin: string;

  constructor(rootMargin = "200px") {
    this.rootMargin = rootMargin;
  }

  private ensureObserver() {
    if (this.observer) return;

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const callback = this.callbacks.get(entry.target);
          callback?.(entry.isIntersecting);
        }
      },
      { rootMargin: this.rootMargin }
    );
  }

  observe(element: Element, callback: ObserverCallback) {
    this.ensureObserver();
    this.callbacks.set(element, callback);
    this.observer!.observe(element);
  }

  unobserve(element: Element) {
    this.callbacks.delete(element);
    this.observer?.unobserve(element);

    // Clean up observer if no more elements
    if (this.callbacks.size === 0 && this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

// Singleton instances for different margins
const observerManagers = new Map<string, ViewportObserverManager>();

function getObserverManager(margin: string): ViewportObserverManager {
  if (!observerManagers.has(margin)) {
    observerManagers.set(margin, new ViewportObserverManager(margin));
  }
  return observerManagers.get(margin)!;
}

// ============================================================================
// Hook: useViewportVisibility
// ============================================================================

export interface UseViewportVisibilityOptions {
  /** Margin around viewport to trigger visibility (default: "200px") */
  margin?: string;
  /** Once visible, stay visible even when scrolled away (default: true) */
  sticky?: boolean;
  /** Initial visibility state (default: false) */
  initialVisible?: boolean;
}

export interface UseViewportVisibilityResult {
  /** Ref to attach to the placeholder/container element */
  ref: RefObject<HTMLDivElement | null>;
  /** Whether the element is (or has been) visible */
  isVisible: boolean;
  /** Whether currently intersecting (only different from isVisible when sticky=true) */
  isIntersecting: boolean;
}

/**
 * Hook that tracks whether an element is in or near the viewport.
 * Uses a shared IntersectionObserver for efficiency.
 */
export function useViewportVisibility(
  options: UseViewportVisibilityOptions = {}
): UseViewportVisibilityResult {
  const { margin = "200px", sticky = true, initialVisible = false } = options;

  const ref = useRef<HTMLDivElement>(null);
  const [isIntersecting, setIsIntersecting] = useState(initialVisible);
  const [hasBeenVisible, setHasBeenVisible] = useState(initialVisible);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    // If sticky and already visible, don't need to observe
    if (sticky && hasBeenVisible) return;

    const manager = getObserverManager(margin);

    const callback: ObserverCallback = (intersecting) => {
      setIsIntersecting(intersecting);
      if (intersecting) {
        setHasBeenVisible(true);
        // If sticky, unobserve after first visibility
        if (sticky) {
          manager.unobserve(element);
        }
      }
    };

    manager.observe(element, callback);
    return () => manager.unobserve(element);
  }, [margin, sticky, hasBeenVisible]);

  return {
    ref,
    isVisible: sticky ? hasBeenVisible : isIntersecting,
    isIntersecting,
  };
}

// ============================================================================
// Placeholder Components
// ============================================================================

export type PlaceholderType = "chart" | "table" | "editor" | "image" | "generic";

interface PlaceholderProps {
  type: PlaceholderType;
  height: number;
  width?: number | string;
  className?: string;
}

const placeholderLabels: Record<PlaceholderType, string> = {
  chart: "Chart",
  table: "Table",
  editor: "Editor",
  image: "Image",
  generic: "Loading...",
};

/**
 * Built-in placeholder for common component types.
 * Shows a subtle outline with type label.
 */
function DefaultPlaceholder({ type, height, width, className }: PlaceholderProps) {
  return (
    <div
      className={`
        w-full flex items-center justify-center
        bg-muted/5 rounded-lg
        border border-dashed border-muted-foreground/20
        ${className ?? ""}
      `}
      style={{ height, width }}
    >
      <span className="text-muted-foreground/40 text-xs font-medium">
        {placeholderLabels[type]}
      </span>
    </div>
  );
}

// ============================================================================
// Virtualized Component
// ============================================================================

export interface VirtualizedProps {
  /** Content to render when visible (component or render function) */
  children: ReactNode | (() => ReactNode);
  /** Height to reserve for placeholder */
  height: number;
  /** Width to reserve (optional, defaults to 100%) */
  width?: number | string;
  /** Placeholder type or custom element */
  placeholder?: PlaceholderType | ReactNode;
  /** Margin around viewport to trigger visibility */
  margin?: string;
  /** Additional CSS classes for container */
  className?: string;
  /** Whether to keep content mounted after scrolling away (default: true) */
  keepMounted?: boolean;
}

/**
 * Wraps expensive components to defer rendering until visible.
 *
 * Shows a lightweight placeholder until the component scrolls into
 * (or near) the viewport, then renders the actual content.
 *
 * Uses a shared IntersectionObserver for efficiency with many
 * virtualized components on the page.
 */
export function Virtualized({
  children,
  height,
  width,
  placeholder = "generic",
  margin = "200px",
  className,
  keepMounted = true,
}: VirtualizedProps) {
  const { ref, isVisible } = useViewportVisibility({
    margin,
    sticky: keepMounted,
  });

  // Render placeholder when not visible
  if (!isVisible) {
    const placeholderElement =
      typeof placeholder === "string" ? (
        <DefaultPlaceholder
          type={placeholder as PlaceholderType}
          height={height}
          width={width}
          className={className}
        />
      ) : (
        placeholder
      );

    return (
      <div ref={ref} style={{ height, width }} className={className}>
        {placeholderElement}
      </div>
    );
  }

  // Render actual content
  const content = typeof children === "function" ? children() : children;

  return (
    <div style={{ minHeight: height, width }} className={className}>
      {content}
    </div>
  );
}

// ============================================================================
// Context for nested virtualization awareness
// ============================================================================

interface VirtualizationContextValue {
  /** Whether we're inside a virtualized container */
  isVirtualized: boolean;
  /** Whether the parent virtualized container is visible */
  parentVisible: boolean;
}

const VirtualizationContext = createContext<VirtualizationContextValue>({
  isVirtualized: false,
  parentVisible: true,
});

/**
 * Hook to check if we're inside a virtualized container.
 * Useful for components that need to know their virtualization state.
 */
export function useVirtualizationContext() {
  return useContext(VirtualizationContext);
}

// ============================================================================
// Utility: createVirtualized HOC
// ============================================================================

export interface VirtualizedComponentOptions {
  /** Default height for placeholder */
  defaultHeight?: number;
  /** Placeholder type */
  placeholderType?: PlaceholderType;
  /** Viewport margin */
  margin?: string;
}

/**
 * Creates a virtualized version of a component.
 *
 * @example
 * ```tsx
 * const VirtualizedChart = createVirtualized(ExpensiveChart, {
 *   defaultHeight: 300,
 *   placeholderType: "chart",
 * });
 *
 * // Use like the original, but with automatic virtualization
 * <VirtualizedChart data={data} height={400} />
 * ```
 */
export function createVirtualized<P extends { height?: number }>(
  Component: React.ComponentType<P>,
  options: VirtualizedComponentOptions = {}
) {
  const {
    defaultHeight = 200,
    placeholderType = "generic",
    margin = "200px",
  } = options;

  function VirtualizedComponent(props: P) {
    const height = props.height ?? defaultHeight;

    return (
      <Virtualized
        height={height}
        placeholder={placeholderType}
        margin={margin}
      >
        {() => <Component {...props} />}
      </Virtualized>
    );
  }

  VirtualizedComponent.displayName = `Virtualized(${Component.displayName ?? Component.name ?? "Component"})`;

  return VirtualizedComponent;
}

// ============================================================================
// Exports
// ============================================================================

export { DefaultPlaceholder };
