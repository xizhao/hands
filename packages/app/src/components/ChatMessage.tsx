import { LiveQueryProvider, type QueryResult, type MutationResult } from "@hands/core/stdlib";
import { PreviewEditor } from "@hands/editor";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Copy,
  Database,
  File,
  FileCode,
  GitBranch,
  Glasses,
  Globe,
  Key,
  List,
  ListTodo,
  Loader2,
  type LucideIcon,
  Navigation,
  PenLine,
  Search,
  Terminal,
} from "lucide-react";
import { memo, useMemo, useState, useCallback, type ReactNode } from "react";
import { useInView } from "react-intersection-observer";
import { useLiveQuery as useDesktopLiveQuery } from "@/lib/live-query";
import { useActiveRuntime } from "@/hooks/useWorkbook";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import { NavigateCard, parseNavigateOutput } from "@/components/NavigateCard";
import { parseSecretsOutput, SecretsForm } from "@/components/SecretsForm";
import { SubagentSummary } from "@/components/SubagentSummary";
import { TaskToolSummary } from "@/components/TaskToolSummary";
import { Button } from "@/components/ui/button";
import { ShimmerText, Skeleton } from "@/components/ui/thinking-indicator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type {
  AgentPart,
  AssistantMessage,
  MessageWithParts,
  Part,
  ReasoningPart,
  TextPart,
  ToolPart,
} from "@/lib/api";
import { matchPrompt, type PromptMatch } from "@/lib/prompts";
import { cn, MSG_FONT } from "@/lib/utils";

interface ChatMessageProps {
  message: MessageWithParts;
  isStreaming?: boolean;
  compact?: boolean;
  /** When true, bubble tails point down (for bottom-up message flow like FloatingChat) */
  tailDown?: boolean;
}

// Format token count with K/M suffix
const formatTokens = (count: number): string => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
};

// Tool registry - maps tool names to icons and labels
interface ToolConfig {
  icon: LucideIcon;
  label: string;
  getSubtitle?: (input: Record<string, unknown>) => string;
}

const TOOL_REGISTRY: Record<string, ToolConfig> = {
  read: {
    icon: Glasses,
    label: "Read",
    getSubtitle: (input) => (input.filePath ? getFilename(String(input.filePath)) : ""),
  },
  glob: {
    icon: Search,
    label: "Search",
    getSubtitle: (input) => (input.pattern ? String(input.pattern) : ""),
  },
  grep: {
    icon: Search,
    label: "Search",
    getSubtitle: (input) => (input.pattern ? String(input.pattern) : ""),
  },
  list: {
    icon: List,
    label: "List",
    getSubtitle: (input) => (input.path ? String(input.path) : ""),
  },
  bash: {
    icon: Terminal,
    label: "Terminal",
    getSubtitle: (input) => (input.command ? String(input.command).slice(0, 40) : ""),
  },
  edit: {
    icon: PenLine,
    label: "Edit",
    getSubtitle: (input) => (input.file_path ? getFilename(String(input.file_path)) : ""),
  },
  write: {
    icon: FileCode,
    label: "Write",
    getSubtitle: (input) => (input.file_path ? getFilename(String(input.file_path)) : ""),
  },
  webfetch: {
    icon: Globe,
    label: "Fetch",
    getSubtitle: (input) => {
      try {
        return input.url ? new URL(String(input.url)).hostname : "";
      } catch {
        return "";
      }
    },
  },
  websearch: {
    icon: Globe,
    label: "Search",
    getSubtitle: (input) => (input.query ? String(input.query).slice(0, 30) : ""),
  },
  task: {
    icon: GitBranch,
    label: "Task",
    getSubtitle: (input) => (input.description ? String(input.description).slice(0, 30) : ""),
  },
  todowrite: {
    icon: ListTodo,
    label: "Plan",
  },
  sql: {
    icon: Database,
    label: "Query",
  },
  psql: {
    icon: Database,
    label: "psql",
    getSubtitle: (input) => (input.query ? String(input.query).slice(0, 40) : ""),
  },
  schemaread: {
    icon: Database,
    label: "Schema",
    getSubtitle: (input) => (input.table ? String(input.table) : "all tables"),
  },
  secrets: {
    icon: Key,
    label: "Secrets",
    getSubtitle: (input) => {
      const action = input.action as string;
      const keys = input.keys as string[] | undefined;
      if (action === "list") return "listing";
      if (keys?.length) return keys.slice(0, 2).join(", ");
      return action || "";
    },
  },
  navigate: {
    icon: Navigation,
    label: "Navigate",
    getSubtitle: (input) => {
      const title = input.title as string | undefined;
      const page = input.page as string | undefined;
      return title || page || "";
    },
  },
};

const getFilename = (path: string): string => {
  const parts = path.split("/");
  return parts[parts.length - 1] || path;
};

const getToolConfig = (toolName: string): ToolConfig => {
  const lowerName = toolName.toLowerCase();
  if (TOOL_REGISTRY[lowerName]) return TOOL_REGISTRY[lowerName];
  for (const [key, config] of Object.entries(TOOL_REGISTRY)) {
    if (lowerName.includes(key)) return config;
  }
  return { icon: Terminal, label: toolName };
};

// Copy button
const CopyButton = ({ text, className }: { text: string; className?: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn("h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity", className)}
      onClick={handleCopy}
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
};

// Collapsible code block - collapsed by default for large blocks
const CODE_COLLAPSE_THRESHOLD = 8; // Lines above which code is collapsed

