"use client";

/**
 * PageSyncStatus - Shows sync and version status for the current page
 *
 * Displays:
 * - Last sync time to workbook database
 * - Git status (uncommitted changes, divergence)
 * - Schema drift warnings
 */

import { useState } from "react";
import {
  ArrowsClockwise,
  Check,
  Clock,
  GitBranch,
  GitCommit,
  Warning,
  CaretDown,
  Database,
  Table,
} from "@phosphor-icons/react";
import { cn } from "../lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

// ============================================================================
// Types
// ============================================================================

interface SyncStatus {
  lastSyncedAt: Date | null;
  isSyncing: boolean;
  hasUnsyncedChanges: boolean;
}

interface GitStatus {
  branch: string;
  hasUncommittedChanges: boolean;
  uncommittedFiles: number;
  aheadBy: number;
  behindBy: number;
  lastCommitMessage: string;
  lastCommitTime: Date;
}

interface SchemaDrift {
  hasDrift: boolean;
  addedColumns: string[];
  removedColumns: string[];
  modifiedColumns: string[];
  tablesMissing: string[];
}

interface PageSyncStatusProps {
  className?: string;
}

// ============================================================================
// Mock Data (replace with real data later)
// ============================================================================

const MOCK_SYNC_STATUS: SyncStatus = {
  lastSyncedAt: new Date(Date.now() - 1000 * 60 * 3), // 3 minutes ago
  isSyncing: false,
  hasUnsyncedChanges: false,
};

const MOCK_GIT_STATUS: GitStatus = {
  branch: "main",
  hasUncommittedChanges: true,
  uncommittedFiles: 2,
  aheadBy: 1,
  behindBy: 0,
  lastCommitMessage: "Update dashboard queries",
  lastCommitTime: new Date(Date.now() - 1000 * 60 * 45), // 45 minutes ago
};

const MOCK_SCHEMA_DRIFT: SchemaDrift = {
  hasDrift: true,
  addedColumns: ["created_at"],
  removedColumns: [],
  modifiedColumns: ["status"], // type changed
  tablesMissing: [],
};

// ============================================================================
// Helpers
// ============================================================================

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function getSyncStatusColor(sync: SyncStatus, drift: SchemaDrift): string {
  if (sync.isSyncing) return "text-blue-500";
  if (drift.hasDrift) return "text-amber-500";
  if (sync.hasUnsyncedChanges) return "text-amber-500";
  return "text-emerald-500";
}

function getSyncStatusIcon(sync: SyncStatus, drift: SchemaDrift) {
  if (sync.isSyncing) return <ArrowsClockwise size={14} className="animate-spin" />;
  if (drift.hasDrift) return <Warning size={14} />;
  if (sync.hasUnsyncedChanges) return <Clock size={14} />;
  return <Check size={14} />;
}

// ============================================================================
// Component
// ============================================================================

