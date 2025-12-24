import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Centralized typography sizes for message rendering.
 * All message content should use these values for consistency.
 */
export const MSG_FONT = {
  // Base text size for message content (prose, paragraphs)
  base: "text-[13px]",
  baseCompact: "text-[12px]",

  // Inline code, file names, commands
  code: "text-[12px]",
  codeCompact: "text-[11px]",

  // Code blocks (syntax highlighted)
  codeBlock: "12px",
  codeBlockCompact: "11px",

  // Tool labels, subtitles, metadata
  label: "text-[11px]",
  labelCompact: "text-[10px]",

  // Tiny metadata (row counts, timestamps)
  meta: "text-[10px]",
  metaCompact: "text-[9px]",
} as const;
