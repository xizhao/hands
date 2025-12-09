/**
 * EmptyWorkbookState - Stylish empty state for new workbooks
 */

import { cn } from "@/lib/utils";
import { Table, FileArrowDown, FileText } from "@phosphor-icons/react";

interface EmptyWorkbookStateProps {
  onAddSource: () => void;
  onAddPage: () => void;
  onImportFile: () => void;
}

export function EmptyWorkbookState({
  onAddSource,
  onImportFile,
  onAddPage,
}: EmptyWorkbookStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-8">
      <h2 className="text-[13px] font-medium text-foreground/80 tracking-tight mb-6">
        Get started
      </h2>

      {/* Data actions */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={onAddSource}
          className={cn(
            "group relative flex flex-col items-center justify-center gap-1.5",
            "w-28 h-24 rounded-xl",
            "bg-gradient-to-b from-muted/40 to-muted/20",
            "border border-border/40 hover:border-border/80",
            "shadow-sm hover:shadow-md",
            "transition-all duration-200 hover:-translate-y-0.5"
          )}
        >
          <Table
            weight="duotone"
            className="h-5 w-5 text-foreground/60 group-hover:text-foreground/80 transition-colors"
          />
          <span className="text-[11px] font-medium text-foreground/70 group-hover:text-foreground/90">
            Add source
          </span>
        </button>

        <button
          onClick={onImportFile}
          className={cn(
            "group relative flex flex-col items-center justify-center gap-1.5",
            "w-28 h-24 rounded-xl",
            "bg-gradient-to-b from-transparent to-muted/10",
            "border border-dashed border-border/50 hover:border-border/80",
            "hover:bg-muted/20",
            "transition-all duration-200 hover:-translate-y-0.5"
          )}
        >
          <FileArrowDown
            weight="duotone"
            className="h-5 w-5 text-foreground/60 group-hover:text-foreground/80 transition-colors"
          />
          <span className="text-[11px] font-medium text-foreground/70 group-hover:text-foreground/90">
            Drop a file
          </span>
        </button>
      </div>

      <div className="text-[11px] text-foreground/40 mb-4">or</div>

      {/* Create page */}
      <button
        onClick={onAddPage}
        className={cn(
          "group flex items-center gap-2 px-4 py-2 rounded-lg",
          "hover:bg-muted/40",
          "transition-all duration-150"
        )}
      >
        <FileText
          weight="duotone"
          className="h-4 w-4 text-foreground/50 group-hover:text-foreground/70 transition-colors"
        />
        <span className="text-[12px] text-foreground/60 group-hover:text-foreground/80">
          Create a blank page
        </span>
      </button>
    </div>
  );
}
