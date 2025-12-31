"use client";

/**
 * LiveQueryEditor - Full SQL editor dialog
 *
 * Features:
 * - SQL text mode with autocomplete
 * - Table and column suggestions from schema
 * - Validation (read-only for queries, mutations for actions)
 * - Apply/Cancel buttons
 * - Future: Visual mode with table/column pickers
 */

import { AlertCircle, Check, Columns, Database, Table2, Zap } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "../components/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/dialog";
import { Popover, PopoverAnchor, PopoverContent } from "../components/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/tabs";
import { Textarea } from "../components/textarea";
import { cn } from "../lib/utils";
import { type TableSchema, useSchema } from "../query-provider";
import type { LiveControlType, LiveQueryEditorProps } from "./types";

// ============================================================================
// SQL Validation
// ============================================================================

interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate SQL based on control type.
 * - query: Must be read-only (SELECT, WITH, EXPLAIN, etc.)
 * - action: Must be a mutation (INSERT, UPDATE, DELETE)
 */
function validateSql(sql: string, type: LiveControlType): ValidationResult {
  if (!sql.trim()) {
    return { valid: false, error: "SQL cannot be empty" };
  }

  const trimmed = sql.trim().toUpperCase();

  if (type === "query") {
    // Read-only queries: SELECT, WITH, EXPLAIN, PRAGMA, SHOW
    const readOnlyPatterns = /^(SELECT|WITH|EXPLAIN|PRAGMA|SHOW)\b/i;
    if (!readOnlyPatterns.test(trimmed)) {
      return {
        valid: false,
        error: "LiveValue requires a read-only query (SELECT, WITH, EXPLAIN)",
      };
    }
    // Check for mutation statements in subqueries
    const mutationPatterns = /\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE)\b/i;
    if (mutationPatterns.test(sql)) {
      return {
        valid: false,
        error: "Query contains mutation statements. Use LiveAction for mutations.",
      };
    }
  } else {
    // Action requires mutation
    const mutationPatterns = /^(INSERT|UPDATE|DELETE)\b/i;
    if (!mutationPatterns.test(trimmed)) {
      return {
        valid: false,
        error: "LiveAction requires a mutation (INSERT, UPDATE, DELETE)",
      };
    }
  }

  return { valid: true };
}

// ============================================================================
// Autocomplete Logic
// ============================================================================

interface Suggestion {
  type: "table" | "column";
  value: string;
  table?: string; // For columns, which table it belongs to
  description?: string;
}

/**
 * Get the current word being typed at cursor position
 */
function getCurrentWord(
  text: string,
  cursorPos: number,
): { word: string; start: number; end: number } {
  // Find word boundaries
  let start = cursorPos;
  let end = cursorPos;

  // Move start back to word beginning
  while (start > 0 && /[\w.]/.test(text[start - 1])) {
    start--;
  }

  // Move end forward to word end
  while (end < text.length && /[\w.]/.test(text[end])) {
    end++;
  }

  return {
    word: text.slice(start, end),
    start,
    end,
  };
}

/**
 * Detect context for suggestions (after FROM, SELECT, etc.)
 */
function detectContext(text: string, cursorPos: number): "table" | "column" | "any" {
  const beforeCursor = text.slice(0, cursorPos).toUpperCase();

  // After FROM, UPDATE, INTO, JOIN → suggest tables
  if (/\b(FROM|UPDATE|INTO|JOIN)\s+\w*$/i.test(beforeCursor)) {
    return "table";
  }

  // After SELECT, SET, WHERE, AND, OR → suggest columns
  if (/\b(SELECT|SET|WHERE|AND|OR|ON|BY)\s+\w*$/i.test(beforeCursor)) {
    return "column";
  }

  // After table name with dot → suggest columns from that table
  if (/\b(\w+)\.\w*$/i.test(beforeCursor)) {
    return "column";
  }

  return "any";
}

/**
 * Get autocomplete suggestions based on schema and context
 */
