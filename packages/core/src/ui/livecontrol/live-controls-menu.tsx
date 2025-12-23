"use client";

/**
 * LiveControlsMenu - Minimal popover for live elements
 *
 * Purple-branded to match the lightning bolt "live" identity.
 * Shows on hover with icon-only actions for a clean look.
 */

import { useState } from "react";
import { Zap, Eye, Pencil } from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/popover";
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
            hover:bg-purple-500/10
            ${selected ? "ring-1 ring-purple-500/30" : ""}
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
        className="w-auto p-0 border-purple-500/20 bg-purple-950/95 backdrop-blur-sm"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
      >
        <div className="flex items-center gap-0.5 p-0.5">
          {/* Zap icon + label pill */}
          <div className="flex items-center gap-1 px-1.5 py-0.5 text-purple-300">
            <Zap className="h-3 w-3 fill-purple-400 text-purple-400" />
            <span className="text-[10px] font-medium">{label}</span>
          </div>

          {/* Divider */}
          {(onViewData || onEdit) && (
            <div className="w-px h-3 bg-purple-500/30" />
          )}

          {/* View Data button - icon only */}
          {onViewData && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onViewData();
              }}
              className="p-1 rounded hover:bg-purple-500/20 text-purple-300 hover:text-purple-100 transition-colors"
              title="View data"
            >
              <Eye className="h-3 w-3" />
            </button>
          )}

          {/* Edit button - icon only */}
          {onEdit && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit();
              }}
              className="p-1 rounded hover:bg-purple-500/20 text-purple-300 hover:text-purple-100 transition-colors"
              title="Edit query"
            >
              <Pencil className="h-3 w-3" />
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
