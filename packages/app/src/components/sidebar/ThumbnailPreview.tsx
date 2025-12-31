/**
 * ThumbnailPreview - Shows a thumbnail preview for pages
 *
 * Used in:
 * - HoverCard content for sidebar items
 * - Loading states as LQIP placeholder
 */

import { useThumbnail } from "@/hooks/useThumbnails";
import { cn } from "@/lib/utils";

interface ThumbnailPreviewProps {
  type: "page";
  contentId: string;
  /** Additional CSS classes */
  className?: string;
}

export function ThumbnailPreview({ type, contentId, className }: ThumbnailPreviewProps) {
  const { data: thumbnail } = useThumbnail(type, contentId);

  // Only called when thumbnail exists (parent checks), but guard anyway
  if (!thumbnail?.thumbnail) {
    return null;
  }

  // Render thumbnail - cropped to show top content (title area)
  return (
    <img
      src={thumbnail.thumbnail}
      alt="Page preview"
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
export function useThumbnailAvailable(type: "page", contentId: string | undefined) {
  const { data: thumbnail } = useThumbnail(type, contentId);
  return !!thumbnail?.thumbnail;
}