function getSuggestions(
  schema: TableSchema[],
  currentWord: string,
  context: "table" | "column" | "any",
): Suggestion[] {
  const suggestions: Suggestion[] = [];
  const searchTerm = currentWord.toLowerCase();

  // Check if we're typing after a table prefix (e.g., "users.")
  const dotIndex = currentWord.lastIndexOf(".");
  const tablePrefix = dotIndex > 0 ? currentWord.slice(0, dotIndex).toLowerCase() : null;
  const columnSearch = dotIndex > 0 ? currentWord.slice(dotIndex + 1).toLowerCase() : searchTerm;

  if (tablePrefix) {
    // Suggesting columns from specific table
    const table = schema.find((t) => t.table_name.toLowerCase() === tablePrefix);
    if (table) {
      for (const col of table.columns) {
        if (!columnSearch || col.name.toLowerCase().includes(columnSearch)) {
          suggestions.push({
            type: "column",
            value: col.name,
            table: table.table_name,
            description: col.type,
          });
        }
      }
    }
  } else {
    // General suggestions
    if (context === "table" || context === "any") {
      for (const table of schema) {
        if (!searchTerm || table.table_name.toLowerCase().includes(searchTerm)) {
          suggestions.push({
            type: "table",
            value: table.table_name,
            description: `${table.columns.length} columns`,
          });
        }
      }
    }

    if (context === "column" || context === "any") {
      for (const table of schema) {
        for (const col of table.columns) {
          if (!searchTerm || col.name.toLowerCase().includes(searchTerm)) {
            suggestions.push({
              type: "column",
              value: col.name,
              table: table.table_name,
              description: col.type,
            });
          }
        }
      }
    }
  }

  // Sort by relevance (exact prefix match first, then contains)
  return suggestions.slice(0, 10).sort((a, b) => {
    const aStartsWith = a.value.toLowerCase().startsWith(searchTerm);
    const bStartsWith = b.value.toLowerCase().startsWith(searchTerm);
    if (aStartsWith && !bStartsWith) return -1;
    if (!aStartsWith && bStartsWith) return 1;
    return a.value.localeCompare(b.value);
  });
}

// ============================================================================
// SQL Text Editor with Autocomplete
// ============================================================================

interface SqlTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  type: LiveControlType;
  validation: ValidationResult;
  schema: TableSchema[];
}

