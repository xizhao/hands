/**
 * NavigateCard - Clickable card to navigate to pages
 *
 * Rendered when the agent uses the navigate tool to guide users
 * to a specific page in the workbook.
 */

import { memo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui";

export interface NavigateOutput {
  type: "navigate";
  page: string;
  title?: string;
  description?: string;
  anchor?: string;
}

/**
 * Parse navigate tool output
 */
export function parseNavigateOutput(output: string): NavigateOutput | null {
  try {
    const parsed = JSON.parse(output);
    if (parsed?.type === "navigate" && parsed.page) {
      return parsed as NavigateOutput;
    }
  } catch {
    // Not JSON or not a navigate output
  }
  return null;
}

interface NavigateCardProps {
  output: NavigateOutput;
}

export const NavigateCard = memo(({ output }: NavigateCardProps) => {
  const navigate = useNavigate();
  const { setActivePage } = useUIStore();

  const handleClick = () => {
    // Navigate to the page route
    // Pages are at /page/:pageId where pageId is derived from the route
    const pageId = output.page.replace(/^\//, "").replace(/\//g, "-") || "index";
    setActivePage(pageId);
    navigate({ to: "/page/$pageId", params: { pageId } });
  };

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      onClick={handleClick}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-xl",
        "bg-gradient-to-r from-blue-500/10 to-purple-500/10",
        "border border-blue-500/20 hover:border-blue-500/40",
        "transition-all duration-200 hover:scale-[1.02]",
        "text-left group"
      )}
    >
      {/* Icon */}
      <div className={cn(
        "shrink-0 w-10 h-10 rounded-lg flex items-center justify-center",
        "bg-gradient-to-br from-blue-500/20 to-purple-500/20",
        "group-hover:from-blue-500/30 group-hover:to-purple-500/30",
        "transition-colors"
      )}>
        <FileText className="h-5 w-5 text-blue-400" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm text-foreground truncate">
          {output.title || output.page}
        </div>
        {output.description && (
          <div className="text-xs text-muted-foreground/70 truncate mt-0.5">
            {output.description}
          </div>
        )}
        <div className="text-[10px] text-muted-foreground/50 mt-1 flex items-center gap-1">
          <span className="uppercase tracking-wider">Page</span>
          {output.anchor && (
            <>
              <span>·</span>
              <span>{output.anchor}</span>
            </>
          )}
        </div>
      </div>

      {/* Arrow */}
      <div className={cn(
        "shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
        "bg-blue-500/10 group-hover:bg-blue-500/20",
        "transition-colors"
      )}>
        <ArrowRight className="h-4 w-4 text-blue-400 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </motion.button>
  );
});

NavigateCard.displayName = "NavigateCard";
