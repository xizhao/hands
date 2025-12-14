/**
 * ThumbnailPreview - Shows a thumbnail preview for pages/blocks
 *
 * Used in:
 * - HoverCard content for sidebar items
 * - Loading states as LQIP placeholder
 */

import { cn } from "@/lib/utils";
import { useThumbnail } from "@/hooks/useThumbnails";

interface ThumbnailPreviewProps {
  type: "page" | "block";
  contentId: string;
  /** Additional CSS classes */
  className?: string;
}

export function ThumbnailPreview({ type, contentId, className }: ThumbnailPreviewProps) {
  const { data: thumbnail, isLoading } = useThumbnail(type, contentId);

  // Loading state - show skeleton
  if (isLoading) {
    return (
      <div
        className={cn(
          "w-48 h-32 bg-muted animate-pulse rounded",
          className,
        )}
      />
    );
  }

  // No thumbnail available
  if (!thumbnail) {
    return (
      <div
        className={cn(
          "w-48 h-32 bg-muted/50 rounded flex items-center justify-center",
          className,
        )}
      >
        <span className="text-xs text-muted-foreground/50">No preview</span>
      </div>
    );
  }

  // Render thumbnail - cropped to show top content (title area)
  return (
    <img
      src={thumbnail.thumbnail}
      alt={`${type === "page" ? "Page" : "Block"} preview`}
      className={cn(
        // Fixed size, crop from top-left to show meaningful content
        "w-48 h-32 object-cover object-top rounded",
        className,
      )}
    />
  );
}

/**
 * Check if thumbnail is available (for conditional delay logic)
 */
export function useThumbnailAvailable(type: "page" | "block", contentId: string | undefined) {
  const { data: thumbnail } = useThumbnail(type, contentId);
  return !!thumbnail?.thumbnail;
}
