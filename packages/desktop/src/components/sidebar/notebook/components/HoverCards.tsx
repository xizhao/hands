/**
 * HoverCards - Preview components for sidebar items
 *
 * Shows thumbnail or table previews on hover.
 */

import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { useThumbnail } from "@/hooks/useThumbnails";
import { useTablePreview } from "@/hooks/useTablePreview";
import { ThumbnailPreview } from "../../ThumbnailPreview";
import { TablePreview } from "../../TablePreview";

interface ThumbnailHoverCardProps {
  type: "page";
  contentId: string;
  children: React.ReactNode;
  onMouseEnter?: () => void;
}

export function ThumbnailHoverCard({
  type,
  contentId,
  children,
  onMouseEnter,
}: ThumbnailHoverCardProps) {
  const { data: thumbnail } = useThumbnail(type, contentId);

  // No thumbnail - just render children without HoverCard
  if (!thumbnail?.thumbnail) {
    return <div onMouseEnter={onMouseEnter}>{children}</div>;
  }

  return (
    <HoverCard openDelay={150} closeDelay={100}>
      <HoverCardTrigger asChild>
        <div onMouseEnter={onMouseEnter}>{children}</div>
      </HoverCardTrigger>
      <HoverCardContent side="right" sideOffset={8} className="w-auto p-1">
        <ThumbnailPreview type={type} contentId={contentId} />
      </HoverCardContent>
    </HoverCard>
  );
}

interface TablePreviewHoverCardProps {
  tableName: string;
  children: React.ReactNode;
}

export function TablePreviewHoverCard({ tableName, children }: TablePreviewHoverCardProps) {
  const { data: preview } = useTablePreview(tableName);

  // No preview data - just render children without HoverCard
  if (!preview || preview.columns.length === 0) {
    return <>{children}</>;
  }

  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent side="right" sideOffset={8} className="w-auto p-2">
        <TablePreview tableName={tableName} />
      </HoverCardContent>
    </HoverCard>
  );
}
