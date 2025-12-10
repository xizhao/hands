import { memo, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type {
  MessageWithParts,
  Part,
  ToolPart,
  TextPart,
  ReasoningPart,
  AssistantMessage,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Loader2,
  Terminal,
  FileCode,
  Search,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  Copy,
  Check,
  Database,
  Globe,
  Brain,
  Coins,
  GitBranch,
  Zap,
  List,
  PenLine,
  ListTodo,
  Glasses,
  File,
  Circle,
  CheckCircle2,
  Key,
  Navigation,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton, ShimmerText } from "@/components/ui/thinking-indicator";
import { SecretsForm, parseSecretsOutput } from "@/components/SecretsForm";
import { NavigateCard, parseNavigateOutput } from "@/components/NavigateCard";

interface ChatMessageProps {
  message: MessageWithParts;
  isStreaming?: boolean;
  compact?: boolean;
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
    getSubtitle: (input) => input.filePath ? getFilename(String(input.filePath)) : "",
  },
  glob: {
    icon: Search,
    label: "Search",
    getSubtitle: (input) => input.pattern ? String(input.pattern) : "",
  },
  grep: {
    icon: Search,
    label: "Search",
    getSubtitle: (input) => input.pattern ? String(input.pattern) : "",
  },
  list: {
    icon: List,
    label: "List",
    getSubtitle: (input) => input.path ? String(input.path) : "",
  },
  bash: {
    icon: Terminal,
    label: "Terminal",
    getSubtitle: (input) => input.command ? String(input.command).slice(0, 40) : "",
  },
  edit: {
    icon: PenLine,
    label: "Edit",
    getSubtitle: (input) => input.file_path ? getFilename(String(input.file_path)) : "",
  },
  write: {
    icon: FileCode,
    label: "Write",
    getSubtitle: (input) => input.file_path ? getFilename(String(input.file_path)) : "",
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
    getSubtitle: (input) => input.query ? String(input.query).slice(0, 30) : "",
  },
  task: {
    icon: GitBranch,
    label: "Task",
    getSubtitle: (input) => input.description ? String(input.description).slice(0, 30) : "",
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
    getSubtitle: (input) => input.query ? String(input.query).slice(0, 40) : "",
  },
  schemaread: {
    icon: Database,
    label: "Schema",
    getSubtitle: (input) => input.table ? String(input.table) : "all tables",
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

  const handleCopy = async () => {
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
  const sepIndex = lines.findIndex(line => /^-+(\+-+)+$/.test(line.replace(/\s/g, '')));
  if (sepIndex < 1) return null;

  // Parse headers from line before separator
  const headerLine = lines[sepIndex - 1];
  const headers = headerLine.split("|").map(h => h.trim()).filter(Boolean);
  if (headers.length === 0) return null;

  // Parse data rows (after separator, before row count)
  const rows: string[][] = [];
  for (let i = sepIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    // Stop at row count line
    if (line.match(/^\s*\(\d+ rows?\)\s*$/)) break;
    if (!line.includes("|")) continue;

    const cells = line.split("|").map(c => c.trim());
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
const QueryResult = memo(({ output, query: _query }: { output: string; query?: string }) => {
  const [expanded, setExpanded] = useState(false);
  const parsed = useMemo(() => parsePsqlOutput(output), [output]);

  // If not a table result, show as plain text
  if (!parsed || parsed.rows.length === 0) {
    return (
      <div className="text-[11px] text-muted-foreground/70 font-mono">
        {output.slice(0, 200)}{output.length > 200 && "..."}
      </div>
    );
  }

  const previewRows = parsed.rows.slice(0, 3);
  const hasMore = parsed.rows.length > 3;

  return (
    <div className="mt-1">
      {/* Compact preview table */}
      <div className="rounded-md overflow-hidden border border-border/30 bg-black/20">
        <table className="w-full text-[10px] font-mono">
          <thead>
            <tr className="bg-black/30">
              {parsed.headers.map((h, i) => (
                <th key={i} className="px-2 py-1 text-left text-muted-foreground/60 font-medium truncate max-w-[120px]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(expanded ? parsed.rows : previewRows).map((row, i) => (
              <tr key={i} className="border-t border-border/20 hover:bg-white/5">
                {row.map((cell, j) => (
                  <td key={j} className="px-2 py-1 text-muted-foreground/80 truncate max-w-[120px]" title={cell}>
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
        <span className="text-[9px] text-muted-foreground/40">
          {parsed.rowCount} row{parsed.rowCount !== 1 && "s"}
        </span>
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[9px] text-blue-400/70 hover:text-blue-400 flex items-center gap-0.5"
          >
            {expanded ? (
              <>Show less <ChevronDown className="h-2.5 w-2.5" /></>
            ) : (
              <>Show all {parsed.rowCount} <ChevronRight className="h-2.5 w-2.5" /></>
            )}
          </button>
        )}
      </div>
    </div>
  );
});

QueryResult.displayName = "QueryResult";

// Todo item interface
interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
}

// TodoResult component - compact renderer for todowrite tool
const TodoResult = memo(({ input }: { input: { todos?: TodoItem[] } }) => {
  const [expanded, setExpanded] = useState(false);
  const todos = input?.todos || [];

  // If no todos, show "Plan completed"
  if (todos.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-green-400/70">
        <CheckCircle2 className="h-3 w-3" />
        <span>Plan completed</span>
      </div>
    );
  }

  const completedCount = todos.filter(t => t.status === "completed").length;
  const inProgressCount = todos.filter(t => t.status === "in_progress").length;
  const pendingCount = todos.filter(t => t.status === "pending").length;

  // All completed
  if (completedCount === todos.length) {
    return (
      <div className="flex items-center gap-1.5 text-[11px] text-green-400/70">
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
        className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 hover:text-muted-foreground"
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
                    "flex items-start gap-1.5 text-[11px]",
                    todo.status === "completed" && "text-muted-foreground/40",
                    todo.status === "in_progress" && "text-blue-400"
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
                    {todo.status === "in_progress" && todo.activeForm ? todo.activeForm : todo.content}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

TodoResult.displayName = "TodoResult";

// Collapsible tool thread
const ToolThread = memo(({ tools }: { tools: ToolPart[] }) => {
  const [expanded, setExpanded] = useState(false);

  const runningCount = tools.filter(t => t.state.status === "running" || t.state.status === "pending").length;
  const completedCount = tools.filter(t => t.state.status === "completed").length;
  const errorCount = tools.filter(t => t.state.status === "error").length;

  const isRunning = runningCount > 0;
  const summary = isRunning
    ? `${runningCount} running...`
    : `${completedCount} completed${errorCount > 0 ? `, ${errorCount} failed` : ""}`;

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg transition-colors",
          "text-muted-foreground/60 hover:text-muted-foreground hover:bg-white/5"
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
                <ToolInvocation key={tool.id} part={tool} />
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
const ToolInvocation = memo(({ part }: { part: ToolPart }) => {
  const [expanded, setExpanded] = useState(false);
  const { state, tool: toolName } = part;
  const config = getToolConfig(toolName);
  const Icon = config.icon;

  const isRunning = state.status === "running" || state.status === "pending";
  const isError = state.status === "error";

  // Check if this is the todowrite tool
  const isTodoTool = toolName.toLowerCase() === "todowrite";

  // Check if this is a SQL tool with table output
  // Tool name could be "psql", "psqlTool", or prefixed like "hands_psql", "psql_psqlTool"
  const isPsqlTool = toolName.toLowerCase().endsWith("psql") ||
    toolName.toLowerCase().endsWith("psqltool");
  const hasTableResult = isPsqlTool &&
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

  const hasDetails = Boolean(state.input || (state.status === "completed" && state.output) || isError);

  // For todowrite, use custom compact renderer
  if (isTodoTool && state.input) {
    return <TodoResult input={state.input as { todos?: TodoItem[] }} />;
  }

  // For psql with table results, always show the result inline
  if (hasTableResult) {
    return (
      <div className="py-1">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 mb-1">
          <Database className="h-2.5 w-2.5 text-blue-400" />
          <span className="font-mono text-[10px] text-muted-foreground/50 truncate max-w-[250px]">
            {(state.input as Record<string, unknown>)?.query as string}
          </span>
        </div>
        <QueryResult
          output={state.output!}
          query={(state.input as Record<string, unknown>)?.query as string}
        />
      </div>
    );
  }

  // Check if this is the secrets tool with a form request
  const isSecretsTool = toolName.toLowerCase().includes("secrets");
  const secretsRequest = isSecretsTool &&
    state.status === "completed" &&
    state.output ? parseSecretsOutput(state.output) : null;

  // For secrets with form request, show the form
  if (secretsRequest) {
    return (
      <div className="py-1">
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 mb-1">
          <Key className="h-2.5 w-2.5 text-blue-400" />
          <span>Secrets</span>
        </div>
        <SecretsForm output={secretsRequest} />
      </div>
    );
  }

  // Check if this is the navigate tool with a navigation request
  const isNavigateTool = toolName.toLowerCase().includes("navigate");
  const navigateRequest = isNavigateTool &&
    state.status === "completed" &&
    state.output ? parseNavigateOutput(state.output) : null;

  // For navigate with valid output, show the navigation card
  if (navigateRequest) {
    return (
      <div className="py-1">
        <NavigateCard output={navigateRequest} />
      </div>
    );
  }

  return (
    <div className="py-0.5">
      <button
        className={cn(
          "flex items-center gap-1.5 text-[11px] text-muted-foreground/60",
          hasDetails && "cursor-pointer hover:text-muted-foreground"
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
          <span className="text-muted-foreground/40 font-mono text-[10px] truncate max-w-[150px]">
            {subtitle}
          </span>
        )}
        {hasDetails && (
          expanded ? <ChevronDown className="h-2.5 w-2.5" /> : <ChevronRight className="h-2.5 w-2.5" />
        )}
      </button>

      <AnimatePresence>
        {expanded && hasDetails && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="ml-4 mt-1 p-2 rounded-lg bg-black/20 text-[10px] font-mono space-y-1.5">
              {state.input && (
                <div>
                  <span className="text-muted-foreground/40 uppercase text-[9px]">input: </span>
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
                  <span className="text-muted-foreground/40 uppercase text-[9px]">output: </span>
                  <span className="text-muted-foreground/70 break-all">
                    {state.output.slice(0, 300)}{state.output.length > 300 && "..."}
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

// Text content with markdown
const TextContent = memo(({ text, isStreaming = false, darkText = false, compact = false }: { text: string; isStreaming?: boolean; darkText?: boolean; compact?: boolean }) => (
  <div className={cn(
    "prose max-w-none prose-p:my-0.5 prose-pre:my-1 prose-p:leading-relaxed",
    compact ? "prose-xs text-xs" : "prose-sm text-sm",
    darkText ? "prose-neutral" : "dark:prose-invert"
  )}>
    <ReactMarkdown
      components={{
        code({ className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || "");
          const inline = !match;

          if (inline) {
            return (
              <code className="bg-black/20 px-1 py-0.5 rounded text-[12px] font-mono" {...props}>
                {children}
              </code>
            );
          }

          return (
            <div className="relative group rounded-lg overflow-hidden my-2">
              <div className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1">
                <span className="text-[9px] text-muted-foreground/40 font-mono uppercase">{match[1]}</span>
                <CopyButton text={String(children)} />
              </div>
              <SyntaxHighlighter
                style={oneDark}
                language={match[1]}
                PreTag="div"
                customStyle={{
                  margin: 0,
                  borderRadius: "0.5rem",
                  fontSize: "11px",
                  padding: "0.75rem",
                  background: "rgba(0,0,0,0.3)",
                }}
              >
                {String(children).replace(/\n$/, "")}
              </SyntaxHighlighter>
            </div>
          );
        },
      }}
    >
      {text}
    </ReactMarkdown>
    {isStreaming && (
      <motion.span
        className="inline-block w-0.5 h-4 bg-primary ml-0.5 align-middle"
        animate={{ opacity: [1, 0] }}
        transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse" }}
      />
    )}
  </div>
));

TextContent.displayName = "TextContent";

// Collapsible reasoning section
const ReasoningContent = memo(({ part }: { part: ReasoningPart }) => {
  const [expanded, setExpanded] = useState(false);

  // Don't render if no text
  if (!part.text || part.text.trim().length === 0) {
    return null;
  }

  const preview = part.text.slice(0, 50).replace(/\n/g, " ");

  return (
    <div className="my-1">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-lg transition-colors",
          "text-purple-400/70 hover:text-purple-400 hover:bg-purple-500/10"
        )}
      >
        <Brain className="h-3 w-3" />
        <span className="italic">
          {expanded ? "Reasoning" : preview + (part.text.length > 50 ? "..." : "")}
        </span>
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
            <pre className="mt-1 ml-2 p-2 rounded-lg bg-purple-500/10 text-[11px] font-mono text-purple-300/70 whitespace-pre-wrap max-h-48 overflow-auto">
              {part.text}
            </pre>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

ReasoningContent.displayName = "ReasoningContent";

// File chip for displaying file paths in user messages
const FileChip = memo(({ path }: { path: string }) => {
  const filename = getFilename(path);

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-200 text-zinc-700 text-xs font-mono">
      <File className="h-3 w-3 shrink-0" />
      <span className="truncate max-w-[200px]" title={path}>{filename}</span>
    </span>
  );
});

FileChip.displayName = "FileChip";

// Parse text and render file paths as chips
// Matches absolute paths like /Users/foo/bar.txt or relative paths starting with ./
const FILE_PATH_REGEX = /((?:\/[\w.-]+)+(?:\.\w+)?|\.\/[\w./-]+)/g;

const UserTextContent = memo(({ text }: { text: string }) => {
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

  // If no file paths found, just render text normally
  if (parts.length === 1 && parts[0].type === "text") {
    return <span>{text}</span>;
  }

  return (
    <span className="inline">
      {parts.map((part, idx) =>
        part.type === "file" ? (
          <FileChip key={idx} path={part.content} />
        ) : (
          <span key={idx}>{part.content}</span>
        )
      )}
    </span>
  );
});

UserTextContent.displayName = "UserTextContent";

// Metadata tooltip for assistant messages
const MetadataTooltip = memo(({ info }: { info: AssistantMessage }) => {
  const tokens = info.tokens;
  const total = tokens ? tokens.input + tokens.output + tokens.reasoning + tokens.cache.read : 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button className="text-[10px] text-muted-foreground/30 hover:text-muted-foreground/50 font-mono flex items-center gap-1 px-2 py-0.5 rounded hover:bg-white/5">
          <Zap className="h-2.5 w-2.5" />
          {formatTokens(total)}
          {info.cost > 0 && <span>· ${info.cost.toFixed(4)}</span>}
        </button>
      </TooltipTrigger>
      <TooltipContent side="left" className="text-xs font-mono bg-background/95 backdrop-blur-xl">
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
          {info.cost > 0 && (
            <div className="flex justify-between gap-4 pt-1 border-t border-border/50">
              <span className="text-muted-foreground flex items-center gap-1">
                <Coins className="h-2.5 w-2.5" /> Cost
              </span>
              <span>${info.cost.toFixed(4)}</span>
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
});

MetadataTooltip.displayName = "MetadataTooltip";

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

export const MessageProgress = memo(({ tools, currentStatus, isThinking = false }: MessageProgressProps) => {
  const runningTool = tools.find(t => t.status === "running" || t.status === "pending");
  const statusText = currentStatus || (runningTool ? getToolConfig(runningTool.name).label : isThinking ? "Thinking..." : "Working...");

  return (
    <div className="py-3">
      <ShimmerText text={statusText} className="text-sm font-medium" />
    </div>
  );
});

MessageProgress.displayName = "MessageProgress";

// Main message component - iOS style bubbles
export const ChatMessage = memo(({ message, isStreaming = false, compact = false }: ChatMessageProps) => {
  const { info, parts = [] } = message;
  const isUser = info.role === "user";
  const isAssistant = info.role === "assistant";
  const assistantInfo = isAssistant ? (info as AssistantMessage) : null;

  const sortedParts = useMemo(
    () => [...(parts || [])].sort((a, b) => a.id.localeCompare(b.id)),
    [parts]
  );

  // Group consecutive tools together for collapsible threads
  const groupedContent = useMemo(() => {
    const groups: { type: "text" | "tools" | "reasoning" | "other"; items: Part[] }[] = [];
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
      } else if (part.type !== "step-start" && part.type !== "step-finish") {
        flushTools();
        groups.push({ type: "other", items: [part] });
      }
    }
    flushTools();
    return groups;
  }, [sortedParts]);

  const hasContent = sortedParts.some(p => p.type === "text" || p.type === "tool" || p.type === "reasoning");

  // Don't render empty assistant messages
  if (isAssistant && !hasContent && !assistantInfo?.error) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {/* User message - on right, corner angled down toward input, white with zinc text */}
      {isUser && (
        <div className={cn(
          "max-w-[85%] rounded-2xl rounded-br-sm bg-white text-zinc-800 shadow-lg",
          compact ? "px-2.5 py-1.5" : "px-3.5 py-2"
        )}>
          <div className={cn(
            "leading-relaxed",
            compact ? "text-xs" : "text-sm"
          )}>
            {groupedContent.map((group, idx) => {
              if (group.type === "text") {
                const textPart = group.items[0] as TextPart;
                return <UserTextContent key={idx} text={textPart.text} />;
              }
              return null;
            })}
          </div>
        </div>
      )}

      {/* Hands/Assistant message - on left, corner angled down toward input, dark zinc */}
      {isAssistant && (
        <div className="group max-w-[90%] flex flex-col">
          <div className={cn(
            "rounded-2xl rounded-bl-sm bg-zinc-800 text-zinc-100 shadow-lg",
            compact ? "px-2.5 py-1.5" : "px-3.5 py-2"
          )}>
            <div className={cn("space-y-1", compact && "text-xs")}>
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
                  // Show collapsible thread if 3+ tools, otherwise show inline
                  if (group.items.length >= 3) {
                    return <ToolThread key={idx} tools={group.items as ToolPart[]} />;
                  }
                  return (
                    <div key={idx} className="space-y-0.5">
                      {group.items.map((part) => (
                        <ToolInvocation key={part.id} part={part as ToolPart} />
                      ))}
                    </div>
                  );
                }
                if (group.type === "reasoning") {
                  return <ReasoningContent key={idx} part={group.items[0] as ReasoningPart} />;
                }
                return null;
              })}

              {/* Error display */}
              {assistantInfo?.error && (
                <div className="flex items-center gap-2 text-xs text-red-400 px-2 py-1 rounded-lg bg-red-500/10">
                  <AlertCircle className="h-3 w-3" />
                  <span>{assistantInfo.error.data?.message as string || assistantInfo.error.name}</span>
                </div>
              )}
            </div>
          </div>

          {/* Metadata - shown on hover, below the bubble */}
          {assistantInfo?.tokens && !isStreaming && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 ml-1">
              <MetadataTooltip info={assistantInfo} />
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
});

ChatMessage.displayName = "ChatMessage";
