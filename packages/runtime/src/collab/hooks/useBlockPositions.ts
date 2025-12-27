import { useState, useEffect, useCallback } from "react";

export interface BlockPosition {
  index: number;
  elementId: string | null; // Stable Plate element ID
  top: number;
  height: number;
}

/**
 * Track DOM positions of editor blocks for comment margin placement.
 * Uses Plate's stable element IDs (data-block-id) for reliable anchoring.
 */
export function useBlockPositions() {
  const [positions, setPositions] = useState<BlockPosition[]>([]);

  const updatePositions = useCallback(() => {
    // Find the prose container (PlateStatic output)
    const proseContainer = document.querySelector("article.prose");
    if (!proseContainer) {
      console.debug("[useBlockPositions] No prose container found");
      return;
    }

    // Find the inner wrapper or use prose directly
    const innerContainer = proseContainer.querySelector(".mx-auto.max-w-4xl") || proseContainer;

    // Get all elements with data-block-id (Plate elements with stable IDs)
    const blocksWithIds = innerContainer.querySelectorAll("[data-block-id]");

    // Fallback to semantic elements if no data-block-id found
    const blocks = blocksWithIds.length > 0
      ? blocksWithIds
      : innerContainer.querySelectorAll(
          ":scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > ul, :scope > ol, :scope > blockquote, :scope > pre, :scope > figure, :scope > table, :scope > div:not(.mx-auto)"
        );

    const newPositions: BlockPosition[] = [];

    blocks.forEach((el, index) => {
      const rect = el.getBoundingClientRect();
      const elementId = el.getAttribute("data-block-id");

      // Use document-relative position (viewport + scroll)
      newPositions.push({
        index,
        elementId,
        top: rect.top + window.scrollY,
        height: rect.height,
      });
    });

    console.debug(`[useBlockPositions] Found ${newPositions.length} blocks (${blocksWithIds.length} with IDs)`);
    setPositions(newPositions);
  }, []);

  useEffect(() => {
    // Initial update - small delay to ensure DOM is fully rendered
    const initialTimeout = setTimeout(updatePositions, 100);
    // Second update after hydration
    const secondTimeout = setTimeout(updatePositions, 500);

    // Update on resize
    const resizeObserver = new ResizeObserver(updatePositions);
    const container = document.querySelector("article.prose");
    if (container) {
      resizeObserver.observe(container);
    }

    // Update on scroll
    window.addEventListener("scroll", updatePositions, { passive: true });

    // Update periodically in case content changes
    const interval = setInterval(updatePositions, 2000);

    return () => {
      clearTimeout(initialTimeout);
      clearTimeout(secondTimeout);
      resizeObserver.disconnect();
      window.removeEventListener("scroll", updatePositions);
      clearInterval(interval);
    };
  }, [updatePositions]);

  return positions;
}
