/**
 * SourceDocEditor - Minimal two column layout
 *
 * Left: Rich text editor with card toolbar (no label)
 * Right: Logs and affected tables
 * Header: Title + Test/Run buttons
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { SpecEditor } from "@/components/SpecEditor";
import {
  useSourceManagement,
  useSaveSpec,
  useSourceTests,
  useStreamingSync,
  type Source,
} from "@/hooks/useSources";
import { useSourceSync, type GitSyncStatus } from "@/hooks/useSourceSync";
import {
  CircleNotch,
  ArrowDown,
  ArrowUp,
  TestTube,
  Play,
  FloppyDisk,
  Check,
  Circle,
  Table,
  Terminal,
} from "@phosphor-icons/react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface SourceDocEditorProps {
  sourceId: string;
}

export function SourceDocEditor({ sourceId }: SourceDocEditorProps) {
  const { sources, isLoading } = useSourceManagement();
  const saveSpecMutation = useSaveSpec();
  const source = sources.find((s) => s.id === sourceId);

  // Tests and sync hooks
  const tests = useSourceTests(sourceId);
  const streamingSync = useStreamingSync();
  const sync = useSourceSync(source);

  // Editor state
  const [specDraft, setSpecDraft] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const initialValueRef = useRef<string | null>(null);

  // Initialize draft from sync spec
  useEffect(() => {
    if (sync.spec && specDraft === null) {
      setSpecDraft(sync.spec);
      initialValueRef.current = sync.spec;
    }
  }, [sync.spec, specDraft]);

  // Handle spec change - just track dirty, no auto-save
  const handleSpecChange = useCallback((markdown: string) => {
    setSpecDraft(markdown);
    setIsDirty(markdown !== initialValueRef.current);
  }, []);

  // Manual save
  const saveSpec = useCallback(async () => {
    if (!specDraft || isSaving) return;
    setIsSaving(true);
    try {
      await saveSpecMutation.mutateAsync({ sourceId, spec: specDraft });
      initialValueRef.current = specDraft;
      setIsDirty(false);
      sync.refetchStatus();
    } catch (err) {
      console.error("Failed to save spec:", err);
    } finally {
      setIsSaving(false);
    }
  }, [sourceId, specDraft, isSaving, saveSpecMutation, sync]);

  // Push (spec → code) - arrow up, pushing spec up to code
  const handlePush = useCallback(async () => {
    if (isDirty) await saveSpec();
    sync.push();
  }, [isDirty, saveSpec, sync]);

  // Pull (code → spec) - arrow down, pulling code down to spec
  const handlePull = useCallback(async () => {
    if (isDirty) await saveSpec();
    sync.pull();
  }, [isDirty, saveSpec, sync]);

  // Run sync
  const handleRunSync = useCallback(() => {
    if (!source) return;
    streamingSync.reset();
    streamingSync.sync(sourceId);
  }, [source, sourceId, streamingSync]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <CircleNotch weight="bold" className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!source) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <p>Source not found</p>
      </div>
    );
  }

  const currentSpec = specDraft ?? sync.spec ?? "";
  const hasMissingSecrets = source.missingSecrets.length > 0;

  return (
    <TooltipProvider>
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header with title and actions */}
        <div className="flex items-center gap-4 px-6 py-3 border-b bg-background">
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold text-foreground truncate">{source.title}</h1>
          </div>

          {/* Test */}
          <button
            onClick={tests.runTests}
            disabled={tests.isRunning}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors",
              "hover:bg-muted",
              tests.isRunning && "opacity-50"
            )}
          >
            {tests.isRunning ? (
              <CircleNotch weight="bold" className="h-4 w-4 animate-spin text-purple-400" />
            ) : tests.result?.success ? (
              <TestTube weight="fill" className="h-4 w-4 text-green-500" />
            ) : tests.result && !tests.result.success ? (
              <TestTube weight="fill" className="h-4 w-4 text-red-500" />
            ) : (
              <TestTube weight="duotone" className="h-4 w-4 text-muted-foreground" />
            )}
            Test
          </button>

          {/* Run */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleRunSync}
                disabled={streamingSync.isRunning || hasMissingSecrets}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm transition-colors",
                  "bg-purple-500 hover:bg-purple-600 text-white",
                  (streamingSync.isRunning || hasMissingSecrets) && "opacity-50 cursor-not-allowed"
                )}
              >
                {streamingSync.isRunning ? (
                  <CircleNotch weight="bold" className="h-4 w-4 animate-spin" />
                ) : (
                  <Play weight="fill" className="h-4 w-4" />
                )}
                Run
              </button>
            </TooltipTrigger>
            {hasMissingSecrets && (
              <TooltipContent>Missing: {source.missingSecrets.join(", ")}</TooltipContent>
            )}
          </Tooltip>
        </div>

        {/* Two column layout */}
        <div className="flex-1 flex gap-4 p-4 overflow-hidden">
          {/* Left: Editor */}
          <div className="flex-1 flex flex-col min-w-0">
            <SpecCard
              source={source}
              currentSpec={currentSpec}
              syncStatus={sync.syncStatus}
              diffStats={sync.diffStats}
              isDirty={isDirty}
              isSaving={isSaving}
              isPushing={sync.isPushing}
              isPulling={sync.isPulling}
              onSpecChange={handleSpecChange}
              onSave={saveSpec}
              onPush={handlePush}
              onPull={handlePull}
            />
          </div>

          {/* Right: Logs + Tables */}
          <div className="w-72 flex flex-col gap-3 overflow-hidden">
            <LogsCard tests={tests} streamingSync={streamingSync} />
            <TablesCard source={source} />
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}

