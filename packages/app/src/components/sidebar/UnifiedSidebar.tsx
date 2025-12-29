/**
 * UnifiedSidebar - Workbook browser with search/prompt bar
 *
 * Features:
 * - Workbook dropdown header with traffic light offset
 * - Search/prompt input that filters NotebookSidebar content
 * - On submit, forwards prompt to FloatingChat to start new thread
 */

import { SaveStatusIndicator } from "@/components/SaveStatusIndicator";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { ATTACHMENT_TYPE, useChatState } from "@/hooks/useChatState";
import { resetSidebarState } from "./notebook/hooks/useSidebarState";
import { useNeedsTrafficLightOffset } from "@/hooks/useFullscreen";
import { useRuntimeProcess } from "@/hooks/useRuntimeState";
import {
  useCreateWorkbook,
  useOpenWorkbook,
  useUpdateWorkbook,
  useWorkbook,
  useWorkbooks,
} from "@/hooks/useWorkbook";
import type { Workbook } from "@/lib/workbook";
import { cn } from "@/lib/utils";
import { invoke } from "@tauri-apps/api/core";
import { useRouter } from "@tanstack/react-router";
import {
  ArrowUp,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  File,
  Folder,
  Loader2,
  Paperclip,
  Plus,
  Search,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { NotebookSidebar } from "./NotebookSidebar";
import { useOptionKeyRecording } from "@/hooks/useStt";
import { Mic } from "lucide-react";

interface UnifiedSidebarProps {
  compact?: boolean;
  onSelectItem?: (
    type: "page" | "source" | "table" | "action",
    id: string
  ) => void;
}

export function UnifiedSidebar({
  compact = false,
  onSelectItem,
}: UnifiedSidebarProps) {
  const router = useRouter();
  const chatState = useChatState();
  const { workbookId: activeWorkbookId } = useRuntimeProcess();

  // Workbook management
  const { data: workbooks } = useWorkbooks();
  const createWorkbook = useCreateWorkbook();
  const openWorkbook = useOpenWorkbook();
  const updateWorkbook = useUpdateWorkbook();
  const needsTrafficLightOffset = useNeedsTrafficLightOffset();

  // Current workbook
  const currentWorkbook = workbooks?.find((w) => w.id === activeWorkbookId);
  const { data: activeWorkbook } = useWorkbook(activeWorkbookId);
  const titleInputRef = useRef<HTMLSpanElement>(null);

  const [input, setInput] = useState("");
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const expandedInputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Speech-to-text: hold Option key to record
  const stt = useOptionKeyRecording({
    onTranscription: (text) => {
      setInput((prev) => prev + (prev ? " " : "") + text);
      inputRef.current?.focus();
    },
    onError: (err) => {
      console.error("[stt] Error:", err);
    },
  });

  // Track container width for responsive layout
  const POPOVER_WIDTH = 400;
  const needsPopover = containerWidth < POPOVER_WIDTH;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Filter query for NotebookSidebar
  const filterQuery = input.trim();

  // Submit handler - forwards to FloatingChat
  const handleSubmit = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || !activeWorkbook?.directory) return;

    setIsSubmitting(true);
    setInput("");
    setIsInputExpanded(false);

    try {
      // Open floating chat with the prompt
      await invoke("open_floating_chat_with_prompt", {
        workbookDir: activeWorkbook.directory,
        prompt,
      });
    } catch (err) {
      console.error("[UnifiedSidebar] Failed to forward to floating chat:", err);
      // Fallback: just open floating chat without prompt
      try {
        await invoke("open_floating_chat", {
          workbookDir: activeWorkbook.directory,
        });
      } catch (e) {
        console.error("[UnifiedSidebar] Failed to open floating chat:", e);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [input, activeWorkbook?.directory]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape" && input) {
      e.preventDefault();
      setInput("");
    }
  };

  const handlePickFile = useCallback(async () => {
    try {
      const filePath = await invoke<string | null>("pick_file");
      if (filePath) {
        const fileName = filePath.split("/").pop() || filePath;
        chatState.setPendingAttachment({
          type: ATTACHMENT_TYPE.FILEPATH,
          filePath,
          name: fileName,
        });
      }
    } catch (err) {
      console.error("[UnifiedSidebar] Failed to pick file:", err);
    }
  }, [chatState]);

  const handlePickFolder = useCallback(async () => {
    try {
      const folderPath = await invoke<string | null>("pick_folder");
      if (folderPath) {
        const folderName = folderPath.split("/").pop() || folderPath;
        chatState.setPendingAttachment({
          type: ATTACHMENT_TYPE.FILEPATH,
          filePath: folderPath,
          name: folderName,
        });
      }
    } catch (err) {
      console.error("[UnifiedSidebar] Failed to pick folder:", err);
    }
  }, [chatState]);

  const handleSnapshot = useCallback(async () => {
    try {
      await invoke("start_capture_command");
    } catch (err) {
      console.error("[UnifiedSidebar] Failed to start capture:", err);
    }
  }, []);

  // Workbook handlers
  const handleSwitchWorkbook = useCallback(
    (workbook: Workbook) => {
      resetSidebarState();
      openWorkbook.mutate(workbook);
    },
    [openWorkbook]
  );

  const handleCreateWorkbook = useCallback(() => {
    createWorkbook.mutate(
      { name: "Untitled Workbook" },
      {
        onSuccess: (newWorkbook) => {
          resetSidebarState();
          openWorkbook.mutate(newWorkbook, {
            onSuccess: () => {
              router.navigate({
                to: "/pages/$pageId",
                params: { pageId: "welcome" },
              });
            },
          });
        },
      }
    );
  }, [createWorkbook, openWorkbook, router]);

  // UI state
  const pendingAttachment = chatState.pendingAttachment;
  const hasContent = input.trim() || pendingAttachment;

  // Placeholder text
  const placeholder = stt.isRecording
    ? "Listening... (release Option to finish)"
    : "Search or ask anything...";

  // ============================================================================
  // Render Helpers
  // ============================================================================

  // Workbook header with traffic light offset
  const workbookHeader = (
    <div
      data-tauri-drag-region
      className={cn(
        "shrink-0 flex items-center gap-1 h-10",
        needsTrafficLightOffset ? "pl-[80px] pr-3" : "px-3"
      )}
    >
      {/* Editable workbook title */}
      <span
        ref={titleInputRef}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => {
          const newName = e.currentTarget.textContent?.trim() || "";
          if (currentWorkbook && newName && newName !== currentWorkbook.name) {
            updateWorkbook.mutate({
              ...currentWorkbook,
              name: newName,
              updated_at: Date.now(),
            });
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            e.currentTarget.textContent = currentWorkbook?.name ?? "Untitled";
            e.currentTarget.blur();
          }
        }}
        className={cn(
          "px-1 py-0.5 text-sm font-medium bg-transparent rounded-sm cursor-text",
          "outline-none truncate max-w-[140px]",
          "hover:bg-accent/50",
          "focus:bg-background focus:ring-1 focus:ring-ring/20"
        )}
        spellCheck={false}
      >
        {currentWorkbook?.name ?? "Untitled"}
      </span>

      {/* Workbook switcher dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center justify-center w-5 h-5 rounded-sm text-muted-foreground/70 hover:text-muted-foreground hover:bg-accent/50">
          <ChevronDown className="h-3 w-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[200px]">
          {workbooks?.map((wb) => (
            <DropdownMenuItem
              key={wb.id}
              onClick={() => handleSwitchWorkbook(wb)}
              className="flex items-center justify-between"
            >
              <span className="truncate text-[13px]">{wb.name}</span>
              {wb.id === activeWorkbookId && (
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleCreateWorkbook}>
            <Plus className="h-3.5 w-3.5 mr-2" />
            <span className="text-[13px]">New Notebook</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Right side: save status + navigation */}
      <div className="ml-auto flex items-center gap-1">
        <SaveStatusIndicator />
        <button
          onClick={() => router.history.back()}
          className="p-1 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          title="Go back"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => router.history.forward()}
          className="p-1 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          title="Go forward"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  // Attachment preview
  const attachmentPreview = pendingAttachment && (
    <div className="flex items-center gap-1 mb-2">
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent/50 text-xs">
        <Paperclip className="h-3 w-3 text-muted-foreground" />
        <span className="max-w-[150px] truncate">{pendingAttachment.name}</span>
        <button
          onClick={() => chatState.setPendingAttachment(null)}
          className="p-0.5 rounded hover:bg-accent"
        >
          <span className="h-3 w-3 text-muted-foreground">×</span>
        </button>
      </div>
    </div>
  );

  // Input bar - inline when wide enough, popover when narrow
  const inputElement = needsPopover ? (
    <Popover open={isInputExpanded} onOpenChange={setIsInputExpanded}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            "flex items-center gap-1.5 bg-background rounded-xl px-2 py-1.5 border cursor-text transition-all hover:border-border/60 hover:shadow-sm",
            stt.isRecording
              ? "border-red-500/50 bg-red-500/5"
              : "border-border/40"
          )}
          onClick={() => setIsInputExpanded(true)}
        >
          {/* Recording indicator */}
          {stt.isRecording && (
            <div className="flex items-center gap-1 text-red-500 animate-pulse">
              <Mic className="h-4 w-4" />
            </div>
          )}

          <Search className="h-4 w-4 text-muted-foreground/50 shrink-0" />

          <div
            className={cn(
              "flex-1 min-w-0 py-0.5 text-sm overflow-hidden text-ellipsis whitespace-nowrap",
              input ? "text-foreground" : "text-muted-foreground/50"
            )}
          >
            {input || placeholder}
          </div>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="p-1 shrink-0 text-muted-foreground/50 hover:text-muted-foreground"
                onClick={(e) => e.stopPropagation()}
                title="Attach file or folder"
              >
                <Paperclip className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[140px]">
              <DropdownMenuItem onClick={handleSnapshot}>
                <Camera className="h-3.5 w-3.5 mr-2" />
                <span className="text-[13px]">Snapshot</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePickFile}>
                <File className="h-3.5 w-3.5 mr-2" />
                <span className="text-[13px]">File</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handlePickFolder}>
                <Folder className="h-3.5 w-3.5 mr-2" />
                <span className="text-[13px]">Folder</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {hasContent && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={isSubmitting}
              onClick={(e) => {
                e.stopPropagation();
                handleSubmit();
              }}
            >
              {isSubmitting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ArrowUp className="h-3 w-3" />
              )}
            </Button>
          )}
        </div>
      </PopoverAnchor>

      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={-42}
        className="w-[400px] p-0 border-border bg-background rounded-xl shadow-lg"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          expandedInputRef.current?.focus();
        }}
      >
        <div className="flex items-start gap-1.5 px-2 py-1.5">
          <Search className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-1.5" />

          <textarea
            ref={expandedInputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // Auto-resize
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setIsInputExpanded(false);
              } else if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
            placeholder={placeholder}
            rows={1}
            className="flex-1 min-w-0 bg-transparent text-sm placeholder:text-muted-foreground/50 focus:outline-none resize-none py-1"
          />

          {hasContent && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={isSubmitting}
              onClick={() => handleSubmit()}
            >
              {isSubmitting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <ArrowUp className="h-3 w-3" />
              )}
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  ) : (
    /* Wide mode - inline input, no popover */
    <div
      className={cn(
        "flex items-center gap-1.5 bg-background rounded-xl px-2 py-1.5 border",
        stt.isRecording ? "border-red-500/50 bg-red-500/5" : "border-border/40"
      )}
    >
      {/* Recording indicator */}
      {stt.isRecording && (
        <div className="flex items-center gap-1 text-red-500 animate-pulse">
          <Mic className="h-4 w-4" />
        </div>
      )}

      <Search className="h-4 w-4 text-muted-foreground/50 shrink-0" />

      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="flex-1 min-w-0 bg-transparent text-sm placeholder:text-muted-foreground/50 focus:outline-none"
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="p-1 shrink-0 text-muted-foreground/50 hover:text-muted-foreground"
            title="Attach file or folder"
          >
            <Paperclip className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[140px]">
          <DropdownMenuItem onClick={handleSnapshot}>
            <Camera className="h-3.5 w-3.5 mr-2" />
            <span className="text-[13px]">Snapshot</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handlePickFile}>
            <File className="h-3.5 w-3.5 mr-2" />
            <span className="text-[13px]">File</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handlePickFolder}>
            <Folder className="h-3.5 w-3.5 mr-2" />
            <span className="text-[13px]">Folder</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {hasContent && (
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
          disabled={isSubmitting}
          onClick={handleSubmit}
        >
          {isSubmitting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <ArrowUp className="h-3 w-3" />
          )}
        </Button>
      )}
    </div>
  );

  // Browse content (NotebookSidebar)
  const browseContent = (
    <div className={cn(compact ? "p-2" : "p-3")}>
      <NotebookSidebar filterQuery={filterQuery} onSelectItem={onSelectItem} />
    </div>
  );

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div ref={containerRef} className="flex flex-col h-full w-full">
      {/* Workbook header with traffic light offset */}
      {workbookHeader}

      {/* Input bar */}
      <div className={cn("shrink-0 py-2", compact ? "px-2" : "px-3")}>
        {attachmentPreview}
        {inputElement}
      </div>

      {/* Content: Browse */}
      <div className="flex-1 overflow-y-auto">{browseContent}</div>
    </div>
  );
}
