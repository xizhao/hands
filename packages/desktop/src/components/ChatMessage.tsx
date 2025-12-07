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
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/thinking-indicator";

interface ChatMessageProps {
  message: MessageWithParts;
  isStreaming?: boolean;
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

  const subtitle = useMemo(() => {
    if (state.status === "completed" && state.title) return state.title;
    if (state.status === "running" && state.title) return state.title;
    if (config.getSubtitle && state.input) {
      return config.getSubtitle(state.input as Record<string, unknown>);
    }
    return null;
  }, [state, config]);

  const hasDetails = Boolean(state.input || (state.status === "completed" && state.output) || isError);

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
const TextContent = memo(({ text, isStreaming = false, darkText = false }: { text: string; isStreaming?: boolean; darkText?: boolean }) => (
  <div className={cn(
    "prose prose-sm max-w-none prose-p:my-1 prose-pre:my-2 prose-p:leading-relaxed text-sm",
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
    <div className="py-3 flex items-center gap-2">
      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
      <span className="text-xs text-muted-foreground">{statusText}</span>
    </div>
  );
});

MessageProgress.displayName = "MessageProgress";

// Main message component - iOS style bubbles
export const ChatMessage = memo(({ message, isStreaming = false }: ChatMessageProps) => {
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
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: "easeOut" }}
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start"
      )}
    >
      {/* User message - on right, corner angled up, white with zinc text */}
      {isUser && (
        <div className="max-w-[85%] px-3.5 py-2 rounded-2xl rounded-tr-md bg-white text-zinc-800 shadow-lg">
          <div className="text-sm">
            {groupedContent.map((group, idx) => {
              if (group.type === "text") {
                const textPart = group.items[0] as TextPart;
                return <TextContent key={idx} text={textPart.text} darkText />;
              }
              return null;
            })}
          </div>
        </div>
      )}

      {/* Hands/Assistant message - on left, corner angled up, dark zinc */}
      {isAssistant && (
        <div className="group max-w-[90%] px-3.5 py-2 rounded-2xl rounded-tl-md bg-zinc-800 text-zinc-100 shadow-lg">
          <div className="space-y-1">
            {groupedContent.map((group, idx) => {
              if (group.type === "text") {
                const textPart = group.items[0] as TextPart;
                return (
                  <TextContent
                    key={idx}
                    text={textPart.text}
                    isStreaming={isStreaming && idx === groupedContent.length - 1}
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

            {/* Metadata - shown on hover */}
            {assistantInfo?.tokens && !isStreaming && (
              <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                <MetadataTooltip info={assistantInfo} />
              </div>
            )}
          </div>
        </div>
      )}
    </motion.div>
  );
});

ChatMessage.displayName = "ChatMessage";
