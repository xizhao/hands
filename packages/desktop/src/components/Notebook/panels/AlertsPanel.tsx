/**
 * AlertsPanel - Categorized alerts for App, Runtime, and Code quality
 */

import {
  ArrowsClockwise,
  CaretDown,
  CaretRight,
  Code,
  Cpu,
  Desktop,
  Sparkle,
  Warning,
  WarningCircle,
} from "@phosphor-icons/react";
import { useIsMutating } from "@tanstack/react-query";
import { useState } from "react";
import { useRuntimeState } from "@/hooks/useRuntimeState";
import { useServer } from "@/hooks/useServer";
import { useEvalResult, useRuntimeEval } from "@/hooks/useWorkbook";
import { cn } from "@/lib/utils";

type Category = "app" | "runtime" | "code";

export function AlertsPanel() {
  const { workbookId: activeWorkbookId, port: runtimePort } = useRuntimeState();
  const { data: evalResult, isLoading } = useEvalResult(activeWorkbookId);
  const runtimeRunning = !!runtimePort;
  const { isConnected: agentConnected, isConnecting: agentConnecting } = useServer();
  const runtimeEval = useRuntimeEval();

  // Track pending mutations for app alerts
  const pendingMutations = useIsMutating();

  // Expanded state for categories
  const [expanded, setExpanded] = useState<Record<Category, boolean>>({
    app: true,
    runtime: true,
    code: true,
  });

  const toggleCategory = (cat: Category) => {
    setExpanded((prev) => ({ ...prev, [cat]: !prev[cat] }));
  };

  // Compute diagnostics counts
  const tsErrors = evalResult?.typescript?.errors ?? [];
  const tsWarnings = evalResult?.typescript?.warnings ?? [];
  const formatErrors = evalResult?.format?.errors ?? [];
  const unusedExports = evalResult?.unused?.exports ?? [];
  const unusedFiles = evalResult?.unused?.files ?? [];

  const codeErrors = tsErrors.length + formatErrors.length;
  const codeWarnings = tsWarnings.length;
  const codeUnused = unusedExports.length + unusedFiles.length;
  const hasCodeIssues = codeErrors > 0 || codeWarnings > 0 || codeUnused > 0;

  // Runtime issues (runtimeRunning comes from useRuntime above)
  const postgresUp = evalResult?.services?.postgres?.up ?? false;
  const blockServerUp = evalResult?.services?.blockServer?.up ?? false;
  const blockServerError = evalResult?.services?.blockServer?.error as string | undefined;
  const runtimeIssues: AlertItem[] = [];

  if (!runtimeRunning) {
    runtimeIssues.push({ message: "Runtime not started", variant: "warning" });
  } else {
    if (!postgresUp) {
      runtimeIssues.push({ message: "PostgreSQL not connected", variant: "error" });
    }
    if (!blockServerUp) {
      // Show the actual error message if available (e.g., module resolution errors)
      if (blockServerError && blockServerError !== "Block server is starting") {
        // Extract the most relevant error line (e.g., "Cannot find module '@/hooks'")
        const errorMatch = blockServerError.match(/Error:\s*([^\n]+)/);
        const shortError = errorMatch?.[1]?.trim() || blockServerError.split("\n")[0];
        runtimeIssues.push({
          message: shortError.length > 100 ? shortError.slice(0, 100) + "…" : shortError,
          variant: "error",
        });
      } else {
        runtimeIssues.push({ message: "Block server not running", variant: "warning" });
      }
    }
  }

  // App issues
  const appIssues: AlertItem[] = [];
  if (!agentConnected && !agentConnecting) {
    appIssues.push({ message: "Hands Agent disconnected", variant: "error" });
  } else if (agentConnecting) {
    appIssues.push({ message: "Connecting to Hands Agent...", variant: "info" });
  }

  const handleRefresh = () => {
    if (activeWorkbookId) {
      runtimeEval.mutate(activeWorkbookId);
    }
  };

  const totalIssues = appIssues.length + runtimeIssues.length + codeErrors + codeWarnings;
  const allClear = totalIssues === 0 && !pendingMutations;

  return (
    <div className="flex flex-col h-full">
      {/* Summary header */}
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          {totalIssues > 0 ? (
            <>
              {(appIssues.some((i) => i.variant === "error") ||
                runtimeIssues.some((i) => i.variant === "error") ||
                codeErrors > 0) && (
                <div className="flex items-center gap-1 text-red-400">
                  <WarningCircle weight="fill" className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">
                    {appIssues.filter((i) => i.variant === "error").length +
                      runtimeIssues.filter((i) => i.variant === "error").length +
                      codeErrors}
                  </span>
                </div>
              )}
              {(runtimeIssues.some((i) => i.variant === "warning") || codeWarnings > 0) && (
                <div className="flex items-center gap-1 text-yellow-400">
                  <Warning weight="fill" className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">
                    {runtimeIssues.filter((i) => i.variant === "warning").length + codeWarnings}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-1 text-green-400">
              <Sparkle weight="fill" className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">All clear</span>
            </div>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={runtimeEval.isPending}
          className={cn(
            "p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors",
            runtimeEval.isPending && "opacity-50 cursor-not-allowed",
          )}
          title="Refresh diagnostics"
        >
          <ArrowsClockwise
            weight="bold"
            className={cn("h-3.5 w-3.5", runtimeEval.isPending && "animate-spin")}
          />
        </button>
      </div>

      {/* Categories */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
        ) : allClear ? (
          <div className="p-8 text-center">
            <Sparkle weight="duotone" className="h-8 w-8 text-green-400/50 mx-auto mb-2" />
            <div className="text-sm text-muted-foreground">All systems operational</div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {/* App issues */}
            {appIssues.length > 0 && (
              <CategorySection
                title="App"
                icon={<Desktop weight="duotone" className="h-4 w-4" />}
                expanded={expanded.app}
                onToggle={() => toggleCategory("app")}
                errorCount={appIssues.filter((i) => i.variant === "error").length}
                warningCount={appIssues.filter((i) => i.variant === "warning").length}
              >
                {appIssues.map((item, i) => (
                  <AlertRow key={i} {...item} />
                ))}
              </CategorySection>
            )}

            {/* Runtime issues */}
            {runtimeIssues.length > 0 && (
              <CategorySection
                title="Runtime"
                icon={<Cpu weight="duotone" className="h-4 w-4" />}
                expanded={expanded.runtime}
                onToggle={() => toggleCategory("runtime")}
                errorCount={runtimeIssues.filter((i) => i.variant === "error").length}
                warningCount={runtimeIssues.filter((i) => i.variant === "warning").length}
              >
                {runtimeIssues.map((item, i) => (
                  <AlertRow key={i} {...item} />
                ))}
              </CategorySection>
            )}

            {/* Code issues */}
            {hasCodeIssues && (
              <CategorySection
                title="Code"
                icon={<Code weight="duotone" className="h-4 w-4" />}
                expanded={expanded.code}
                onToggle={() => toggleCategory("code")}
                errorCount={codeErrors}
                warningCount={codeWarnings}
              >
                {tsErrors.map((d, i) => (
                  <AlertRow
                    key={`tse-${i}`}
                    message={d.message}
                    location={`${d.file}:${d.line}`}
                    variant="error"
                  />
                ))}
                {tsWarnings.map((d, i) => (
                  <AlertRow
                    key={`tsw-${i}`}
                    message={d.message}
                    location={`${d.file}:${d.line}`}
                    variant="warning"
                  />
                ))}
                {formatErrors.map((f, i) => (
                  <AlertRow
                    key={`fmt-${i}`}
                    message="Formatting error"
                    location={f}
                    variant="error"
                  />
                ))}
                {codeUnused > 0 && (
                  <AlertRow
                    message={`${codeUnused} unused export${codeUnused > 1 ? "s" : ""}`}
                    variant="muted"
                  />
                )}
              </CategorySection>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface CategorySectionProps {
  title: string;
  icon: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  errorCount: number;
  warningCount: number;
  children: React.ReactNode;
}

function CategorySection({
  title,
  icon,
  expanded,
  onToggle,
  errorCount,
  warningCount,
  children,
}: CategorySectionProps) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full px-3 py-2 flex items-center gap-2 hover:bg-accent/50 transition-colors"
      >
        {expanded ? (
          <CaretDown weight="bold" className="h-3 w-3 text-muted-foreground" />
        ) : (
          <CaretRight weight="bold" className="h-3 w-3 text-muted-foreground" />
        )}
        <span className="text-muted-foreground">{icon}</span>
        <span className="text-sm font-medium flex-1 text-left">{title}</span>
        <div className="flex items-center gap-2">
          {errorCount > 0 && <span className="text-xs text-red-400">{errorCount}</span>}
          {warningCount > 0 && <span className="text-xs text-yellow-400">{warningCount}</span>}
        </div>
      </button>
      {expanded && <div className="pb-1">{children}</div>}
    </div>
  );
}

interface AlertItem {
  message: string;
  location?: string;
  variant: "error" | "warning" | "info" | "muted";
}

function AlertRow({ message, location, variant }: AlertItem) {
  const colors = {
    error: "text-red-400",
    warning: "text-yellow-400",
    info: "text-blue-400",
    muted: "text-muted-foreground",
  };

  return (
    <div className="px-3 py-1.5 pl-8">
      <div className={cn("text-xs", colors[variant])}>{message}</div>
      {location && (
        <div className="text-[10px] font-mono text-muted-foreground/60 truncate">{location}</div>
      )}
    </div>
  );
}
