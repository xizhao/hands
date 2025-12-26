/**
 * PreviewButton - Opens current page in browser
 *
 * Shows local preview URL with copy and open actions.
 * Used by page routes to inject into the header.
 */

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useRuntimeState } from "@/hooks/useRuntimeState";
import { cn } from "@/lib/utils";
import { ArrowSquareOut, Copy, Globe } from "@phosphor-icons/react";

interface PreviewButtonProps {
  /** Page route to append to base URL (e.g., "/dashboard") */
  pageRoute?: string;
}

export function PreviewButton({ pageRoute = "" }: PreviewButtonProps) {
  const { port: runtimePort } = useRuntimeState();

  const previewUrl = runtimePort
    ? `http://localhost:${runtimePort}${pageRoute}`
    : null;
  const displayUrl = runtimePort
    ? `localhost:${runtimePort}${pageRoute}`
    : null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "px-2 py-1 rounded-md text-[12px] font-medium transition-colors",
            runtimePort
              ? "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
          )}
        >
          {runtimePort ? (
            <span className="flex items-center gap-1">
              <Globe weight="duotone" className="h-3.5 w-3.5" />
              Preview
            </span>
          ) : (
            "Preview"
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="space-y-3">
          {runtimePort && previewUrl ? (
            <>
              <div>
                <div className="text-sm font-medium mb-1">Local preview</div>
                <p className="text-xs text-muted-foreground">
                  Open this page in your browser
                </p>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 px-2 py-1.5 text-xs font-mono bg-muted rounded-md truncate">
                  {displayUrl}
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(previewUrl);
                      }}
                      className="p-1.5 rounded-md hover:bg-accent transition-colors"
                    >
                      <Copy
                        weight="duotone"
                        className="h-3.5 w-3.5 text-muted-foreground"
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Copy link</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => {
                        window.open(previewUrl, "_blank");
                      }}
                      className="p-1.5 rounded-md hover:bg-accent transition-colors"
                    >
                      <ArrowSquareOut
                        weight="duotone"
                        className="h-3.5 w-3.5 text-muted-foreground"
                      />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>Open in browser</TooltipContent>
                </Tooltip>
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground">
              Start the runtime to preview your workbook
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
