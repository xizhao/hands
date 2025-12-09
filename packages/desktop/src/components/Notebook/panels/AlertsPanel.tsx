/**
 * AlertsPanel - Code quality diagnostics (TypeScript errors, warnings, unused code)
 */

import { useUIStore } from "@/stores/ui";
import { useEvalResult, useRuntimeEval } from "@/hooks/useWorkbook";
import {
  Warning,
  WarningCircle,
  FileCode,
  Sparkle,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export function AlertsPanel() {
  const { activeWorkbookId } = useUIStore();
  const { data: evalResult, isLoading } = useEvalResult(activeWorkbookId);
  const runtimeEval = useRuntimeEval();

  // Compute diagnostics counts
  const tsErrors = evalResult?.typescript?.errors ?? [];
  const tsWarnings = evalResult?.typescript?.warnings ?? [];
  const formatErrors = evalResult?.format?.errors ?? [];
  const unusedExports = evalResult?.unused?.exports ?? [];
  const unusedFiles = evalResult?.unused?.files ?? [];

  const totalErrors = tsErrors.length + formatErrors.length;
  const totalWarnings = tsWarnings.length;
  const totalUnused = unusedExports.length + unusedFiles.length;
  const hasIssues = totalErrors > 0 || totalWarnings > 0 || totalUnused > 0;

  const handleRefresh = () => {
    if (activeWorkbookId) {
      runtimeEval.mutate(activeWorkbookId);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Summary header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          {totalErrors > 0 && (
            <div className="flex items-center gap-1 text-red-400">
              <WarningCircle weight="fill" className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{totalErrors}</span>
            </div>
          )}
          {totalWarnings > 0 && (
            <div className="flex items-center gap-1 text-yellow-400">
              <Warning weight="fill" className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{totalWarnings}</span>
            </div>
          )}
          {totalUnused > 0 && (
            <div className="flex items-center gap-1 text-muted-foreground">
              <FileCode weight="duotone" className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">{totalUnused}</span>
            </div>
          )}
          {!hasIssues && !isLoading && (
            <div className="flex items-center gap-1 text-green-400">
              <Sparkle weight="fill" className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">No issues</span>
            </div>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={runtimeEval.isPending}
          className={cn(
            "p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors",
            runtimeEval.isPending && "opacity-50 cursor-not-allowed"
          )}
          title="Refresh diagnostics"
        >
          <ArrowsClockwise
            weight="bold"
            className={cn("h-3.5 w-3.5", runtimeEval.isPending && "animate-spin")}
          />
        </button>
      </div>

      {/* Diagnostics list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            Loading...
          </div>
        ) : !hasIssues ? (
          <div className="p-8 text-center">
            <Sparkle weight="duotone" className="h-8 w-8 text-green-400/50 mx-auto mb-2" />
            <div className="text-sm text-muted-foreground">
              All clear! No issues detected.
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {/* TypeScript Errors */}
            {tsErrors.length > 0 && (
              <DiagnosticSection
                title="Errors"
                icon={<WarningCircle weight="fill" className="h-3.5 w-3.5 text-red-400" />}
                items={tsErrors.map((d) => ({
                  location: `${d.file}:${d.line}:${d.column}`,
                  message: d.message,
                  code: d.code,
                }))}
                variant="error"
              />
            )}

            {/* TypeScript Warnings */}
            {tsWarnings.length > 0 && (
              <DiagnosticSection
                title="Warnings"
                icon={<Warning weight="fill" className="h-3.5 w-3.5 text-yellow-400" />}
                items={tsWarnings.map((d) => ({
                  location: `${d.file}:${d.line}:${d.column}`,
                  message: d.message,
                  code: d.code,
                }))}
                variant="warning"
              />
            )}

            {/* Format Errors */}
            {formatErrors.length > 0 && (
              <DiagnosticSection
                title="Format"
                icon={<WarningCircle weight="fill" className="h-3.5 w-3.5 text-red-400" />}
                items={formatErrors.map((f) => ({
                  location: f,
                  message: "Formatting error",
                }))}
                variant="error"
              />
            )}

            {/* Unused Code */}
            {totalUnused > 0 && (
              <DiagnosticSection
                title="Unused"
                icon={<FileCode weight="duotone" className="h-3.5 w-3.5 text-muted-foreground" />}
                items={[
                  ...unusedFiles.map((f) => ({
                    location: f,
                    message: "Unused file",
                  })),
                  ...unusedExports.map((e) => ({
                    location: e,
                    message: "Unused export",
                  })),
                ]}
                variant="muted"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface DiagnosticItem {
  location: string;
  message: string;
  code?: string;
}

interface DiagnosticSectionProps {
  title: string;
  icon: React.ReactNode;
  items: DiagnosticItem[];
  variant: "error" | "warning" | "muted";
}

function DiagnosticSection({ title, icon, items, variant }: DiagnosticSectionProps) {
  const messageColor = {
    error: "text-red-400",
    warning: "text-yellow-400",
    muted: "text-muted-foreground",
  }[variant];

  return (
    <div className="py-2">
      <div className="px-3 py-1 flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {icon}
        <span>{title}</span>
        <span className="text-muted-foreground/60">({items.length})</span>
      </div>
      <div className="space-y-0.5">
        {items.map((item, i) => (
          <button
            key={i}
            className="w-full px-3 py-1.5 text-left hover:bg-accent/50 transition-colors"
          >
            <div className="text-[11px] font-mono text-muted-foreground truncate">
              {item.location}
            </div>
            <div className={cn("text-xs mt-0.5", messageColor)}>
              {item.message}
            </div>
            {item.code && (
              <div className="text-[10px] text-muted-foreground/60 mt-0.5 font-mono">
                {item.code}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