export function PageSyncStatus({ className }: PageSyncStatusProps) {
  // In real implementation, these would come from hooks/context
  const [syncStatus] = useState<SyncStatus>(MOCK_SYNC_STATUS);
  const [gitStatus] = useState<GitStatus>(MOCK_GIT_STATUS);
  const [schemaDrift] = useState<SchemaDrift>(MOCK_SCHEMA_DRIFT);

  const statusColor = getSyncStatusColor(syncStatus, schemaDrift);
  const statusIcon = getSyncStatusIcon(syncStatus, schemaDrift);

  const totalDriftItems =
    schemaDrift.addedColumns.length +
    schemaDrift.removedColumns.length +
    schemaDrift.modifiedColumns.length +
    schemaDrift.tablesMissing.length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 px-2 h-7 rounded text-xs transition-colors",
            "hover:bg-accent text-muted-foreground hover:text-foreground",
            className
          )}
        >
          <span className={statusColor}>{statusIcon}</span>
          <span className="hidden sm:inline">
            {syncStatus.lastSyncedAt
              ? formatRelativeTime(syncStatus.lastSyncedAt)
              : "Never synced"
            }
          </span>
          {(gitStatus.hasUncommittedChanges || schemaDrift.hasDrift) && (
            <span className="flex items-center gap-1">
              {gitStatus.hasUncommittedChanges && (
                <span className="text-amber-500 text-[10px]">
                  •{gitStatus.uncommittedFiles}
                </span>
              )}
              {schemaDrift.hasDrift && (
                <span className="text-amber-500 text-[10px]">
                  Δ{totalDriftItems}
                </span>
              )}
            </span>
          )}
          <CaretDown size={10} className="opacity-50" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-72">
        {/* Sync Status */}
        <DropdownMenuLabel className="flex items-center gap-2">
          <Database size={14} />
          Sync Status
        </DropdownMenuLabel>
        <div className="px-2 py-1.5 text-xs text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Last synced</span>
            <span className={cn("font-medium", statusColor)}>
              {syncStatus.lastSyncedAt
                ? formatRelativeTime(syncStatus.lastSyncedAt)
                : "Never"
              }
            </span>
          </div>
          {syncStatus.hasUnsyncedChanges && (
            <div className="flex items-center justify-between mt-1">
              <span>Status</span>
              <span className="text-amber-500 font-medium">Pending changes</span>
            </div>
          )}
        </div>

        <DropdownMenuSeparator />

        {/* Git Status */}
        <DropdownMenuLabel className="flex items-center gap-2">
          <GitBranch size={14} />
          Git Status
        </DropdownMenuLabel>
        <div className="px-2 py-1.5 text-xs text-muted-foreground space-y-1">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              <GitBranch size={12} />
              Branch
            </span>
            <span className="font-mono font-medium text-foreground">
              {gitStatus.branch}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1">
              <GitCommit size={12} />
              Last commit
            </span>
            <span className="text-foreground">
              {formatRelativeTime(gitStatus.lastCommitTime)}
            </span>
          </div>
          {gitStatus.hasUncommittedChanges && (
            <div className="flex items-center justify-between">
              <span>Uncommitted</span>
              <span className="text-amber-500 font-medium">
                {gitStatus.uncommittedFiles} file{gitStatus.uncommittedFiles !== 1 ? "s" : ""}
              </span>
            </div>
          )}
          {gitStatus.aheadBy > 0 && (
            <div className="flex items-center justify-between">
              <span>Ahead of origin</span>
              <span className="text-blue-500 font-medium">
                {gitStatus.aheadBy} commit{gitStatus.aheadBy !== 1 ? "s" : ""}
              </span>
            </div>
          )}
          {gitStatus.behindBy > 0 && (
            <div className="flex items-center justify-between">
              <span>Behind origin</span>
              <span className="text-amber-500 font-medium">
                {gitStatus.behindBy} commit{gitStatus.behindBy !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>

        {/* Schema Drift */}
        {schemaDrift.hasDrift && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="flex items-center gap-2 text-amber-500">
              <Table size={14} />
              Schema Drift Detected
            </DropdownMenuLabel>
            <div className="px-2 py-1.5 text-xs text-muted-foreground space-y-1">
              {schemaDrift.addedColumns.length > 0 && (
                <div className="flex items-center justify-between">
                  <span>New columns</span>
                  <span className="text-emerald-500 font-mono">
                    +{schemaDrift.addedColumns.join(", +")}
                  </span>
                </div>
              )}
              {schemaDrift.removedColumns.length > 0 && (
                <div className="flex items-center justify-between">
                  <span>Removed columns</span>
                  <span className="text-red-500 font-mono">
                    -{schemaDrift.removedColumns.join(", -")}
                  </span>
                </div>
              )}
              {schemaDrift.modifiedColumns.length > 0 && (
                <div className="flex items-center justify-between">
                  <span>Modified columns</span>
                  <span className="text-amber-500 font-mono">
                    ~{schemaDrift.modifiedColumns.join(", ~")}
                  </span>
                </div>
              )}
              {schemaDrift.tablesMissing.length > 0 && (
                <div className="flex items-center justify-between">
                  <span>Missing tables</span>
                  <span className="text-red-500 font-mono">
                    {schemaDrift.tablesMissing.join(", ")}
                  </span>
                </div>
              )}
            </div>
          </>
        )}

        <DropdownMenuSeparator />

        {/* Actions */}
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <ArrowsClockwise size={14} />
            <span>Sync now</span>
          </DropdownMenuItem>
          <DropdownMenuItem>
            <GitCommit size={14} />
            <span>View history</span>
          </DropdownMenuItem>
          {schemaDrift.hasDrift && (
            <DropdownMenuItem className="text-amber-500">
              <Warning size={14} />
              <span>Resolve drift</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
