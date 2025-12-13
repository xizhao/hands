/**
 * BlockEditLink - Shows a clickable link when edit/write tool modifies a block
 *
 * Detects block paths (contains /blocks/) and shows "Edit Block" link
 */

import { useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { memo } from "react";
import { cn } from "@/lib/utils";

/**
 * Parse a file path to extract block info if it's a block file
 * Block paths contain /blocks/ and end with .tsx
 */
export function parseBlockPath(filePath: string): { blockId: string; filename: string } | null {
  if (!filePath) return null;

  // Check if path contains /blocks/
  const blocksIndex = filePath.indexOf("/blocks/");
  if (blocksIndex === -1) return null;

  // Extract everything after /blocks/
  const afterBlocks = filePath.slice(blocksIndex + "/blocks/".length);

  // Get the filename without extension
  const parts = afterBlocks.split("/");
  const filename = parts[parts.length - 1];

  // Remove .tsx extension if present
  const blockId = filename.replace(/\.tsx$/, "");

  if (!blockId) return null;

  return { blockId, filename };
}

interface BlockEditLinkProps {
  blockId: string;
  filename: string;
}

export const BlockEditLink = memo(({ blockId, filename }: BlockEditLinkProps) => {
  const navigate = useNavigate();

  const handleClick = () => {
    navigate({ to: "/blocks/$blockId", params: { blockId } });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1 text-xs mt-1",
        "text-blue-400 hover:text-blue-300",
        "hover:underline transition-colors",
      )}
    >
      <span>Edit {filename}</span>
      <ArrowRight className="h-3 w-3" />
    </button>
  );
});

BlockEditLink.displayName = "BlockEditLink";
