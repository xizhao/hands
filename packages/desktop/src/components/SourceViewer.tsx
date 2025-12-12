/**
 * SourceViewer - View and manage a single source
 *
 * Shows source config, sync status, tables created, and manual sync button.
 * Includes inline secrets configuration, spec editor, validation, testing, and log viewing.
 */

import { useState, useCallback } from "react";
import { useSourceManagement, useStreamingSync, useSaveSecrets, useSaveSpec, useSourceValidation, useSourceTests, type Source } from "@/hooks/useSources";
import { useDbSchema } from "@/hooks/useWorkbook";
import { cn } from "@/lib/utils";
import { SyncLogViewer } from "@/components/LogViewer";
import { SpecEditor } from "@/components/SpecEditor";
import { ValidationPanel } from "@/components/ValidationPanel";
import {
  Database,
  Table,
  ArrowsClockwise,
  CheckCircle,
  XCircle,
  Warning,
  CircleNotch,
  Clock,
  Key,
  Eye,
  EyeSlash,
  CaretDown,
  CaretRight,
  FileText,
  PencilSimple,
  FloppyDisk,
  Robot,
  TestTube,
} from "@phosphor-icons/react";

interface SourceViewerProps {
  sourceId: string;
}

export function SourceViewer({ sourceId }: SourceViewerProps) {
  const {
    sources,
    isLoading,
  } = useSourceManagement();

  const { data: schema } = useDbSchema(null);
  const streamingSync = useStreamingSync();
  const saveSecretsMutation = useSaveSecrets();
  const saveSpecMutation = useSaveSpec();

  // Get the source first so we can pass it to hooks
  const source = sources.find((s) => s.id === sourceId);

  // Validation and testing hooks
  const validation = useSourceValidation(source);
  const tests = useSourceTests(sourceId);

  // Secrets form state
  const [secretValues, setSecretValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [secretsExpanded, setSecretsExpanded] = useState(true);

  // Spec editor state
  const [specExpanded, setSpecExpanded] = useState(true);
  const [specDraft, setSpecDraft] = useState<string | null>(null);
  const [specSaveStatus, setSpecSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Tests panel state
  const [testsExpanded, setTestsExpanded] = useState(false);

  const isThisSyncing = streamingSync.isRunning;

  // Handle spec save
  const handleSpecSave = useCallback(async (markdown: string) => {
    setSpecSaveStatus("saving");
    try {
      await saveSpecMutation.mutateAsync({ sourceId, spec: markdown });
      setSpecSaveStatus("saved");
      setTimeout(() => setSpecSaveStatus("idle"), 2000);
    } catch (err) {
      console.error("Failed to save spec:", err);
      setSpecSaveStatus("idle");
    }
  }, [sourceId, saveSpecMutation]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <CircleNotch weight="bold" className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!source) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-muted-foreground">
        <Database weight="duotone" className="h-12 w-12 opacity-50" />
        <p>Source not found</p>
        <p className="text-sm opacity-70">ID: {sourceId}</p>
      </div>
    );
  }

  const hasMissingSecrets = source.missingSecrets.length > 0;
  const currentSpec = specDraft ?? source.spec ?? "";

  // Find tables that might belong to this source (heuristic: tables with source name prefix)
  const relatedTables = schema?.filter((t) =>
    t.table_name.toLowerCase().startsWith(source.name.toLowerCase().replace(/-/g, "_"))
  ) ?? [];

  // Handle sync
  const handleSync = async () => {
    streamingSync.reset();
    await streamingSync.sync(sourceId);
  };

  // Handle save secrets
  const handleSaveSecrets = async () => {
    // Only save non-empty values
    const toSave: Record<string, string> = {};
    for (const [key, value] of Object.entries(secretValues)) {
      if (value.trim()) {
        toSave[key] = value.trim();
      }
    }

    if (Object.keys(toSave).length === 0) return;

    await saveSecretsMutation.mutateAsync(toSave);
    setSecretValues({});
  };

  // Check if all missing secrets have values entered
  const allMissingSecretsEntered = source.missingSecrets.every(
    (s) => secretValues[s]?.trim()
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-start gap-4">
          <div className="p-3 bg-purple-500/10 rounded-lg">
            <Database weight="duotone" className="h-8 w-8 text-purple-400" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-semibold">{source.title}</h1>
            <p className="text-muted-foreground mt-1">{source.description}</p>
          </div>
        </div>

        {/* Spec Editor */}
        <div className="rounded-lg border">
          {/* Spec header */}
          <button
            onClick={() => setSpecExpanded(!specExpanded)}
            className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors"
          >
            {specExpanded ? (
              <CaretDown weight="bold" className="h-4 w-4 text-muted-foreground" />
            ) : (
              <CaretRight weight="bold" className="h-4 w-4 text-muted-foreground" />
            )}
            <FileText weight="duotone" className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Spec</span>
            {source.spec ? (
              <span className="ml-auto flex items-center gap-1.5 text-green-500 text-sm">
                <CheckCircle weight="fill" className="h-4 w-4" />
                Defined
              </span>
            ) : (
              <span className="ml-auto flex items-center gap-1.5 text-muted-foreground text-sm">
                <PencilSimple weight="bold" className="h-4 w-4" />
                Not defined
              </span>
            )}
          </button>

          {/* Spec content */}
          {specExpanded && (
            <div className="px-4 pb-4 space-y-3">
              {/* Description */}
              <p className="text-sm text-muted-foreground">
                Define the intent, tables, and behavior. When you save, the code will be validated against the spec.
              </p>

              {/* Editor */}
              <SpecEditor
                value={currentSpec}
                onChange={(md) => setSpecDraft(md)}
                onSave={handleSpecSave}
                placeholder={`## Intent
Describe what this source does...

## Tables
- table_name: column1, column2, column3

## Behavior
- Syncs every X hours
- Upserts by primary key`}
                className="min-h-[200px]"
              />

              {/* Status bar */}
              <div className="flex items-center gap-3">
                {specSaveStatus === "saving" && (
                  <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin" />
                    Saving...
                  </span>
                )}
                {specSaveStatus === "saved" && (
                  <span className="flex items-center gap-1.5 text-sm text-green-500">
                    <CheckCircle weight="fill" className="h-3.5 w-3.5" />
                    Saved
                  </span>
                )}
              </div>

              {/* Validation Panel */}
              {source?.spec && (
                <ValidationPanel
                  state={validation.state}
                  onValidate={validation.validate}
                  onFix={validation.fix}
                />
              )}
            </div>
          )}
        </div>

        {/* Secrets Configuration */}
        {source.secrets.length > 0 && (
          <div className="rounded-lg border">
            {/* Secrets header */}
            <button
              onClick={() => setSecretsExpanded(!secretsExpanded)}
              className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors"
            >
              {secretsExpanded ? (
                <CaretDown weight="bold" className="h-4 w-4 text-muted-foreground" />
              ) : (
                <CaretRight weight="bold" className="h-4 w-4 text-muted-foreground" />
              )}
              <Key weight="duotone" className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">Secrets</span>
              {hasMissingSecrets && (
                <span className="ml-auto flex items-center gap-1.5 text-amber-500 text-sm">
                  <Warning weight="fill" className="h-4 w-4" />
                  {source.missingSecrets.length} missing
                </span>
              )}
              {!hasMissingSecrets && (
                <span className="ml-auto flex items-center gap-1.5 text-green-500 text-sm">
                  <CheckCircle weight="fill" className="h-4 w-4" />
                  Configured
                </span>
              )}
            </button>

            {/* Secrets content */}
            {secretsExpanded && (
              <div className="px-4 pb-4 space-y-4">
                {/* Secret inputs */}
                <div className="space-y-3">
                  {source.secrets.map((secret) => {
                    const isMissing = source.missingSecrets.includes(secret);
                    const isConfigured = !isMissing;

                    return (
                      <div key={secret}>
                        <label className="flex items-center gap-2 text-sm font-medium mb-1.5">
                          <span className="font-mono text-xs">{secret}</span>
                          {isConfigured && (
                            <span className="text-xs text-green-500 flex items-center gap-1">
                              <CheckCircle weight="fill" className="h-3 w-3" />
                              configured
                            </span>
                          )}
                          {isMissing && (
                            <span className="text-xs text-amber-500">required</span>
                          )}
                        </label>
                        <div className="relative">
                          <input
                            type={showSecrets[secret] ? "text" : "password"}
                            value={secretValues[secret] || ""}
                            onChange={(e) =>
                              setSecretValues((prev) => ({
                                ...prev,
                                [secret]: e.target.value,
                              }))
                            }
                            placeholder={
                              isConfigured
                                ? "(leave empty to keep current)"
                                : "Enter value..."
                            }
                            className={cn(
                              "w-full px-3 py-2 pr-10 rounded-lg border bg-background",
                              "focus:outline-none focus:ring-2 focus:ring-purple-500/50",
                              "font-mono text-sm"
                            )}
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowSecrets((prev) => ({
                                ...prev,
                                [secret]: !prev[secret],
                              }))
                            }
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {showSecrets[secret] ? (
                              <EyeSlash weight="bold" className="h-4 w-4" />
                            ) : (
                              <Eye weight="bold" className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Save button */}
                {(hasMissingSecrets || Object.values(secretValues).some((v) => v.trim())) && (
                  <button
                    onClick={handleSaveSecrets}
                    disabled={saveSecretsMutation.isPending || (hasMissingSecrets && !allMissingSecretsEntered)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
                      "bg-purple-500 hover:bg-purple-600 text-white",
                      (saveSecretsMutation.isPending || (hasMissingSecrets && !allMissingSecretsEntered)) &&
                        "opacity-50 cursor-not-allowed"
                    )}
                  >
                    {saveSecretsMutation.isPending ? (
                      <>
                        <CircleNotch weight="bold" className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Key weight="bold" className="h-4 w-4" />
                        Save Secrets
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Sync Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <button
              onClick={handleSync}
              disabled={isThisSyncing || hasMissingSecrets}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors",
                hasMissingSecrets
                  ? "bg-muted text-muted-foreground cursor-not-allowed"
                  : "bg-purple-500 hover:bg-purple-600 text-white"
              )}
            >
              {isThisSyncing ? (
                <>
                  <CircleNotch weight="bold" className="h-4 w-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <ArrowsClockwise weight="bold" className="h-4 w-4" />
                  Sync Now
                </>
              )}
            </button>

            {hasMissingSecrets && (
              <span className="text-sm text-muted-foreground">
                Configure secrets above to enable sync
              </span>
            )}
          </div>

          {/* Log Viewer */}
          <SyncLogViewer
            logs={streamingSync.logs}
            isRunning={streamingSync.isRunning}
            result={streamingSync.result ?? undefined}
          />
        </div>

        {/* Source Info */}
        <div className="grid gap-4">
          {/* Schedule */}
          {source.schedule && (
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
              <Clock weight="duotone" className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Schedule</p>
                <p className="text-sm text-muted-foreground font-mono">{source.schedule}</p>
              </div>
            </div>
          )}
        </div>

        {/* Related Tables */}
        {relatedTables.length > 0 && (
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-2">
              Tables
            </h2>
            <div className="space-y-1">
              {relatedTables.map((table) => (
                <div
                  key={table.table_name}
                  className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
                >
                  <Table weight="duotone" className="h-4 w-4 text-blue-400" />
                  <span className="font-mono text-sm">{table.table_name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {table.columns.length} columns
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tests Section */}
        <div className="rounded-lg border">
          {/* Tests header */}
          <button
            onClick={() => setTestsExpanded(!testsExpanded)}
            className="w-full flex items-center gap-3 p-4 hover:bg-muted/50 transition-colors"
          >
            {testsExpanded ? (
              <CaretDown weight="bold" className="h-4 w-4 text-muted-foreground" />
            ) : (
              <CaretRight weight="bold" className="h-4 w-4 text-muted-foreground" />
            )}
            <TestTube weight="duotone" className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">Tests</span>
            {tests.result && (
              <span className={cn(
                "ml-auto flex items-center gap-1.5 text-sm",
                tests.result.success ? "text-green-500" : "text-red-500"
              )}>
                {tests.result.success ? (
                  <>
                    <CheckCircle weight="fill" className="h-4 w-4" />
                    Passed
                  </>
                ) : (
                  <>
                    <XCircle weight="fill" className="h-4 w-4" />
                    Failed
                  </>
                )}
              </span>
            )}
          </button>

          {/* Tests content */}
          {testsExpanded && (
            <div className="px-4 pb-4 space-y-3">
              <p className="text-sm text-muted-foreground">
                Run tests to verify the source behavior. Test file: <code className="bg-muted px-1 rounded text-xs">sources/{source?.name}/{source?.name}.test.ts</code>
              </p>

              {/* Run tests button */}
              <button
                onClick={tests.runTests}
                disabled={tests.isRunning}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
                  "bg-purple-500/10 hover:bg-purple-500/20 text-purple-400",
                  tests.isRunning && "opacity-50 cursor-not-allowed"
                )}
              >
                {tests.isRunning ? (
                  <>
                    <CircleNotch weight="bold" className="h-4 w-4 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <TestTube weight="bold" className="h-4 w-4" />
                    Run Tests
                  </>
                )}
              </button>

              {/* Test output */}
              {tests.logs.length > 0 && (
                <div className="rounded-lg bg-muted/50 p-3 max-h-[300px] overflow-y-auto">
                  <pre className="text-xs font-mono whitespace-pre-wrap">
                    {tests.logs.join("\n")}
                  </pre>
                </div>
              )}

              {/* Test result summary */}
              {tests.result && (
                <div className={cn(
                  "p-2 rounded-lg text-sm",
                  tests.result.success
                    ? "bg-green-500/10 text-green-500"
                    : "bg-red-500/10 text-red-500"
                )}>
                  {tests.result.summary}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Source ID (technical) */}
        <div className="pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            Source ID: <code className="bg-muted px-1 rounded">{source.id}</code>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Name: <code className="bg-muted px-1 rounded">{source.name}</code>
          </p>
        </div>
      </div>
    </div>
  );
}
