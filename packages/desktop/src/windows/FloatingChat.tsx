/**
 * FloatingChat - Right-edge anchored chat drawer
 *
 * The drawer lives on the right edge of the screen.
 * - Starts expanded showing the full chat interface
 * - Can collapse to just show the Hands icon strip
 * - Expands on hover, click, or Option key press
 */

import {
  AttachmentMenu,
  LinkClickHandler,
  LinkNavigationProvider,
  TRPCProvider,
  useActiveRuntime,
  useActiveSession,
  useCreateWorkbook,
  useFilePicker,
  useOpenWorkbook,
  useWorkbooks,
  type Workbook,
  WorkbookDropdown,
} from "@hands/app";
import { useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  Book,
  ChevronDown,
  ChevronLeft,
  FileUp,
  Hand,
  Layers,
  Loader2,
  Mic,
  Plus,
  Square,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatSettings } from "@/components/ChatSettings";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import {
  useAbortSession,
  useCreateSession,
  useDeleteSession,
  useMessages,
  useSendMessage,
  useSessionStatuses,
  useSessions,
} from "@/hooks/useSession";
// Use shared api and hooks - same as workbook editor
import type { Session } from "@/lib/api";
import { startSSESync } from "@/lib/sse";

// ============================================================================
// Status Dot Component
// ============================================================================

function StatusDot({ status }: { status: "busy" | "error" | null }) {
  if (!status) return null;
  if (status === "busy") {
    return (
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-75" />
        <span className="relative rounded-full h-2 w-2 bg-emerald-500" />
      </span>
    );
  }
  return <span className="h-2 w-2 rounded-full bg-red-500" />;
}

// ============================================================================
// Main Component
// ============================================================================