function SqlTextEditor({ value, onChange, type, validation, schema }: SqlTextEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [cursorPos, setCursorPos] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);

  const {
    word: currentWord,
    start: wordStart,
    end: wordEnd,
  } = useMemo(() => getCurrentWord(value, cursorPos), [value, cursorPos]);

  const context = useMemo(() => detectContext(value, cursorPos), [value, cursorPos]);

  const suggestions = useMemo(
    () => (schema.length > 0 ? getSuggestions(schema, currentWord, context) : []),
    [schema, currentWord, context],
  );

  // Show suggestions when we have a word and matches
  useEffect(() => {
    setShowSuggestions(currentWord.length > 0 && suggestions.length > 0);
    setSelectedIndex(0);
  }, [currentWord, suggestions.length]);

  const applySuggestion = useCallback(
    (suggestion: Suggestion) => {
      // Check if we're completing after a dot (table.column)
      const dotIndex = currentWord.lastIndexOf(".");
      const insertStart = dotIndex > 0 ? wordStart + dotIndex + 1 : wordStart;

      const newValue = value.slice(0, insertStart) + suggestion.value + value.slice(wordEnd);
      onChange(newValue);
      setShowSuggestions(false);

      // Set cursor after inserted text
      setTimeout(() => {
        if (textareaRef.current) {
          const newPos = insertStart + suggestion.value.length;
          textareaRef.current.selectionStart = newPos;
          textareaRef.current.selectionEnd = newPos;
          textareaRef.current.focus();
        }
      }, 0);
    },
    [value, currentWord, wordStart, wordEnd, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!showSuggestions || suggestions.length === 0) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setSelectedIndex((i) => (i + 1) % suggestions.length);
          break;
        case "ArrowUp":
          e.preventDefault();
          setSelectedIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
          break;
        case "Tab":
        case "Enter":
          if (suggestions[selectedIndex]) {
            e.preventDefault();
            applySuggestion(suggestions[selectedIndex]);
          }
          break;
        case "Escape":
          setShowSuggestions(false);
          break;
      }
    },
    [showSuggestions, suggestions, selectedIndex, applySuggestion],
  );

  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      onChange(e.target.value);
      setCursorPos(e.target.selectionStart);
    },
    [onChange],
  );

  const handleSelect = useCallback((e: React.SyntheticEvent<HTMLTextAreaElement>) => {
    setCursorPos((e.target as HTMLTextAreaElement).selectionStart);
  }, []);

  return (
    <div className="space-y-2 relative">
      <Popover open={showSuggestions} onOpenChange={setShowSuggestions}>
        <PopoverAnchor asChild>
          <Textarea
            ref={textareaRef}
            value={value}
            onChange={handleInput}
            onSelect={handleSelect}
            onKeyDown={handleKeyDown}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            placeholder={
              type === "query"
                ? "SELECT * FROM table_name WHERE ..."
                : "UPDATE table_name SET column = {{value}} WHERE ..."
            }
            className={cn(
              "font-mono text-sm min-h-[200px] resize-y",
              !validation.valid &&
                value.trim() &&
                "border-destructive focus-visible:ring-destructive",
            )}
            spellCheck={false}
          />
        </PopoverAnchor>
        <PopoverContent
          className="w-64 p-0"
          align="start"
          side="bottom"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command>
            <CommandList>
              <CommandEmpty>No suggestions</CommandEmpty>
              <CommandGroup>
                {suggestions.map((suggestion, index) => (
                  <CommandItem
                    key={`${suggestion.type}-${suggestion.value}-${suggestion.table || ""}`}
                    onSelect={() => applySuggestion(suggestion)}
                    className={cn(
                      "flex items-center gap-2 cursor-pointer",
                      index === selectedIndex && "bg-accent",
                    )}
                  >
                    {suggestion.type === "table" ? (
                      <Table2 className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <Columns className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    <span className="font-mono text-sm">{suggestion.value}</span>
                    {suggestion.table && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        {suggestion.table}
                      </span>
                    )}
                    {suggestion.description && !suggestion.table && (
                      <span className="text-xs text-muted-foreground ml-auto">
                        {suggestion.description}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Schema hint */}
      {schema.length > 0 && (
        <div className="text-xs text-muted-foreground">
          {schema.length} table{schema.length !== 1 ? "s" : ""} available. Type to see suggestions.
        </div>
      )}

      {/* Validation feedback */}
      {!validation.valid && value.trim() && (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span>{validation.error}</span>
        </div>
      )}
      {validation.valid && value.trim() && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="h-4 w-4 text-green-600" />
          <span>Valid {type === "query" ? "query" : "action"}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function LiveQueryEditor({
  initialQuery,
  type,
  onApply,
  onCancel,
  open,
  onOpenChange,
  schema: schemaProp,
}: LiveQueryEditorProps) {
  const [mode, setMode] = useState<"visual" | "sql">("sql");
  const [sql, setSql] = useState(initialQuery);

  // Get schema from context or prop
  const schemaFromContext = useSchema();
  const schema: TableSchema[] =
    schemaProp?.map((t) => ({
      table_name: t.table_name,
      columns: t.columns,
    })) ?? schemaFromContext;

  // Reset SQL when dialog opens with new initial value
  useEffect(() => {
    if (open) {
      setSql(initialQuery);
    }
  }, [open, initialQuery]);

  const validation = validateSql(sql, type);
  const Icon = type === "query" ? Database : Zap;

  const handleApply = useCallback(() => {
    if (validation.valid) {
      onApply(sql.trim());
      onOpenChange(false);
    }
  }, [sql, validation.valid, onApply, onOpenChange]);

  const handleCancel = useCallback(() => {
    onCancel();
    onOpenChange(false);
  }, [onCancel, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            Edit {type === "query" ? "Query" : "Action"}
          </DialogTitle>
          <DialogDescription>
            {type === "query"
              ? "Define a read-only SQL query to fetch data."
              : "Define a SQL mutation with {{field}} bindings for form values."}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as "visual" | "sql")} className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="visual" disabled>
              Visual
            </TabsTrigger>
            <TabsTrigger value="sql">SQL</TabsTrigger>
          </TabsList>

          <TabsContent value="visual" className="mt-4">
            <div className="flex items-center justify-center h-[200px] text-muted-foreground text-sm">
              Visual query builder coming soon...
            </div>
          </TabsContent>

          <TabsContent value="sql" className="mt-4">
            <SqlTextEditor
              value={sql}
              onChange={setSql}
              type={type}
              validation={validation}
              schema={schema}
            />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!validation.valid}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