/**
 * Spec Card - Editor with embedded toolbar (formatting + sync actions)
 */
interface SpecCardProps {
  source: Source;
  currentSpec: string;
  syncStatus: GitSyncStatus["status"];
  diffStats: { additions: number; deletions: number } | null;
  isDirty: boolean;
  isSaving: boolean;
  isPushing: boolean;
  isPulling: boolean;
  onSpecChange: (markdown: string) => void;
  onSave: () => void;
  onPush: () => void;
  onPull: () => void;
}

function SpecCard({
  source,
  currentSpec,
  syncStatus,
  diffStats,
  isDirty,
  isSaving,
  isPushing,
  isPulling,
  onSpecChange,
  onSave,
  onPush,
  onPull,
}: SpecCardProps) {
  const isOperating = isSaving || isPushing || isPulling;
  const hasDesync = syncStatus !== "synced" && syncStatus !== "unknown";

  // Toolbar left: status chip with diff stats + icon buttons for save/push/pull
  const toolbarLeft = (
    <div className="flex items-center gap-1.5">
      {/* Status chip with GitHub-style diff stats */}
      <div className={cn(
        "flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium",
        isDirty ? "bg-amber-500/15 text-amber-600" :
        syncStatus === "synced" ? "bg-green-500/15 text-green-600" :
        syncStatus === "spec-ahead" ? "bg-blue-500/15 text-blue-600" :
        syncStatus === "code-ahead" ? "bg-amber-500/15 text-amber-600" :
        syncStatus === "diverged" ? "bg-red-500/15 text-red-600" :
        "bg-muted text-muted-foreground"
      )}>
        {isDirty ? (
          <>
            <Circle weight="fill" className="h-1.5 w-1.5" />
            <span>Unsaved</span>
          </>
        ) : syncStatus === "synced" ? (
          <>
            <Check weight="bold" className="h-2.5 w-2.5" />
            <span>Synced</span>
          </>
        ) : syncStatus === "no-spec" ? (
          <span>New</span>
        ) : (
          <>
            {/* Show diff stats like GitHub: +12 -5 */}
            {diffStats ? (
              <span className="flex items-center gap-1">
                <span className="text-green-600">+{diffStats.additions}</span>
                <span className="text-red-500">-{diffStats.deletions}</span>
              </span>
            ) : (
              <span>
                {syncStatus === "spec-ahead" ? "Spec ahead" :
                 syncStatus === "code-ahead" ? "Code ahead" :
                 syncStatus === "diverged" ? "Diverged" : null}
              </span>
            )}
          </>
        )}
      </div>

      {/* Save - only show when dirty */}
      {isDirty && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onSave}
              disabled={isSaving}
              className={cn(
                "flex items-center justify-center h-6 w-6 rounded",
                "hover:bg-muted text-muted-foreground hover:text-foreground",
                isSaving && "opacity-50"
              )}
            >
              {isSaving ? (
                <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FloppyDisk weight="bold" className="h-3.5 w-3.5" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>Save changes</TooltipContent>
        </Tooltip>
      )}

      {/* Push - arrow up (spec → code) - show when any desync */}
      {hasDesync && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onPush}
              disabled={isOperating}
              className={cn(
                "flex items-center justify-center h-6 w-6 rounded",
                "hover:bg-muted text-muted-foreground hover:text-foreground",
                isOperating && "opacity-50"
              )}
            >
              {isPushing ? (
                <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowUp weight="bold" className="h-3.5 w-3.5" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>Push spec → code</TooltipContent>
        </Tooltip>
      )}

      {/* Pull - arrow down (code → spec) - show when any desync */}
      {hasDesync && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onPull}
              disabled={isOperating}
              className={cn(
                "flex items-center justify-center h-6 w-6 rounded",
                "hover:bg-muted text-muted-foreground hover:text-foreground",
                isOperating && "opacity-50"
              )}
            >
              {isPulling ? (
                <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowDown weight="bold" className="h-3.5 w-3.5" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent>Pull code → spec</TooltipContent>
        </Tooltip>
      )}
    </div>
  );

  return (
    <SpecEditor
      id={`spec-editor-${source.id}`}
      value={currentSpec}
      onChange={onSpecChange}
      placeholder={`# ${source.title}

Describe what this source does.

## Tables
- table_name: column1, column2

## Behavior
- Sync frequency
- Upsert logic`}
      className="flex-1 min-h-[400px]"
      toolbarLeft={toolbarLeft}
    />
  );
}

