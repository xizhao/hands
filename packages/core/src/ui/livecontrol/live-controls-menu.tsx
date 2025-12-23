"use client";

/**
 * LiveControlsMenu - Compact popover for all live elements
 *
 * Shows on hover/selection with:
 * - Icon (Database for queries, Zap for actions)
 * - Table name label
 * - View Data button
 * - Edit button (opens LiveQueryEditor)
 */

import { useState } from "react";
import { Database, Zap, Eye, Pencil } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/popover";
import { Button } from "../components/button";
import type { LiveControlsMenuProps } from "./types";

/**
 * Extract table name from a SQL query or action statement.
 */
export function extractTableName(sql: string, type: "query" | "action"): string | null {
  if (!sql) return null;

  if (type === "query") {
    // Match FROM tablename or FROM "tablename" or FROM `tablename`
    const fromMatch = sql.match(/\bFROM\s+["`]?(\w+)["`]?/i);
    if (fromMatch) return fromMatch[1];
  } else {
    // Match UPDATE/INSERT INTO/DELETE FROM tablename
    const updateMatch = sql.match(/\bUPDATE\s+["`]?(\w+)["`]?/i);
    if (updateMatch) return updateMatch[1];

    const insertMatch = sql.match(/\bINSERT\s+INTO\s+["`]?(\w+)["`]?/i);
    if (insertMatch) return insertMatch[1];

    const deleteMatch = sql.match(/\bDELETE\s+FROM\s+["`]?(\w+)["`]?/i);
    if (deleteMatch) return deleteMatch[1];
  }

  return null;
}

export function LiveControlsMenu({
  type,
  sql,
  tableName: tableNameProp,
  onViewData,
  onEdit,
  children,
  inline = false,
  selected = false,
  readOnly = false,
}: LiveControlsMenuProps) {
  const [open, setOpen] = useState(false);

  // Use provided table name or extract from SQL
  const tableName = tableNameProp ?? (sql ? extractTableName(sql, type) : null);
  const Icon = type === "query" ? Database : Zap;
  const label = tableName ?? (type === "query" ? "query" : "action");

  // Don't show controls in read-only mode
  if (readOnly) {
    return <>{children}</>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          contentEditable={false}
          className={`
            cursor-pointer rounded transition-colors
            hover:bg-accent/50
            ${selected ? "ring-2 ring-ring ring-offset-1" : ""}
          `}
          style={{
            userSelect: "none",
            display: inline ? "inline" : "block",
          }}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
        >
          {children}
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-auto p-1.5"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <div className="flex items-center gap-1">
          {/* Icon + Label */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-muted/50">
            <Icon className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">{label}</span>
          </div>

          {/* View Data button */}
          {onViewData && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onViewData();
              }}
              className="h-7 px-2 text-xs gap-1"
            >
              <Eye className="h-3 w-3" />
              View
            </Button>
          )}

          {/* Edit button */}
          {onEdit && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit();
              }}
              className="h-7 px-2 text-xs gap-1"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