export function FloatingChat() {
  const [inputValue, setInputValue] = useState("");
  const [activeSessionId, setActiveSessionIdLocal] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false); // Start collapsed
  const [isDragging, setIsDragging] = useState(false);
  const [showThreadsDropdown, setShowThreadsDropdown] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<string[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [sttPreview, setSttPreview] = useState(""); // Real-time STT preview
  const [sttDownloading, setSttDownloading] = useState(false);
  const [sttDownloadProgress, setSttDownloadProgress] = useState(0); // 0-1
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const hasHandledDrop = useRef(false);
  const queryClient = useQueryClient();
  const lastIgnoreState = useRef<boolean | null>(null);

  // Track if workbook is open - when true, FloatingChat is disabled
  const isWorkbookOpenRef = useRef(false);

  // Sync with global session state (for TaskToolSummary "open in thread" links)
  const { sessionId: globalSessionId, setSession: setGlobalSession } = useActiveSession();

  // When global session changes (e.g., from TaskToolSummary), update local state
  // Don't auto-expand - user can hover to expand if they want to see the session
  useEffect(() => {
    if (globalSessionId && globalSessionId !== activeSessionId) {
      setActiveSessionIdLocal(globalSessionId);
    }
  }, [globalSessionId, activeSessionId]);

  // Wrapper to update both local and global state
  const setActiveSessionId = useCallback(
    (sessionId: string | null) => {
      setActiveSessionIdLocal(sessionId);
      setGlobalSession(sessionId);
    },
    [setGlobalSession],
  );

  // Expand/collapse handlers - call Rust backend to resize window
  const handleExpand = useCallback(async () => {
    if (isExpanded) return;
    try {
      await invoke("expand_floating_chat");
      setIsExpanded(true);
    } catch (err) {
      console.error("[FloatingChat] Failed to expand:", err);
    }
  }, [isExpanded]);

  // Collapse: animate content out first, then resize window after animation completes
  const handleCollapse = useCallback(async () => {
    if (!isExpanded) return;
    // First trigger content animation out
    setIsExpanded(false);
    // Wait for animation to complete (matches duration-200)
    await new Promise((resolve) => setTimeout(resolve, 250));
    // Then resize window
    try {
      await invoke("collapse_floating_chat");
    } catch (err) {
      console.error("[FloatingChat] Failed to collapse:", err);
    }
  }, [isExpanded]);

  // Click-through for transparent background
  // When collapsed: always capture events (hover to expand is handled by container onMouseEnter)
  // When expanded: pass clicks on transparent areas through to windows behind
  useEffect(() => {
    if (!isExpanded) {
      // When collapsed, always capture events so hover detection works
      if (lastIgnoreState.current !== false) {
        lastIgnoreState.current = false;
        invoke("set_ignore_cursor_events", { ignore: false }).catch(() => {});
      }
      return;
    }

    // When expanded, enable click-through for transparent areas
    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if inside a data-interactive region
      const isOverInteractive = target.closest("[data-interactive]") !== null;
      const shouldIgnore = !isOverInteractive;

      // Only update if state changed (avoid spamming Tauri)
      if (lastIgnoreState.current !== shouldIgnore) {
        lastIgnoreState.current = shouldIgnore;
        invoke("set_ignore_cursor_events", { ignore: shouldIgnore }).catch(() => {});
      }
    };

    // When mouse leaves window entirely, enable click-through
    const handleMouseLeave = () => {
      if (lastIgnoreState.current !== true) {
        lastIgnoreState.current = true;
        invoke("set_ignore_cursor_events", { ignore: true }).catch(() => {});
      }
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      // Reset to capture events
      invoke("set_ignore_cursor_events", { ignore: false }).catch(() => {});
    };
  }, [isExpanded]);

  // Listen for expand/collapse events from backend
  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      unlisteners.push(
        await listen("floating-chat-expanded", () => {
          setIsExpanded(true);
        }),
      );
      unlisteners.push(
        await listen("floating-chat-collapsed", () => {
          setIsExpanded(false);
        }),
      );
    };

    setup();
    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  // Handle window blur for collapse behavior
  useEffect(() => {
    const setup = async () => {
      // Blur input when window loses focus (clicking outside Tauri window)
      const unlisten = await listen("tauri://blur", () => {
        inputRef.current?.blur();
        isHoveringRef.current = false;
      });
      return unlisten;
    };

    const unlistenPromise = setup();
    return () => {
      unlistenPromise.then((fn) => fn());
    };
  }, []);

  // Speech-to-text: Option key triggers recording via global keyboard listener
  // All handlers are disabled when a workbook is open (isWorkbookOpenRef)
  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      // Option pressed - expand and start recording
      unlisteners.push(
        await listen("option-key-pressed", async () => {
          // Ignore when workbook is open - STT handled by workbook sidebar
          if (isWorkbookOpenRef.current) return;

          console.log("[FloatingChat] Option pressed - starting STT");
          handleExpand();
          setIsRecording(true);
          setSttPreview(""); // Clear any previous preview
          try {
            await invoke("stt_start_recording");
          } catch (err: unknown) {
            console.error("[FloatingChat] Failed to start recording:", err);
            setIsRecording(false);
            // Auto-download model in background if missing
            const errMsg = String(err).toLowerCase();
            if (
              errMsg.includes("model") ||
              errMsg.includes("missing") ||
              errMsg.includes("download") ||
              errMsg.includes("tokenizer") ||
              errMsg.includes("load") ||
              errMsg.includes("failed")
            ) {
              console.log("[FloatingChat] Model missing - auto-downloading in background");
              setSttDownloading(true);
              invoke("stt_download_model")
                .then(() => {
                  console.log("[FloatingChat] STT model downloaded successfully");
                  setSttDownloading(false);
                })
                .catch((downloadErr) => {
                  console.error("[FloatingChat] Failed to download STT model:", downloadErr);
                  setSttDownloading(false);
                });
            }
          }
        }),
      );

      // Real-time STT partial transcription
      unlisteners.push(
        await listen<string>("stt:partial", (event) => {
          if (isWorkbookOpenRef.current) return;
          setSttPreview(event.payload);
        }),
      );

      // STT download progress
      unlisteners.push(
        await listen<number>("stt:download-progress", (event) => {
          if (isWorkbookOpenRef.current) return;
          setSttDownloadProgress(event.payload);
          if (event.payload >= 1) {
            // Download complete, reset after a moment
            setTimeout(() => {
              setSttDownloading(false);
              setSttDownloadProgress(0);
            }, 500);
          }
        }),
      );

      // Option released - stop recording and get transcription
      unlisteners.push(
        await listen("option-key-released", async () => {
          // Ignore when workbook is open
          if (isWorkbookOpenRef.current) return;

          console.log("[FloatingChat] Option released - stopping STT");
          setIsRecording(false);
          setSttPreview(""); // Clear preview
          try {
            const text = await invoke<string>("stt_stop_recording");
            console.log("[FloatingChat] STT result:", text || "(empty)");
            if (text) {
              setInputValue((prev) => prev + (prev ? " " : "") + text);
              inputRef.current?.focus();
            }
          } catch (err) {
            console.error("[FloatingChat] Failed to stop recording:", err);
          }
        }),
      );

      // Option tapped quickly - just expand and focus input
      unlisteners.push(
        await listen("option-key-tapped", () => {
          // Ignore when workbook is open
          if (isWorkbookOpenRef.current) return;

          console.log("[FloatingChat] Option tapped - expanding + focusing input");
          handleExpand();
          setTimeout(() => inputRef.current?.focus(), 100);
        }),
      );

      // Option+other key pressed - cancel STT (allows Option+C, Option+V, etc.)
      unlisteners.push(
        await listen("option-key-cancelled", async () => {
          // Ignore when workbook is open
          if (isWorkbookOpenRef.current) return;

          console.log("[FloatingChat] Option combo detected - cancelling STT");
          if (isRecording) {
            setIsRecording(false);
            setSttPreview("");
            try {
              await invoke("stt_cancel_recording");
            } catch (_err) {
              // Ignore errors - recording might not have started
            }
          }
        }),
      );

      // Option+Space - toggle expand/collapse
      unlisteners.push(
        await listen("option-space-pressed", async () => {
          // Ignore when workbook is open
          if (isWorkbookOpenRef.current) return;

          console.log("[FloatingChat] Option+Space - toggle expand/collapse");
          if (isExpanded) {
            handleCollapse();
          } else {
            handleExpand();
            setTimeout(() => inputRef.current?.focus(), 100);
          }
        }),
      );
    };

    setup();
    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [handleExpand, handleCollapse, isExpanded, isRecording]);

  // Add transparent-overlay class for window transparency
  // Note: dark/light class is handled by initTheme() in overlay.tsx
  useEffect(() => {
    document.documentElement.classList.add("transparent-overlay");
    return () => {
      document.documentElement.classList.remove("transparent-overlay");
    };
  }, []);

  // Workbook directory - starts from URL params, updates on active workbook change
  const [workbookDir, setWorkbookDir] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const dir = params.get("workbook-dir") || "";
    console.log("[FloatingChat] Initial workbookDir:", dir);
    return dir;
  });

  // Listen for active workbook changes - invalidate caches to refetch from new workbook
  useEffect(() => {
    const unlisten = listen<{ workbook_id: string; workbook_dir: string }>(
      "active-workbook-changed",
      (event) => {
        console.log("[FloatingChat] Active workbook changed:", event.payload);
        const newDir = event.payload.workbook_dir;
        if (newDir && newDir !== workbookDir) {
          setWorkbookDir(newDir);
          setActiveSessionId(null); // Clear active session when switching workbooks
          // Invalidate runtime cache so it re-fetches from Tauri
          queryClient.invalidateQueries({ queryKey: ["active-runtime"] });
          // Invalidate all session-related queries to refetch from new workbook
          queryClient.invalidateQueries({ queryKey: ["sessions"] });
          queryClient.invalidateQueries({ queryKey: ["messages"] });
          queryClient.invalidateQueries({ queryKey: ["session-statuses"] });
        }
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [workbookDir, queryClient, setActiveSessionId]);

  // Visibility coordination: Hide when workbook opens, show when all workbooks close
  // Also checks initial state on mount and signals ready AFTER listeners are set up
  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    const setup = async () => {
      // When a workbook window opens, hide this floating chat and disable it
      unlisteners.push(
        await listen("workbook-opened", () => {
          console.log("[FloatingChat] Workbook opened - hiding and disabling");
          isWorkbookOpenRef.current = true;
          invoke("hide_floating_chat").catch((err) => {
            console.error("[FloatingChat] Failed to hide:", err);
          });
        }),
      );

      // When a workbook window closes, check if any remain - show if none left
      unlisteners.push(
        await listen<string>("workbook-window-closed", async (event) => {
          console.log("[FloatingChat] Workbook window closed:", event.payload);
          try {
            const hasWindows = await invoke<boolean>("has_open_workbook_windows");
            if (!hasWindows) {
              console.log("[FloatingChat] No workbook windows left - showing and enabling");
              isWorkbookOpenRef.current = false;
              await invoke("show_floating_chat");
            }
          } catch (err) {
            console.error("[FloatingChat] Failed to check/show:", err);
          }
        }),
      );

      // Check initial state AFTER listeners are set up (prevents race condition)
      // If a workbook window is already open, we should be hidden
      try {
        const hasWindows = await invoke<boolean>("has_open_workbook_windows");
        if (hasWindows) {
          console.log("[FloatingChat] Workbook already open on mount - hiding");
          isWorkbookOpenRef.current = true;
          await invoke("hide_floating_chat");
        }
      } catch (err) {
        console.error("[FloatingChat] Failed to check initial state:", err);
      }

      // Signal ready AFTER listeners and initial state check (avoids black flash + race)
      emit("floating-chat-ready");
    };

    setup();
    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, []);

  // Focus input on mount
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 200);
  }, []);

  // SSE subscription using shared startSSESync (same as workbook editor)
  useEffect(() => {
    if (!workbookDir) return;
    console.log("[FloatingChat] Starting SSE sync for:", workbookDir);
    const cleanup = startSSESync(queryClient);
    return cleanup;
  }, [workbookDir, queryClient]);

  // Drag & Drop for files
  useEffect(() => {
    const unlisteners: (() => void)[] = [];
    const setupListeners = async () => {
      const unlistenDrop = await listen<{ paths: string[] }>("tauri://drag-drop", async (event) => {
        if (hasHandledDrop.current) return;
        hasHandledDrop.current = true;
        setTimeout(() => {
          hasHandledDrop.current = false;
        }, 500);
        if (event.payload.paths.length === 0) return;
        setIsDragging(false);
        setPendingFiles(event.payload.paths);
        handleExpand();
      });
      unlisteners.push(unlistenDrop);
      unlisteners.push(await listen("tauri://drag-enter", () => setIsDragging(true)));
      unlisteners.push(await listen("tauri://drag-leave", () => setIsDragging(false)));
    };
    setupListeners();
    return () => {
      unlisteners.forEach((fn) => fn());
    };
  }, [handleExpand]);

  // Listen for external session focus
  useEffect(() => {
    const unlisten = listen<{ sessionId: string }>("floating-chat-focus-session", (event) => {
      setActiveSessionId(event.payload.sessionId);
      handleExpand();
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [handleExpand, setActiveSessionId]);

  // Use shared hooks - same as workbook editor (UnifiedSidebar)
  const { data: allSessions = [] } = useSessions();
  const { data: messages = [] } = useMessages(activeSessionId);
  const { data: sessionStatuses = {} } = useSessionStatuses();

  const sessions = useMemo(() => {
    return allSessions
      .filter((s) => !s.parentID && s.title)
      .sort((a, b) => b.time.updated - a.time.updated);
  }, [allSessions]);

  const getSessionStatus = (sessionId: string): "busy" | "error" | null => {
    const status = sessionStatuses[sessionId];
    if (status?.type === "busy" || status?.type === "running") return "busy";
    return null;
  };

  const activeStatus = activeSessionId ? sessionStatuses[activeSessionId] : null;
  const isBusy = activeStatus?.type === "busy" || activeStatus?.type === "running";

  // Use shared mutation hooks - same as workbook editor (UnifiedSidebar)
  const createSessionMutation = useCreateSession();
  const sendMessageMutation = useSendMessage();
  const abortSessionMutation = useAbortSession(activeSessionId);
  const deleteSessionMutation = useDeleteSession();

  // Workbook management
  const { data: workbooks = [] } = useWorkbooks();
  const openWorkbook = useOpenWorkbook();
  const createWorkbook = useCreateWorkbook();
  const currentWorkbook = workbooks.find((w) => w.directory === workbookDir);

  const handleSwitchWorkbook = useCallback(
    (workbook: Workbook) => {
      if (!workbook.directory) {
        console.log("[FloatingChat] No directory for workbook:", workbook);
        return;
      }
      console.log("[FloatingChat] Switching to workbook:", workbook.name, workbook.directory);

      // Update local state immediately
      setWorkbookDir(workbook.directory);
      setActiveSessionId(null);

      // Emit event so other windows know
      emit("active-workbook-changed", {
        workbook_id: workbook.id,
        workbook_dir: workbook.directory,
      });

      // Invalidate queries to refetch for new workbook
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      queryClient.invalidateQueries({ queryKey: ["session-statuses"] });
      queryClient.invalidateQueries({ queryKey: ["active-runtime"] });

      // Also trigger runtime to open this workbook
      openWorkbook.mutate(workbook);
    },
    [openWorkbook, queryClient, setActiveSessionId],
  );

  const handleCreateWorkbook = useCallback(() => {
    createWorkbook.mutate(
      { name: "Untitled Workbook" },
      {
        onSuccess: (newWorkbook) => {
          handleSwitchWorkbook(newWorkbook);
        },
      },
    );
  }, [createWorkbook, handleSwitchWorkbook]);

  // Listen for prompts forwarded from workbook sidebar
  useEffect(() => {
    const unlisten = listen<string>("floating-chat-prompt", (event) => {
      const prompt = event.payload;
      console.log("[FloatingChat] Received prompt:", prompt);

      // Create a new session and send the prompt
      createSessionMutation.mutate(undefined, {
        onSuccess: (newSession) => {
          setActiveSessionId(newSession.id);
          handleExpand();
          sendMessageMutation.mutate({ sessionId: newSession.id, content: prompt });
        },
      });
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [createSessionMutation, sendMessageMutation, handleExpand, setActiveSessionId]);

  // Wrapper for createSession to also expand and set active
  const handleCreateSession = useCallback(() => {
    createSessionMutation.mutate(undefined, {
      onSuccess: (newSession) => {
        setActiveSessionId(newSession.id);
        handleExpand();
      },
    });
  }, [createSessionMutation, handleExpand, setActiveSessionId]);

  // Track hover and focus state with refs (avoids stale closure issues)
  const isHoveringRef = useRef(false);
  const isInputFocusedRef = useRef(false);
  const collapseTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Unified collapse check - only collapse if not hovering AND not focused
  const maybeCollapse = useCallback(() => {
    // Clear any pending collapse
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
    }
    // Delay collapse slightly to handle rapid state changes
    collapseTimeoutRef.current = setTimeout(() => {
      if (!isHoveringRef.current && !isInputFocusedRef.current) {
        handleCollapse();
      }
    }, 100);
  }, [handleCollapse]);

  // Hover handlers
  const handleMouseEnter = useCallback(() => {
    isHoveringRef.current = true;
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
    }
    if (!isExpanded) {
      handleExpand();
    }
  }, [isExpanded, handleExpand]);

  const handleMouseLeave = useCallback(() => {
    isHoveringRef.current = false;
    maybeCollapse();
  }, [maybeCollapse]);

  // Input focus handlers
  const handleInputFocus = useCallback(() => {
    isInputFocusedRef.current = true;
    if (collapseTimeoutRef.current) {
      clearTimeout(collapseTimeoutRef.current);
    }
    // Ensure window has focus so keyboard input works
    invoke("focus_floating_chat").catch(() => {});
    if (!isExpanded) {
      handleExpand();
    }
  }, [isExpanded, handleExpand]);

  const handleInputBlur = useCallback(() => {
    isInputFocusedRef.current = false;
    maybeCollapse();
  }, [maybeCollapse]);

  // Attachment handlers - using shared hook
  const { handlePickFile, handlePickFolder, handleSnapshot } = useFilePicker({
    onFileSelected: (path) => setPendingFiles((prev) => [...prev, path]),
    onFolderSelected: (path) => setPendingFiles((prev) => [...prev, path]),
  });

  // Message handlers
  const handleSend = useCallback(() => {
    console.log(
      "[FloatingChat] handleSend called, inputValue:",
      inputValue,
      "activeSessionId:",
      activeSessionId,
    );
    let content = inputValue.trim();
    if (!content && pendingFiles.length === 0) {
      console.log("[FloatingChat] No content, returning");
      return;
    }
    if (isBusy) {
      console.log("[FloatingChat] Busy, returning");
      return;
    }
    if (pendingFiles.length > 0) {
      const filePrompt = `@import ${pendingFiles.join(" ")}`;
      content = content ? `${content}\n\n${filePrompt}` : filePrompt;
      setPendingFiles([]);
    }
    if (!content) return;
    if (!activeSessionId) {
      createSessionMutation.mutate(undefined, {
        onSuccess: (newSession) => {
          setActiveSessionId(newSession.id);
          sendMessageMutation.mutate({ sessionId: newSession.id, content });
        },
      });
    } else {
      sendMessageMutation.mutate({ sessionId: activeSessionId, content });
    }
    setInputValue("");
    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
  }, [
    inputValue,
    pendingFiles,
    isBusy,
    activeSessionId,
    createSessionMutation,
    sendMessageMutation,
    setActiveSessionId,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape") {
      if (pendingFiles.length > 0) setPendingFiles([]);
      else if (isExpanded) handleCollapse();
    }
  };

  // Auto-resize textarea as content grows
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value);
    // Reset height to auto to get the correct scrollHeight
    e.target.style.height = "auto";
    // Set height to scrollHeight, capped at max
    const maxHeight = 120; // ~5 lines
    e.target.style.height = `${Math.min(e.target.scrollHeight, maxHeight)}px`;
  }, []);

  const handleAbort = useCallback(() => {
    if (activeSessionId) abortSessionMutation.mutate();
  }, [activeSessionId, abortSessionMutation]);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // Separate foreground and background sessions
  const foregroundSessions = sessions.filter((s) => {
    const sp = s as Session & { parentID?: string };
    return s.title && !sp.parentID;
  });
  const backgroundSessions = sessions.filter(
    (s) => (s as Session & { parentID?: string }).parentID,
  );

  // Check if any session is busy (for collapsed indicator)
  const hasActiveSessions = sessions.some((s) => getSessionStatus(s.id) === "busy");

  // Get runtime port for tRPC (enables live query charts in ChatMessage)
  const { data: runtime } = useActiveRuntime();
  const runtimePort = runtime?.runtime_port ?? null;

  const content = (
    <div
      className={`h-screen w-screen flex flex-col pr-3 pt-3 pb-20 gap-2 relative ${isExpanded ? "pl-3" : "pl-0"} ${isDragging ? "bg-blue-500/10" : ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Drop overlay */}
      <AnimatePresence>
        {isDragging && (
          <motion.div
            data-interactive
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 border-2 border-dashed border-blue-500 bg-blue-500/10 backdrop-blur-sm flex items-center justify-center z-50"
          >
            <div className="flex flex-col items-center gap-2 text-blue-400">
              <FileUp className="h-8 w-8" />
              <span className="text-sm font-medium">Drop files to import</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content area - changes based on whether we're in a thread */}
      <AnimatePresence mode="wait">
        {isExpanded && activeSessionId && messages.length > 0 ? (
          /* IN A THREAD: Show messages */
          <motion.div
            key="messages"
            data-interactive
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            ref={scrollRef}
            className="flex-1 overflow-y-auto min-h-0 flex flex-col"
          >
            <LinkClickHandler className="flex flex-col gap-3 mt-auto">
              {messages.map((msg) => (
                <ChatMessage key={msg.info.id} message={msg} compact tailDown />
              ))}
              <AnimatePresence>
                {isBusy && messages[messages.length - 1]?.info.role === "user" && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="rounded-2xl rounded-bl-sm bg-zinc-800 shadow-sm px-2.5 py-1.5 w-fit"
                  >
                    <ThinkingIndicator />
                  </motion.div>
                )}
              </AnimatePresence>
            </LinkClickHandler>
          </motion.div>
        ) : isExpanded ? (
          /* NOT IN A THREAD: Show thread chips + dropdown */
          <motion.div
            key="toc"
            data-interactive
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="flex-1 flex flex-col justify-end min-h-0"
          >
            {/* Thread list - vertically stacked, compact pills */}
            {(foregroundSessions.length > 0 || backgroundSessions.length > 0) && (
              <div className="flex flex-col gap-1 mt-auto items-start">
                {foregroundSessions.slice(0, 6).map((session) => {
                  const status = getSessionStatus(session.id);
                  return (
                    <div
                      key={session.id}
                      className="group flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 text-xs rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 border border-zinc-700/50 transition-all"
                    >
                      <StatusDot status={status} />
                      <button
                        onClick={() => setActiveSessionId(session.id)}
                        className="max-w-[140px] truncate hover:text-white transition-colors"
                      >
                        {session.title || "Untitled"}
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSessionMutation.mutate(session.id);
                        }}
                        className="p-0.5 rounded hover:bg-zinc-600 text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}

                {/* Overflow + Background row */}
                {(foregroundSessions.length > 6 || backgroundSessions.length > 0) && (
                  <div className="flex items-center gap-2 mt-1">
                    {/* Overflow dropdown */}
                    {foregroundSessions.length > 6 && (
                      <div className="relative">
                        <button
                          onClick={() => setShowThreadsDropdown(!showThreadsDropdown)}
                          className="flex items-center gap-1.5 px-2.5 h-7 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 rounded-lg transition-colors"
                        >
                          <span>+{foregroundSessions.length - 6} more</span>
                          <ChevronDown className="h-3 w-3" />
                        </button>

                        <AnimatePresence>
                          {showThreadsDropdown && (
                            <motion.div
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 5 }}
                              className="absolute bottom-full left-0 mb-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 min-w-[220px] py-1 max-h-[300px] overflow-y-auto"
                            >
                              {foregroundSessions.slice(6).map((session) => (
                                <div
                                  key={session.id}
                                  className="group w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                                >
                                  <StatusDot status={getSessionStatus(session.id)} />
                                  <button
                                    onClick={() => {
                                      setActiveSessionId(session.id);
                                      setShowThreadsDropdown(false);
                                    }}
                                    className="truncate flex-1 text-left hover:text-white"
                                  >
                                    {session.title || "Untitled"}
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteSessionMutation.mutate(session.id);
                                    }}
                                    className="p-0.5 rounded hover:bg-zinc-600 text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-all"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    {/* Background jobs pill */}
                    {backgroundSessions.length > 0 && (
                      <div className="relative">
                        <button
                          onClick={() => setShowThreadsDropdown(!showThreadsDropdown)}
                          className="flex items-center gap-1.5 px-2.5 h-7 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 rounded-lg transition-colors"
                        >
                          <Layers className="h-3.5 w-3.5" />
                          <span>{backgroundSessions.length}</span>
                          {backgroundSessions.some((s) => getSessionStatus(s.id) === "busy") && (
                            <span className="relative flex h-1.5 w-1.5">
                              <span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-75" />
                              <span className="relative rounded-full h-1.5 w-1.5 bg-emerald-500" />
                            </span>
                          )}
                        </button>

                        <AnimatePresence>
                          {showThreadsDropdown && foregroundSessions.length <= 6 && (
                            <motion.div
                              initial={{ opacity: 0, y: 5 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: 5 }}
                              className="absolute bottom-full left-0 mb-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 min-w-[220px] py-1"
                            >
                              <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] uppercase text-zinc-500 font-medium">
                                <Layers className="h-3 w-3" />
                                Background Jobs
                              </div>
                              {backgroundSessions.map((session) => (
                                <div
                                  key={session.id}
                                  className="group w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-700 transition-colors"
                                >
                                  <StatusDot status={getSessionStatus(session.id)} />
                                  <button
                                    onClick={() => {
                                      setActiveSessionId(session.id);
                                      setShowThreadsDropdown(false);
                                    }}
                                    className="truncate flex-1 text-left hover:text-zinc-200"
                                  >
                                    {session.title || `Subtask ${session.id.slice(0, 6)}`}
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      deleteSessionMutation.mutate(session.id);
                                    }}
                                    className="p-0.5 rounded hover:bg-zinc-600 text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-all"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}

                    {/* New thread button */}
                    <button
                      onClick={handleCreateSession}
                      disabled={createSessionMutation.isPending}
                      className="flex items-center justify-center h-7 w-7 text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 rounded-lg transition-colors ml-auto"
                    >
                      {createSessionMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                )}

                {/* New thread button when no overflow/bg */}
                {foregroundSessions.length <= 6 && backgroundSessions.length === 0 && (
                  <button
                    onClick={handleCreateSession}
                    disabled={createSessionMutation.isPending}
                    className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300 bg-zinc-800/50 hover:bg-zinc-800 border border-dashed border-zinc-700/50 rounded-lg transition-colors"
                  >
                    {createSessionMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5" />
                        <span>New thread</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Navigation pills - only when in a thread */}
      <AnimatePresence>
        {isExpanded && activeSessionId && messages.length > 0 && (
          <motion.div
            data-interactive
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex items-center gap-2 shrink-0"
          >
            {/* Back button + thread title */}
            <button
              onClick={() => setActiveSessionId(null)}
              className="flex items-center gap-1.5 px-2 h-7 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="max-w-[120px] truncate">{activeSession?.title || "Thread"}</span>
            </button>

            {/* Background jobs indicator */}
            {backgroundSessions.length > 0 && (
              <button
                onClick={() => setActiveSessionId(null)}
                className="flex items-center gap-1.5 px-2 h-7 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
              >
                <Layers className="h-3.5 w-3.5" />
                <span>
                  {backgroundSessions.filter((s) => getSessionStatus(s.id) === "busy").length ||
                    backgroundSessions.length}
                </span>
                {backgroundSessions.some((s) => getSessionStatus(s.id) === "busy") && (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative rounded-full h-1.5 w-1.5 bg-green-500" />
                  </span>
                )}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsed ToC preview - absolutely positioned to cross-fade without layout shift */}
      <AnimatePresence>
        {!isExpanded && (foregroundSessions.length > 0 || backgroundSessions.length > 0) && (
          <motion.div
            data-interactive
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-[140px] left-0 flex flex-col items-center gap-1.5 w-[52px] pointer-events-auto"
          >
            {foregroundSessions.slice(0, 6).map((session, idx) => {
              const status = getSessionStatus(session.id);
              const isActive = session.id === activeSessionId;
              return (
                <motion.div
                  key={session.id}
                  initial={{ width: 0 }}
                  animate={{ width: isActive ? 24 : 16 - Math.min(idx, 2) * 3 }}
                  className={`h-[3px] rounded-full cursor-pointer transition-colors ${
                    status === "busy"
                      ? "bg-emerald-500"
                      : isActive
                        ? "bg-blue-400"
                        : "bg-zinc-700 hover:bg-zinc-500"
                  }`}
                  onClick={() => {
                    setActiveSessionId(session.id);
                    handleExpand();
                  }}
                />
              );
            })}
            {foregroundSessions.length > 6 && (
              <span className="text-[8px] text-zinc-600">+{foregroundSessions.length - 6}</span>
            )}
            {/* Background jobs indicator */}
            {backgroundSessions.length > 0 && (
              <div
                className="flex items-center justify-center gap-0.5 mt-1 cursor-pointer"
                onClick={handleExpand}
              >
                <Layers className="h-2.5 w-2.5 text-zinc-500" />
                {backgroundSessions.some((s) => getSessionStatus(s.id) === "busy") && (
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                )}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom container - toolbar + workbook bar */}
      <div className="mt-auto shrink-0 flex flex-col gap-1">
        {/* Floating toolbar - acts as tab when collapsed */}
        <div
          data-interactive
          className={`flex items-center gap-2 min-h-[52px] bg-zinc-900 border border-zinc-700/50 shadow-2xl self-start py-1.5 transition-all duration-200 ease-out ${
            isExpanded
              ? "w-full rounded-2xl px-2 border-l"
              : "w-[52px] rounded-r-2xl rounded-l-none border-l-0 px-1.5"
          }`}
        >
          {/* Hand icon button with ChatSettings popover */}
          <ChatSettings>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={`h-9 w-9 rounded-xl flex items-center justify-center transition-colors relative shrink-0 self-center ${
                isRecording
                  ? "text-red-400"
                  : sttDownloading
                    ? "text-blue-400"
                    : "text-zinc-300 hover:text-zinc-100"
              }`}
            >
              {sttDownloading ? (
                <div className="relative h-5 w-5">
                  {/* Background circle */}
                  <svg className="h-5 w-5 -rotate-90" viewBox="0 0 20 20">
                    <circle
                      cx="10"
                      cy="10"
                      r="8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      className="text-zinc-700"
                    />
                    <circle
                      cx="10"
                      cy="10"
                      r="8"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeDasharray={2 * Math.PI * 8}
                      strokeDashoffset={2 * Math.PI * 8 * (1 - sttDownloadProgress)}
                      strokeLinecap="round"
                      className="text-blue-400 transition-all duration-300"
                    />
                  </svg>
                  {/* Percentage text */}
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] font-medium text-blue-400">
                    {Math.round(sttDownloadProgress * 100)}
                  </span>
                </div>
              ) : isRecording ? (
                <Mic className="h-5 w-5 animate-pulse" />
              ) : (
                <Hand className="h-5 w-5" />
              )}
              {/* Activity indicator when collapsed */}
              {!isExpanded && hasActiveSessions && !sttDownloading && (
                <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
              )}
            </motion.button>
          </ChatSettings>

          {/* Input section - only when expanded: [text][attach][submit] */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="flex-1 flex items-end overflow-hidden"
              >
                {/* Text input - auto-resizing textarea */}
                <textarea
                  ref={inputRef}
                  value={isRecording && sttPreview ? sttPreview : inputValue}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  onFocus={handleInputFocus}
                  onBlur={handleInputBlur}
                  placeholder={isRecording ? "Listening..." : "Ask anything..."}
                  rows={1}
                  readOnly={isRecording}
                  className={`flex-1 bg-transparent py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none min-w-0 resize-none overflow-y-auto ${isRecording ? "placeholder:text-red-400 text-red-300" : ""}`}
                  style={{ maxHeight: "120px" }}
                />

                {/* Attachment dropdown - shared component */}
                <AttachmentMenu
                  onSnapshot={handleSnapshot}
                  onPickFile={handlePickFile}
                  onPickFolder={handlePickFolder}
                  pendingFiles={pendingFiles}
                  onRemoveFile={(i) => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                  triggerClassName="h-8 w-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-200 transition-colors shrink-0 self-center relative"
                />

                {/* Submit/Abort button - no bg */}
                <AnimatePresence mode="wait">
                  {isBusy ? (
                    <motion.button
                      key="abort"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      onClick={handleAbort}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-red-400 hover:text-red-300 shrink-0 self-center"
                    >
                      <Square className="h-4 w-4" />
                    </motion.button>
                  ) : (
                    <motion.button
                      key="send"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      onClick={handleSend}
                      disabled={!inputValue.trim() && pendingFiles.length === 0}
                      className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 self-center transition-colors ${
                        inputValue.trim() || pendingFiles.length > 0
                          ? "text-zinc-100 hover:text-white"
                          : "text-zinc-500"
                      }`}
                    >
                      {sendMessageMutation.isPending || createSessionMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ArrowUp className="h-4 w-4" />
                      )}
                    </motion.button>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Workbook bar - below chat input when expanded */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              data-interactive
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="flex items-center gap-2 px-2 py-1.5 text-xs text-zinc-400 self-start"
            >
              <Book className="h-3.5 w-3.5 shrink-0" />

              {/* Workbook name - shared dropdown to switch */}
              <WorkbookDropdown
                workbooks={workbooks}
                currentWorkbook={currentWorkbook}
                currentWorkbookDir={workbookDir}
                onSwitchWorkbook={handleSwitchWorkbook}
                onCreateWorkbook={handleCreateWorkbook}
              />

              {/* Open button - opens workbook editor */}
              <button
                onClick={() => {
                  if (currentWorkbook) {
                    invoke("open_workbook_window", { workbookId: currentWorkbook.id });
                  }
                }}
                className="ml-auto px-2 py-0.5 rounded text-[11px] text-zinc-300 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-700 transition-colors"
              >
                Open
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  // Extract workbook ID from directory path (last segment)
  const workbookId = workbookDir ? workbookDir.split("/").pop() || null : null;

  // Wrap content with providers
  let wrappedContent = (
    <LinkNavigationProvider isFloatingChat workbookId={workbookId}>
      {content}
    </LinkNavigationProvider>
  );

  // Wrap with TRPCProvider when runtime is connected (enables live query charts)
  if (runtimePort) {
    wrappedContent = (
      <TRPCProvider queryClient={queryClient} runtimePort={runtimePort}>
        {wrappedContent}
      </TRPCProvider>
    );
  }

  return wrappedContent;
}

export default FloatingChat;