/**
 * Logs Card
 */
interface LogsCardProps {
  tests: ReturnType<typeof useSourceTests>;
  streamingSync: ReturnType<typeof useStreamingSync>;
}

function LogsCard({ tests, streamingSync }: LogsCardProps) {
  const hasLogs = streamingSync.logs.length > 0 || tests.logs.length > 0;

  return (
    <div className="flex-1 flex flex-col rounded-lg border bg-card overflow-hidden min-h-[200px]">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        <Terminal weight="duotone" className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Logs</span>
      </div>

      <div className="flex-1 overflow-auto">
        {hasLogs ? (
          <div className="p-2 font-mono text-xs space-y-0.5">
            {tests.logs.map((log, i) => (
              <div key={`t-${i}`} className="text-muted-foreground whitespace-pre-wrap">{log}</div>
            ))}
            {streamingSync.logs.map((log, i) => (
              <div
                key={`s-${i}`}
                className={cn(
                  "whitespace-pre-wrap",
                  log.level === "error" && "text-red-400",
                  log.level === "warn" && "text-amber-400",
                  log.level === "info" && "text-muted-foreground"
                )}
              >
                {log.message}
              </div>
            ))}
            {streamingSync.result && (
              <div className={cn(
                "pt-1 mt-1 border-t",
                streamingSync.result.success ? "text-green-500" : "text-red-500"
              )}>
                {streamingSync.result.success
                  ? `Done in ${streamingSync.result.durationMs}ms`
                  : streamingSync.result.error}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full text-muted-foreground/50 text-xs">
            No output yet
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Tables Card
 */
function TablesCard({ source }: { source: Source }) {
  // TODO: Get actual tables from runtime
  const tables: string[] = [];

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        <Table weight="duotone" className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Tables</span>
      </div>

      <div className="p-3 min-h-[60px]">
        {tables.length > 0 ? (
          <div className="space-y-1">
            {tables.map((table) => (
              <div key={table} className="text-xs font-mono text-muted-foreground">{table}</div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground/50 text-center">
            Run sync to discover
          </div>
        )}
      </div>
    </div>
  );
}
