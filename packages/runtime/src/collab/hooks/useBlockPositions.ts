import { useState, useEffect, useCallback } from "react";

export interface BlockPosition {
  index: number;
  top: number;
  height: number;
}

/**
 * Track DOM positions of editor blocks for comment margin placement.
 */
export function useBlockPositions() {
  const [positions, setPositions] = useState<BlockPosition[]>([]);

  const updatePositions = useCallback(() => {
    // Find all top-level block elements in the page content
    const container = document.querySelector("[data-slate-editor]") || document.querySelector(".prose");
    if (!container) return;

    const blocks = container.querySelectorAll(
      ":scope > [data-slate-node='element'], :scope > p, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > ul, :scope > ol, :scope > blockquote, :scope > pre, :scope > div"
    );

    const containerRect = container.getBoundingClientRect();
    const newPositions: BlockPosition[] = [];

    blocks.forEach((el, index) => {
      const rect = el.getBoundingClientRect();
      newPositions.push({
        index,
        top: rect.top - containerRect.top + container.scrollTop,
        height: rect.height,
      });
    });

    setPositions(newPositions);
  }, []);

  useEffect(() => {
    // Initial update
    updatePositions();

    // Update on resize
    const resizeObserver = new ResizeObserver(updatePositions);
    const container = document.querySelector("[data-slate-editor]") || document.querySelector(".prose");
    if (container) {
      resizeObserver.observe(container);
    }

    // Update on scroll
    window.addEventListener("scroll", updatePositions, { passive: true });

    // Update periodically in case content changes
    const interval = setInterval(updatePositions, 2000);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", updatePositions);
      clearInterval(interval);
    };
  }, [updatePositions]);

  return positions;
}
