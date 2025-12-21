/**
 * HotSwapContainer - Animated transition from skeleton to RSC content
 *
 * This component manages the visual transition when RSC content arrives:
 * 1. Initially shows skeleton (based on AST structure)
 * 2. When RSC content is ready, fades out skeleton and fades in RSC
 * 3. Preserves layout dimensions during swap to prevent layout shift
 *
 * The swap is done by matching data-skeleton-id with data-node-id attributes.
 */

import type * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

interface HotSwapContainerProps {
  /** Skeleton content generated from AST */
  skeleton: React.ReactNode;
  /** RSC-rendered content (may be null while loading) */
  rscElement: React.ReactNode;
  /** Is RSC content currently loading */
  isLoading: boolean;
  /** Minimum height to prevent collapse during swap */
  minHeight?: number;
  /** Called when swap animation completes */
  onSwapComplete?: () => void;
}

type SwapState = "skeleton" | "swapping" | "rsc";

export function HotSwapContainer({
  skeleton,
  rscElement,
  isLoading,
  minHeight = 100,
  onSwapComplete,
}: HotSwapContainerProps) {
  const [swapState, setSwapState] = useState<SwapState>("skeleton");
  const [capturedHeight, setCapturedHeight] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const skeletonRef = useRef<HTMLDivElement>(null);

  // Capture skeleton height before swapping
  const captureHeight = useCallback(() => {
    if (skeletonRef.current) {
      const rect = skeletonRef.current.getBoundingClientRect();
      setCapturedHeight(rect.height);
    }
  }, []);

  // Handle RSC content arrival
  useEffect(() => {
    if (rscElement && !isLoading && swapState === "skeleton") {
      // Capture current height before swapping
      captureHeight();
      // Start swap animation
      setSwapState("swapping");

      // Complete swap after animation
      const timer = setTimeout(() => {
        setSwapState("rsc");
        setCapturedHeight(null);
        onSwapComplete?.();
      }, 200); // Match CSS transition duration

      return () => clearTimeout(timer);
    }
  }, [rscElement, isLoading, swapState, captureHeight, onSwapComplete]);

  // Reset to skeleton when loading starts again
  useEffect(() => {
    if (isLoading && swapState === "rsc") {
      setSwapState("skeleton");
    }
  }, [isLoading, swapState]);

  // Determine container style
  const containerStyle: React.CSSProperties = {
    minHeight: capturedHeight || minHeight,
    position: "relative",
  };

  return (
    <div ref={containerRef} style={containerStyle} className="hot-swap-container">
      {/* Skeleton layer */}
      <div
        ref={skeletonRef}
        className={`hot-swap-skeleton transition-opacity duration-200 ${
          swapState === "skeleton"
            ? "opacity-100"
            : "opacity-0 pointer-events-none absolute inset-0"
        }`}
      >
        {skeleton}
      </div>

      {/* RSC layer */}
      {rscElement && (
        <div
          className={`hot-swap-rsc transition-opacity duration-200 ${
            swapState === "rsc" ? "opacity-100" : "opacity-0"
          } ${swapState === "swapping" ? "absolute inset-0" : ""}`}
        >
          {rscElement}
        </div>
      )}
    </div>
  );
}

/**
 * Hook to track RSC render and manage hot-swap state
 */
export function useHotSwap() {
  const [renderKey, setRenderKey] = useState(0);
  const [isSwapping, setIsSwapping] = useState(false);

  const triggerRefresh = useCallback(() => {
    setIsSwapping(true);
    setRenderKey((k) => k + 1);
  }, []);

  const onSwapComplete = useCallback(() => {
    setIsSwapping(false);
  }, []);

  return {
    renderKey,
    isSwapping,
    triggerRefresh,
    onSwapComplete,
  };
}

/**
 * Find matching RSC element by node ID in rendered DOM
 *
 * This scans the RSC-rendered DOM for elements with data-node-id
 * and builds a map for efficient lookup.
 */
export function buildNodeIdMap(container: HTMLElement): Map<string, HTMLElement> {
  const map = new Map<string, HTMLElement>();
  const elements = container.querySelectorAll("[data-node-id]");

  elements.forEach((el) => {
    const nodeId = el.getAttribute("data-node-id");
    if (nodeId) {
      map.set(nodeId, el as HTMLElement);
    }
  });

  return map;
}

/**
 * Match skeleton elements to RSC elements by ID
 *
 * Returns pairs of (skeletonEl, rscEl) for each matched node.
 */
export function matchSkeletonToRsc(
  skeletonContainer: HTMLElement,
  rscContainer: HTMLElement,
): Array<{ skeletonEl: HTMLElement; rscEl: HTMLElement; nodeId: string }> {
  const matches: Array<{ skeletonEl: HTMLElement; rscEl: HTMLElement; nodeId: string }> = [];

  const skeletonElements = skeletonContainer.querySelectorAll("[data-skeleton-id]");
  const rscMap = buildNodeIdMap(rscContainer);

  skeletonElements.forEach((skeletonEl) => {
    const nodeId = skeletonEl.getAttribute("data-skeleton-id");
    if (nodeId) {
      const rscEl = rscMap.get(nodeId);
      if (rscEl) {
        matches.push({
          skeletonEl: skeletonEl as HTMLElement,
          rscEl,
          nodeId,
        });
      }
    }
  });

  return matches;
}