const CollapsibleCodeBlock = memo(
  ({
    code,
    language,
    codeBlockFontSize,
    metaFontSize,
  }: {
    code: string;
    language: string;
    codeBlockFontSize: string;
    metaFontSize: string;
  }) => {
    const lines = code.split("\n");
    const lineCount = lines.length;
    const isLarge = lineCount > CODE_COLLAPSE_THRESHOLD;
    const [expanded, setExpanded] = useState(!isLarge);

    // Preview: first 3 lines
    const previewCode = lines.slice(0, 3).join("\n") + (lineCount > 3 ? "\n..." : "");

    return (
      <div className="relative group rounded-lg overflow-hidden my-2">
        {/* Header - clickable to expand/collapse for large blocks */}
        <div
          className={cn(
            "flex items-center justify-between px-2 py-1 bg-background/60",
            isLarge && "cursor-pointer hover:bg-background/70",
          )}
          onClick={() => isLarge && setExpanded(!expanded)}
        >
          <div className="flex items-center gap-2">
            <span className={cn("text-muted-foreground/40 font-mono uppercase", metaFontSize)}>
              {language}
            </span>
            {isLarge && (
              <span className={cn("text-muted-foreground/30", metaFontSize)}>
                {lineCount} lines
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isLarge && (
              <span className={cn("text-muted-foreground/40 mr-1", metaFontSize)}>
                {expanded ? "collapse" : "expand"}
              </span>
            )}
            {isLarge &&
              (expanded ? (
                <ChevronDown className="h-3 w-3 text-muted-foreground/40" />
              ) : (
                <ChevronRight className="h-3 w-3 text-muted-foreground/40" />
              ))}
            <CopyButton text={code} />
          </div>
        </div>

        {/* Code content */}
        <AnimatePresence initial={false}>
          {expanded ? (
            <motion.div
              initial={isLarge ? { height: 0, opacity: 0 } : false}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <SyntaxHighlighter
                style={oneDark}
                language={language}
                PreTag="div"
                customStyle={{
                  margin: 0,
                  borderRadius: "0 0 0.5rem 0.5rem",
                  fontSize: codeBlockFontSize,
                  padding: "0.75rem",
                  background: "hsl(var(--background) / 0.5)",
                }}
              >
                {code}
              </SyntaxHighlighter>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="relative"
            >
              <SyntaxHighlighter
                style={oneDark}
                language={language}
                PreTag="div"
                customStyle={{
                  margin: 0,
                  borderRadius: "0 0 0.5rem 0.5rem",
                  fontSize: codeBlockFontSize,
                  padding: "0.75rem",
                  background: "hsl(var(--background) / 0.5)",
                  maxHeight: "5rem",
                  overflow: "hidden",
                }}
              >
                {previewCode}
              </SyntaxHighlighter>
              {/* Fade overlay */}
              <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background/80 to-transparent pointer-events-none" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  },
);

CollapsibleCodeBlock.displayName = "CollapsibleCodeBlock";

// Parse psql table output into structured data
interface ParsedTable {
  headers: string[];
  rows: string[][];
  rowCount: number;
}

const parsePsqlOutput = (output: string): ParsedTable | null => {
  if (!output || output.startsWith("Query executed") || output.startsWith("(no rows)")) {
    return null;
  }

  const lines = output.trim().split("\n");
  if (lines.length < 2) return null;

  // Find the separator line (---+---)
  const sepIndex = lines.findIndex((line) => /^-+(\+-+)+$/.test(line.replace(/\s/g, "")));
  if (sepIndex < 1) return null;

  // Parse headers from line before separator
  const headerLine = lines[sepIndex - 1];
  const headers = headerLine
    .split("|")
    .map((h) => h.trim())
    .filter(Boolean);
  if (headers.length === 0) return null;

  // Parse data rows (after separator, before row count)
  const rows: string[][] = [];
  for (let i = sepIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    // Stop at row count line
    if (line.match(/^\s*\(\d+ rows?\)\s*$/)) break;
    if (!line.includes("|")) continue;

    const cells = line.split("|").map((c) => c.trim());
    if (cells.length >= headers.length) {
      rows.push(cells.slice(0, headers.length));
    }
  }

  // Extract row count from footer
  const countMatch = output.match(/\((\d+) rows?\)/);
  const rowCount = countMatch ? parseInt(countMatch[1], 10) : rows.length;

  return { headers, rows, rowCount };
};

// QueryResult component - renders psql output as expandable DataTable
const QueryResult = memo(
  ({
    output,
    query: _query,
    compact = false,
  }: {
    output: string;
    query?: string;
    compact?: boolean;
  }) => {
    const [expanded, setExpanded] = useState(false);
    const parsed = useMemo(() => parsePsqlOutput(output), [output]);

    const labelFont = compact ? MSG_FONT.labelCompact : MSG_FONT.label;
    const metaFont = compact ? MSG_FONT.metaCompact : MSG_FONT.meta;

    // If not a table result, show as plain text
    if (!parsed || parsed.rows.length === 0) {
      return (
        <div className={cn("text-muted-foreground/70 font-mono", labelFont)}>
          {output.slice(0, 200)}
          {output.length > 200 && "..."}
        </div>
      );
    }

    const previewRows = parsed.rows.slice(0, 3);
    const hasMore = parsed.rows.length > 3;

    return (
      <div className="mt-1">
        {/* Compact preview table */}
        <div className="rounded-md overflow-hidden border border-border/50 bg-background/30">
          <table className={cn("w-full font-mono", metaFont)}>
            <thead>
              <tr className="bg-background/50">
                {parsed.headers.map((h, i) => (
                  <th
                    key={i}
                    className="px-2 py-1 text-left text-muted-foreground/60 font-medium truncate max-w-[120px]"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(expanded ? parsed.rows : previewRows).map((row, i) => (
                <tr key={i} className="border-t border-border/20 hover:bg-foreground/5">
                  {row.map((cell, j) => (
                    <td
                      key={j}
                      className="px-2 py-1 text-muted-foreground/80 truncate max-w-[120px]"
                      title={cell}
                    >
                      {cell || <span className="text-muted-foreground/30">null</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Footer with expand/collapse and row count */}
        <div className="flex items-center justify-between mt-1 px-1">
          <span className={cn("text-muted-foreground/40", metaFont)}>
            {parsed.rowCount} row{parsed.rowCount !== 1 && "s"}
          </span>
          {hasMore && (
            <button
              onClick={() => setExpanded(!expanded)}
              className={cn(
                "text-blue-400/70 hover:text-blue-400 flex items-center gap-0.5",
                metaFont,
              )}
            >
              {expanded ? (
                <>
                  Show less <ChevronDown className="h-2.5 w-2.5" />
                </>
              ) : (
                <>
                  Show all {parsed.rowCount} <ChevronRight className="h-2.5 w-2.5" />
                </>
              )}
            </button>
          )}
        </div>
      </div>
    );
  },
);

QueryResult.displayName = "QueryResult";

// Todo item interface
interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
}

// TodoResult component - compact renderer for todowrite tool
const TodoResult = memo(
  ({ input, compact = false }: { input: { todos?: TodoItem[] }; compact?: boolean }) => {
    const [expanded, setExpanded] = useState(false);
    const todos = input?.todos || [];

    const labelFont = compact ? MSG_FONT.labelCompact : MSG_FONT.label;

    // If no todos, show "Plan completed"
    if (todos.length === 0) {
      return (
        <div className={cn("flex items-center gap-1.5 text-green-400/70", labelFont)}>
          <CheckCircle2 className="h-3 w-3" />
          <span>Plan completed</span>
        </div>
      );
    }

    const completedCount = todos.filter((t) => t.status === "completed").length;
    const inProgressCount = todos.filter((t) => t.status === "in_progress").length;
    const pendingCount = todos.filter((t) => t.status === "pending").length;

    // All completed
    if (completedCount === todos.length) {
      return (
        <div className={cn("flex items-center gap-1.5 text-green-400/70", labelFont)}>
          <CheckCircle2 className="h-3 w-3" />
          <span>All {completedCount} tasks completed</span>
        </div>
      );
    }

    // Summary line
    const summaryParts: string[] = [];
    if (inProgressCount > 0) summaryParts.push(`${inProgressCount} in progress`);
    if (completedCount > 0) summaryParts.push(`${completedCount} done`);
    if (pendingCount > 0) summaryParts.push(`${pendingCount} pending`);

    return (
      <div className="py-0.5">
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "flex items-center gap-1.5 text-muted-foreground/60 hover:text-muted-foreground",
            labelFont,
          )}
        >
          {inProgressCount > 0 ? (
            <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
          ) : (
            <ListTodo className="h-3 w-3" />
          )}
          <span>{todos.length} tasks</span>
          <span className="text-muted-foreground/40">· {summaryParts.join(", ")}</span>
          {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>

        <AnimatePresence>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="ml-2 mt-1.5 space-y-1 border-l border-border/30 pl-2">
                {todos.map((todo, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex items-start gap-1.5",
                      labelFont,
                      todo.status === "completed" && "text-muted-foreground/40",
                      todo.status === "in_progress" && "text-blue-400",
                    )}
                  >
                    {todo.status === "completed" ? (
                      <CheckCircle2 className="h-3 w-3 shrink-0 mt-0.5 text-green-400/70" />
                    ) : todo.status === "in_progress" ? (
                      <Loader2 className="h-3 w-3 shrink-0 mt-0.5 animate-spin" />
                    ) : (
                      <Circle className="h-3 w-3 shrink-0 mt-0.5 text-muted-foreground/40" />
                    )}
                    <span className={cn(todo.status === "completed" && "line-through")}>
                      {todo.status === "in_progress" && todo.activeForm
                        ? todo.activeForm
                        : todo.content}
                    </span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  },
);

TodoResult.displayName = "TodoResult";

// Collapsible tool thread
const ToolThread = memo(({ tools, compact = false }: { tools: ToolPart[]; compact?: boolean }) => {
  const [expanded, setExpanded] = useState(false);

  const labelFont = compact ? MSG_FONT.labelCompact : MSG_FONT.label;

  const runningCount = tools.filter(
    (t) => t.state.status === "running" || t.state.status === "pending",
  ).length;
  const completedCount = tools.filter((t) => t.state.status === "completed").length;
  const errorCount = tools.filter((t) => t.state.status === "error").length;

  const isRunning = runningCount > 0;
  const summary = isRunning
    ? `${runningCount} running...`
    : `${completedCount} completed${errorCount > 0 ? `, ${errorCount} failed` : ""}`;

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors",
          "text-muted-foreground/60 hover:text-muted-foreground hover:bg-foreground/5",
          labelFont,
        )}
      >
        {isRunning ? (
          <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
        ) : errorCount > 0 ? (
          <AlertCircle className="h-3 w-3 text-red-400" />
        ) : (
          <Terminal className="h-3 w-3" />
        )}
        <span>{tools.length} tools</span>
        <span className="text-muted-foreground/40">· {summary}</span>
        {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="ml-2 mt-1 space-y-0.5 border-l border-border/30 pl-2">
              {tools.map((tool) => (
                <ToolInvocation key={tool.id} part={tool} compact={compact} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

ToolThread.displayName = "ToolThread";

// Compact inline tool display
const ToolInvocation = memo(({ part, compact = false }: { part: ToolPart; compact?: boolean }) => {
  const [expanded, setExpanded] = useState(false);
  const { state, tool: toolName } = part;
  const config = getToolConfig(toolName);
  const Icon = config.icon;

  const labelFont = compact ? MSG_FONT.labelCompact : MSG_FONT.label;
  const metaFont = compact ? MSG_FONT.metaCompact : MSG_FONT.meta;

  const isRunning = state.status === "running" || state.status === "pending";
  const isError = state.status === "error";

  // Check if this is the todowrite tool
  const isTodoTool = toolName.toLowerCase() === "todowrite";

  // Check if this is a SQL tool with table output
  // Tool name could be "psql", "psqlTool", or prefixed like "hands_psql", "psql_psqlTool"
  const isPsqlTool =
    toolName.toLowerCase().endsWith("psql") || toolName.toLowerCase().endsWith("psqltool");
  const hasTableResult =
    isPsqlTool &&
    state.status === "completed" &&
    state.output &&
    state.output.includes("|") &&
    state.output.includes("---");

  const subtitle = useMemo(() => {
    if (state.status === "completed" && state.title) return state.title;
    if (state.status === "running" && state.title) return state.title;
    if (config.getSubtitle && state.input) {
      return config.getSubtitle(state.input as Record<string, unknown>);
    }
    return null;
  }, [state, config]);

  const hasDetails = Boolean(
    state.input || (state.status === "completed" && state.output) || isError,
  );

  // For todowrite, use custom compact renderer
  if (isTodoTool && state.input) {
    return <TodoResult input={state.input as { todos?: TodoItem[] }} compact={compact} />;
  }

  // For schema tool, show simple non-expandable line (no input/output details)
  const isSchemaTool = toolName.toLowerCase().endsWith("schema");
  if (isSchemaTool) {
    return (
      <div className="py-0.5">
        <div className={cn("flex items-center gap-1.5 text-muted-foreground/60", labelFont)}>
          {isRunning ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin text-blue-400" />
          ) : isError ? (
            <AlertCircle className="h-2.5 w-2.5 text-red-400" />
          ) : (
            <Database className="h-2.5 w-2.5" />
          )}
          <span>{isRunning ? "Reading database schema..." : "Read database schema"}</span>
        </div>
      </div>
    );
  }

  // For psql with table results, always show the result inline
  if (hasTableResult) {
    return (
      <div className="py-1">
        <div className={cn("flex items-center gap-1.5 text-muted-foreground/60 mb-1", labelFont)}>
          <Database className="h-2.5 w-2.5 text-blue-400" />
          <span
            className={cn("font-mono text-muted-foreground/50 truncate max-w-[250px]", metaFont)}
          >
            {(state.input as Record<string, unknown>)?.query as string}
          </span>
        </div>
        <QueryResult
          // biome-ignore lint/style/noNonNullAssertion: output is validated before render
          output={state.output!}
          query={(state.input as Record<string, unknown>)?.query as string}
          compact={compact}
        />
      </div>
    );
  }

  // Check if this is the secrets tool with a form request
  const isSecretsTool = toolName.toLowerCase().includes("secrets");
  const secretsRequest =
    isSecretsTool && state.status === "completed" && state.output
      ? parseSecretsOutput(state.output)
      : null;

  // For secrets with form request, show the form
  if (secretsRequest) {
    return (
      <div className="py-1">
        <div className={cn("flex items-center gap-1.5 text-muted-foreground/60 mb-1", labelFont)}>
          <Key className="h-2.5 w-2.5 text-blue-400" />
          <span>Secrets</span>
        </div>
        <SecretsForm output={secretsRequest} />
      </div>
    );
  }

  // Check if this is the navigate tool with a navigation request
  const isNavigateTool = toolName.toLowerCase().includes("navigate");
  const navigateRequest =
    isNavigateTool && state.status === "completed" && state.output
      ? parseNavigateOutput(state.output)
      : null;

  // For navigate with valid output, show the navigation link
  if (navigateRequest) {
    return (
      <div className="py-0.5">
        <NavigateCard output={navigateRequest} toolId={part.id} />
      </div>
    );
  }

  return (
    <div className="py-0.5">
      <button
        className={cn(
          "flex items-center gap-1.5 text-muted-foreground/60",
          labelFont,
          hasDetails && "cursor-pointer hover:text-muted-foreground",
        )}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        {isRunning ? (
          <Loader2 className="h-2.5 w-2.5 animate-spin text-blue-400" />
        ) : isError ? (
          <AlertCircle className="h-2.5 w-2.5 text-red-400" />
        ) : (
          <Icon className="h-2.5 w-2.5" />
        )}
        <span>{config.label}</span>
        {subtitle && (
          <span
            className={cn("text-muted-foreground/40 font-mono truncate max-w-[150px]", metaFont)}
          >
            {subtitle}
          </span>
        )}
        {hasDetails &&
          (expanded ? (
            <ChevronDown className="h-2.5 w-2.5" />
          ) : (
            <ChevronRight className="h-2.5 w-2.5" />
          ))}
      </button>

      <AnimatePresence>
        {expanded && hasDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div
              className={cn(
                "ml-4 mt-1 p-2 rounded-lg bg-background/30 font-mono space-y-1.5",
                metaFont,
              )}
            >
              {state.input && (
                <div>
                  <span className={cn("text-muted-foreground/40 uppercase", metaFont)}>
                    input:{" "}
                  </span>
                  <span className="text-muted-foreground/70 break-all">
                    {JSON.stringify(state.input).slice(0, 300)}
                  </span>
                </div>
              )}
              {isError && state.status === "error" && (
                <div className="text-red-400">{state.error}</div>
              )}
              {state.status === "completed" && state.output && (
                <div>
                  <span className={cn("text-muted-foreground/40 uppercase", metaFont)}>
                    output:{" "}
                  </span>
                  <span className="text-muted-foreground/70 break-all">
                    {state.output.slice(0, 300)}
                    {state.output.length > 300 && "..."}
                  </span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

ToolInvocation.displayName = "ToolInvocation";

/**
 * Detect incomplete MDX blocks during streaming.
 * Returns { complete: string, incomplete: string | null }
 * where 'complete' is renderable content and 'incomplete' is the partial block.
 */
function splitIncompleteBlock(text: string): { complete: string; incomplete: string | null; blockType: string | null } {
  // Check for unclosed code fence (```mdx or ``` without closing)
  const codeFenceMatch = text.match(/```(\w*)\n?[^`]*$/);
  if (codeFenceMatch) {
    const fenceStart = text.lastIndexOf("```");
    // Make sure it's not a closed fence
    const afterFence = text.slice(fenceStart + 3);
    if (!afterFence.includes("```")) {
      return {
        complete: text.slice(0, fenceStart).trimEnd(),
        incomplete: text.slice(fenceStart),
        blockType: codeFenceMatch[1] || "code",
      };
    }
  }

  // Case 1: Opening tag not yet closed (no > yet)
  // e.g., <LiveValue query="SELECT
  const unclosedTagMatch = text.match(/<([A-Z][a-zA-Z]*)[^>]*$/);
  if (unclosedTagMatch) {
    const tagStart = text.lastIndexOf("<" + unclosedTagMatch[1]);
    return {
      complete: text.slice(0, tagStart).trimEnd(),
      incomplete: text.slice(tagStart),
      blockType: unclosedTagMatch[1],
    };
  }

  // Case 2: Opening tag closed but missing closing tag
  // e.g., <LiveValue query="..."> without </LiveValue>
  // Check common MDX components that need closing tags
  const mdxComponents = [
    'LiveValue', 'LiveAction', 'LiveQuery',
    'BarChart', 'LineChart', 'PieChart', 'AreaChart', 'ScatterChart', 'HeatmapChart', 'HistogramChart', 'BoxPlotChart', 'Chart',
    'Page', 'Card', 'Table',
  ];

  for (const name of mdxComponents) {
    // Count non-self-closing opens vs closes
    const openRegex = new RegExp(`<${name}(?:\\s[^>]*)?>`, 'g');
    const selfCloseRegex = new RegExp(`<${name}[^>]*/>`, 'g');
    const closeRegex = new RegExp(`</${name}>`, 'g');

    const allOpens = text.match(openRegex) || [];
    const selfCloses = text.match(selfCloseRegex) || [];
    const closes = text.match(closeRegex) || [];

    // Non-self-closing opens = all opens minus self-closes
    const unclosedCount = allOpens.length - selfCloses.length - closes.length;

    if (unclosedCount > 0) {
      // Find the last unclosed opening tag
      const lastOpenIdx = text.lastIndexOf(`<${name}`);
      if (lastOpenIdx !== -1) {
        // Make sure it's not self-closing
        const tagEnd = text.indexOf('>', lastOpenIdx);
        if (tagEnd !== -1 && text[tagEnd - 1] !== '/') {
          return {
            complete: text.slice(0, lastOpenIdx).trimEnd(),
            incomplete: text.slice(lastOpenIdx),
            blockType: name,
          };
        }
      }
    }
  }

  return { complete: text, incomplete: null, blockType: null };
}

// Shimmer loader for incomplete MDX blocks - matches LiveValue loading style
const MdxShimmerBlock = memo(({ blockType, compact = false }: { blockType: string; compact?: boolean }) => {
  const metaFont = compact ? MSG_FONT.metaCompact : MSG_FONT.meta;

  return (
    <motion.div
      className={cn(
        "relative inline-flex items-center gap-2 px-3 py-1.5 rounded-lg overflow-hidden",
        "bg-purple-500/10 border border-purple-500/20",
      )}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* Shimmer overlay */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(168, 85, 247, 0.15), transparent)",
        }}
        animate={{ x: ["-100%", "100%"] }}
        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
      />
      <span className={cn("relative font-mono text-purple-400", metaFont)}>
        {blockType}
      </span>
      <span className="relative flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="w-1 h-1 rounded-full bg-purple-400"
            animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
            transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }}
          />
        ))}
      </span>
    </motion.div>
  );
});

MdxShimmerBlock.displayName = "MdxShimmerBlock";

// No-op query adapter when runtime not connected
const noopQueryAdapter = (): QueryResult => ({
  data: [],
  isLoading: false,
  error: null,
  refetch: async () => {},
});

const noopMutationAdapter = (): MutationResult => ({
  mutate: async () => {},
  isPending: false,
  error: null,
});

// Inner wrapper that uses live query (only rendered when runtime connected)
function LiveChatQueryWrapper({ children, runtimePort }: { children: ReactNode; runtimePort: number }) {
  // Query adapter for LiveQueryProvider - NOT wrapped in useCallback
  // because it needs to be called as a hook during render
  const useQueryAdapter = (
    sql: string,
    params?: Record<string, unknown>
  ): QueryResult => {
    const paramsArray = params ? Object.values(params) : undefined;

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const result = useDesktopLiveQuery({
      sql,
      params: paramsArray,
      enabled: !!sql && sql.trim().length > 0,
      runtimePort,
    });

    return {
      data: result.data,
      isLoading: result.isLoading,
      error: result.error,
      refetch: result.refetch,
    };
  };

  // Mutation adapter - chat previews are read-only
  const useMutationAdapter = (): MutationResult => ({
    mutate: async () => {
      console.warn("[ChatPreview] Mutations not supported in chat preview");
    },
    isPending: false,
    error: null,
  });

  return (
    <LiveQueryProvider useQuery={useQueryAdapter} useMutation={useMutationAdapter}>
      {children}
    </LiveQueryProvider>
  );
}

// Wrapper that provides LiveQueryProvider for chat previews
function ChatQueryWrapper({ children }: { children: ReactNode }) {
  const { data: runtime } = useActiveRuntime();
  const runtimePort = runtime?.runtime_port ?? null;

  // When runtime not connected, use no-op adapters (avoids tRPC context error)
  if (!runtimePort) {
    return (
      <LiveQueryProvider useQuery={noopQueryAdapter} useMutation={noopMutationAdapter}>
        {children}
      </LiveQueryProvider>
    );
  }

  return (
    <LiveChatQueryWrapper runtimePort={runtimePort}>
      {children}
    </LiveChatQueryWrapper>
  );
}

// Lightweight placeholder for off-screen text content
const TextPlaceholder = memo(({ text, compact = false }: { text: string; compact?: boolean }) => {
  const fontSize = compact ? MSG_FONT.baseCompact : MSG_FONT.base;
  // Show first 100 chars as plain text placeholder
  const preview = text.slice(0, 100) + (text.length > 100 ? "..." : "");

  return (
    <div className={cn("text-muted-foreground/50 min-h-[1.5em]", fontSize)}>
      {preview}
    </div>
  );
});

TextPlaceholder.displayName = "TextPlaceholder";

// Text content with MDX preview (renders LiveValue, charts, etc.)
const TextContent = memo(
  ({
    text,
    isStreaming = false,
    darkText = false,
    compact = false,
  }: {
    text: string;
    isStreaming?: boolean;
    darkText?: boolean;
    compact?: boolean;
  }) => {
    const fontSize = compact ? MSG_FONT.baseCompact : MSG_FONT.base;

    // Lazy-load MDX rendering - only compile when visible
    // Always render when streaming to show live updates
    const { ref, inView } = useInView({
      triggerOnce: true, // Once visible, keep rendered
      rootMargin: "200px", // Pre-load 200px before entering viewport
      skip: isStreaming, // Always render during streaming
    });

    // During streaming, detect incomplete MDX blocks and show loader chip
    const { complete, incomplete, blockType } = useMemo(
      () => (isStreaming ? splitIncompleteBlock(text) : { complete: text, incomplete: null, blockType: null }),
      [text, isStreaming]
    );

    const shouldRenderMdx = isStreaming || inView;

    return (
      <div
        ref={ref}
        className={cn(
          "prose max-w-none prose-p:my-0.5 prose-pre:my-1 prose-p:leading-relaxed relative group/preview",
          fontSize,
          darkText ? "prose-neutral" : "dark:prose-invert",
        )}
      >
        {complete && shouldRenderMdx ? (
          <PreviewEditor
            value={complete}
            wrapper={ChatQueryWrapper}
            contentClassName={cn(
              "!p-0 !min-h-0",
              fontSize,
            )}
          />
        ) : complete && !shouldRenderMdx ? (
          <TextPlaceholder text={complete} compact={compact} />
        ) : null}
        {isStreaming && incomplete && blockType && (
          <div className="mt-1">
            <MdxShimmerBlock blockType={blockType} compact={compact} />
          </div>
        )}
        {isStreaming && !incomplete && (
          <motion.span
            className="inline-block w-0.5 h-4 bg-primary ml-0.5 align-middle"
            animate={{ opacity: [1, 0] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
          />
        )}
        {/* Copy markdown overlay */}
        {!isStreaming && text.length > 0 && (
          <div className="absolute top-0 right-0 opacity-0 group-hover/preview:opacity-100 transition-opacity">
            <CopyButton text={text} className="opacity-100 h-5 w-5 text-muted-foreground hover:text-foreground hover:bg-muted/50" />
          </div>
        )}
      </div>
    );
  },
);

TextContent.displayName = "TextContent";

// Minimal inline reasoning - shows duration, expandable to see text
const ReasoningContent = memo(
  ({ part, compact = false }: { part: ReasoningPart; compact?: boolean }) => {
    const [expanded, setExpanded] = useState(false);
    const metaFont = compact ? MSG_FONT.metaCompact : MSG_FONT.meta;

    // Don't render if no text
    if (!part.text || part.text.trim().length === 0) {
      return null;
    }

    // Calculate duration from time.start and time.end
    const duration = part.time?.end && part.time?.start
      ? Math.round((part.time.end - part.time.start) / 1000)
      : null;

    const durationText = duration !== null
      ? `Reasoned for ${duration}s`
      : "Reasoning...";

    return (
      <div
        className={cn(
          "text-muted-foreground/40 italic cursor-pointer hover:text-muted-foreground/60 transition-colors",
          metaFont,
        )}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <div>
            <span className="not-italic">{durationText}</span>
            <div className="mt-1 whitespace-pre-wrap text-muted-foreground/30">{part.text}</div>
          </div>
        ) : (
          <span>{durationText}</span>
        )}
      </div>
    );
  },
);

ReasoningContent.displayName = "ReasoningContent";

// File chip for displaying file paths in user messages
const FileChip = memo(({ path, compact = false }: { path: string; compact?: boolean }) => {
  const filename = getFilename(path);
  const codeFont = compact ? MSG_FONT.codeCompact : MSG_FONT.code;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary-foreground/20 text-primary-foreground font-mono",
        codeFont,
      )}
    >
      <File className="h-3 w-3 shrink-0" />
      <span className="truncate max-w-[200px]" title={path}>
        {filename}
      </span>
    </span>
  );
});

FileChip.displayName = "FileChip";

// Action chip for displaying standard prompts with icon
const ActionChip = memo(({ match, compact = false }: { match: PromptMatch; compact?: boolean }) => {
  const Icon = match.meta.icon;
  const baseFont = compact ? MSG_FONT.baseCompact : MSG_FONT.base;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg",
        "bg-primary-foreground/20 text-primary-foreground",
      )}
    >
      <Icon className={cn("h-3.5 w-3.5 shrink-0", match.meta.color)} />
      <span className={cn("font-medium", baseFont)}>{match.meta.label}</span>
    </span>
  );
});

ActionChip.displayName = "ActionChip";

// Parse text and render file paths as chips
// Matches absolute paths like /Users/foo/bar.txt or relative paths starting with ./
const FILE_PATH_REGEX = /((?:\/[\w.-]+)+(?:\.\w+)?|\.\/[\w./-]+)/g;

const UserTextContent = memo(({ text, compact = false }: { text: string; compact?: boolean }) => {
  // Check if this is a standard prompt first
  const promptMatch = useMemo(() => matchPrompt(text), [text]);

  // Parse file paths from text (must call before any early returns per Rules of Hooks)
  const parts = useMemo(() => {
    const result: Array<{ type: "text" | "file"; content: string }> = [];
    let lastIndex = 0;
    let match;

    // Reset regex state
    FILE_PATH_REGEX.lastIndex = 0;

    while ((match = FILE_PATH_REGEX.exec(text)) !== null) {
      const path = match[0];

      // Add text before the match
      if (match.index > lastIndex) {
        result.push({ type: "text", content: text.slice(lastIndex, match.index) });
      }

      // Add the file path
      result.push({ type: "file", content: path });
      lastIndex = match.index + path.length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
      result.push({ type: "text", content: text.slice(lastIndex) });
    }

    return result;
  }, [text]);

  // If it's a standard prompt, render as action chip
  if (promptMatch) {
    return <ActionChip match={promptMatch} compact={compact} />;
  }

  // If no file paths found, just render text normally
  if (parts.length === 1 && parts[0].type === "text") {
    return <span>{text}</span>;
  }

  return (
    <span className="inline">
      {parts.map((part, idx) =>
        part.type === "file" ? (
          <FileChip key={idx} path={part.content} compact={compact} />
        ) : (
          <span key={idx}>{part.content}</span>
        ),
      )}
    </span>
  );
});

UserTextContent.displayName = "UserTextContent";

// Cost indicator for assistant messages - shown to the left of the bubble with popover on hover
const CostIndicator = memo(
  ({ info, compact = false }: { info: AssistantMessage; compact?: boolean }) => {
    // Only show if there's a cost
    if (!info.cost || info.cost <= 0) return null;

    const metaFont = compact ? MSG_FONT.metaCompact : MSG_FONT.meta;
    const tokens = info.tokens;

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={cn(
              "text-muted-foreground/30 font-mono opacity-0 group-hover:opacity-100 transition-opacity cursor-default",
              metaFont,
            )}
          >
            ${info.cost.toFixed(4)}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          className={cn("font-mono bg-background/95 backdrop-blur-xl", MSG_FONT.code)}
        >
          <div className="space-y-1">
            <div className="flex justify-between gap-4">
              <span className="text-muted-foreground">Model</span>
              <span>{info.modelID}</span>
            </div>
            {tokens && (
              <>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Input</span>
                  <span>{formatTokens(tokens.input)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Output</span>
                  <span>{formatTokens(tokens.output)}</span>
                </div>
                {tokens.reasoning > 0 && (
                  <div className="flex justify-between gap-4">
                    <span className="text-purple-400">Reasoning</span>
                    <span className="text-purple-400">{formatTokens(tokens.reasoning)}</span>
                  </div>
                )}
                {tokens.cache.read > 0 && (
                  <div className="flex justify-between gap-4">
                    <span className="text-green-400">Cache</span>
                    <span className="text-green-400">{formatTokens(tokens.cache.read)}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    );
  },
);

CostIndicator.displayName = "CostIndicator";

// Loading skeleton
export const MessageSkeleton = memo(({ isAssistant = false }: { isAssistant?: boolean }) => (
  <div className={cn("py-3", isAssistant && "pl-1")}>
    <Skeleton className="h-4 w-3/4" />
    <Skeleton className="h-4 w-1/2 mt-1" />
  </div>
));

MessageSkeleton.displayName = "MessageSkeleton";

// Progress indicator
interface MessageProgressProps {
  tools: Array<{ name: string; status: "pending" | "running" | "completed" | "error" }>;
  currentStatus?: string;
  isThinking?: boolean;
}

export const MessageProgress = memo(
  ({
    tools,
    currentStatus,
    isThinking = false,
    compact = false,
  }: MessageProgressProps & { compact?: boolean }) => {
    const runningTool = tools.find((t) => t.status === "running" || t.status === "pending");
    const statusText =
      currentStatus ||
      (runningTool
        ? getToolConfig(runningTool.name).label
        : isThinking
          ? "Thinking..."
          : "Working...");
    const baseFont = compact ? MSG_FONT.baseCompact : MSG_FONT.base;

    return (
      <div className="py-3">
        <ShimmerText text={statusText} className={cn("font-medium", baseFont)} />
      </div>
    );
  },
);

MessageProgress.displayName = "MessageProgress";

// Main message component - iOS style bubbles
export const ChatMessage = memo(
  ({ message, isStreaming = false, compact = false, tailDown = false }: ChatMessageProps) => {
    const { info, parts = [] } = message;
    const isUser = info.role === "user";
    const isAssistant = info.role === "assistant";
    const assistantInfo = isAssistant ? (info as AssistantMessage) : null;

    const sortedParts = useMemo(
      () => [...(parts || [])].sort((a, b) => a.id.localeCompare(b.id)),
      [parts],
    );

    // Group consecutive tools together for collapsible threads
    const groupedContent = useMemo(() => {
      const groups: { type: "text" | "tools" | "reasoning" | "agent" | "other"; items: Part[] }[] =
        [];
      let currentTools: Part[] = [];

      const flushTools = () => {
        if (currentTools.length > 0) {
          groups.push({ type: "tools", items: currentTools });
          currentTools = [];
        }
      };

      for (const part of sortedParts) {
        if (part.type === "text") {
          flushTools();
          groups.push({ type: "text", items: [part] });
        } else if (part.type === "tool") {
          currentTools.push(part);
        } else if (part.type === "reasoning") {
          flushTools();
          groups.push({ type: "reasoning", items: [part] });
        } else if (part.type === "agent") {
          flushTools();
          groups.push({ type: "agent", items: [part] });
        } else if (part.type !== "step-start" && part.type !== "step-finish") {
          flushTools();
          groups.push({ type: "other", items: [part] });
        }
      }
      flushTools();
      return groups;
    }, [sortedParts]);

    const hasContent = sortedParts.some(
      (p) => p.type === "text" || p.type === "tool" || p.type === "reasoning",
    );

    // Don't render empty assistant messages
    if (isAssistant && !hasContent && !assistantInfo?.error) {
      return null;
    }

    // Skip animation for older messages (created more than 2s ago) to speed up initial render
    const isRecent = Date.now() - (info.time?.created || 0) < 2000;

    return (
      <motion.div
        initial={isRecent ? { opacity: 0, y: -10 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
      >
        {/* User message - on right, corner points toward newer messages */}
        {isUser && (
          <div
            className={cn(
              "max-w-[85%] rounded-2xl shadow-sm",
              tailDown ? "rounded-br-sm" : "rounded-tr-sm",
              "bg-primary text-primary-foreground",
              compact ? "px-2.5 py-1.5" : "px-3.5 py-2",
            )}
          >
            <div className={cn("leading-relaxed", compact ? MSG_FONT.baseCompact : MSG_FONT.base)}>
              {groupedContent.map((group, idx) => {
                if (group.type === "text") {
                  const textPart = group.items[0] as TextPart;
                  return <UserTextContent key={idx} text={textPart.text} compact={compact} />;
                }
                return null;
              })}
            </div>
          </div>
        )}

        {/* Hands/Assistant message - bubble styling when tailDown, otherwise plain text */}
        {isAssistant && (
          <div
            className={cn(
              "max-w-full",
              tailDown && "rounded-2xl rounded-bl-sm bg-zinc-800 shadow-sm",
              tailDown && (compact ? "px-2.5 py-1.5" : "px-3.5 py-2"),
            )}
          >
            <div className="space-y-0.5">
              {groupedContent.map((group, idx) => {
                if (group.type === "text") {
                  const textPart = group.items[0] as TextPart;
                  return (
                    <TextContent
                      key={idx}
                      text={textPart.text}
                      isStreaming={isStreaming && idx === groupedContent.length - 1}
                      compact={compact}
                    />
                  );
                }
                if (group.type === "tools") {
                  // Separate task tools from other tools
                  const taskTools = group.items.filter(
                    (p) => (p as ToolPart).tool.toLowerCase() === "task",
                  ) as ToolPart[];
                  const otherTools = group.items.filter(
                    (p) => (p as ToolPart).tool.toLowerCase() !== "task",
                  ) as ToolPart[];

                  return (
                    <div key={idx} className="space-y-0.5">
                      {/* Render task tools with TaskToolSummary */}
                      {taskTools.map((part) => (
                        <TaskToolSummary
                          key={part.id}
                          part={part}
                          sessionId={message.info.sessionID}
                          compact={compact}
                        />
                      ))}
                      {/* Show collapsible thread if 3+ other tools, otherwise show inline */}
                      {otherTools.length >= 3 ? (
                        <ToolThread tools={otherTools} compact={compact} />
                      ) : (
                        otherTools.map((part) => (
                          <ToolInvocation key={part.id} part={part} compact={compact} />
                        ))
                      )}
                    </div>
                  );
                }
                if (group.type === "reasoning") {
                  return (
                    <ReasoningContent
                      key={idx}
                      part={group.items[0] as ReasoningPart}
                      compact={compact}
                    />
                  );
                }
                if (group.type === "agent") {
                  const agentPart = group.items[0] as AgentPart;
                  return (
                    <SubagentSummary
                      key={idx}
                      agentName={agentPart.name}
                      sessionId={message.info.sessionID}
                      messageId={agentPart.messageID}
                      compact={compact}
                    />
                  );
                }
                return null;
              })}

              {/* Error display */}
              {assistantInfo?.error && (
                <div
                  className={cn(
                    "flex items-center gap-2 text-red-400 px-2 py-1 rounded-lg bg-red-500/10",
                    compact ? MSG_FONT.codeCompact : MSG_FONT.code,
                  )}
                >
                  <AlertCircle className="h-3 w-3" />
                  <span>
                    {(assistantInfo.error.data?.message as string) || assistantInfo.error.name}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </motion.div>
    );
  },
);

ChatMessage.displayName = "ChatMessage";
