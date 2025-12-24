/**
 * Capture Action Panel
 *
 * Shows after screen capture with:
 * - AI-generated summary of the screenshot
 * - Default "Import into workbook" action with workbook selector
 * - 2 AI-suggested actions
 */

import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ChevronDown, Database, Hand, RefreshCw, Wand2, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useCallback, useEffect, useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";

interface Workbook {
  id: string;
  name: string;
  directory: string;
}

type ActionType =
  | { type: "get_data"; label: string; prompt: string }
  | { type: "set_up_sync"; label: string; prompt: string }
  | { type: "custom"; label: string; prompt: string };

interface AnalysisResult {
  summary: string;
  actions: ActionType[];
}

interface RuntimeStatus {
  running: boolean;
  workbook_id: string;
  directory: string;
  runtime_port: number;
  message: string;
}

async function analyzeScreenshotAPI(imagePath: string, runtimePort: number): Promise<AnalysisResult> {
  // Match the trpcMutation pattern from useGit.ts - input sent directly as JSON body
  console.log("[CapturePanel] Calling tRPC mutation with imagePath:", imagePath);

  const response = await fetch(`http://localhost:${runtimePort}/trpc/ai.analyzeScreenshot`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imagePath }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    console.error("[CapturePanel] API error:", error);
    throw new Error(error.error?.message || error.message || "API error");
  }

  const data = await response.json();
  console.log("[CapturePanel] API response:", data);
  return data.result?.data as AnalysisResult;
}

export function CaptureActionPanel() {
  const [screenshotPath, setScreenshotPath] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [imgWidth, setImgWidth] = useState<number>(0);
  const [imgHeight, setImgHeight] = useState<number>(0);
  const [panelId, setPanelId] = useState<string>("");
  const [workbooks, setWorkbooks] = useState<Workbook[]>([]);
  const [selectedWorkbook, setSelectedWorkbook] = useState<string>("");
  const [showDropdown, setShowDropdown] = useState(false);

  // Ref for content wrapper to detect background clicks
  const contentRef = useRef<HTMLDivElement>(null);

  // Set up transparent overlay on mount
  useEffect(() => {
    // Make the window fully transparent and use dark theme
    document.documentElement.classList.add("transparent-overlay", "dark");
    return () => {
      document.documentElement.classList.remove("transparent-overlay", "dark");
    };
  }, []);

  // Parse query params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const screenshot = params.get("screenshot");
    const id = params.get("panel-id");
    const width = params.get("img-width");
    const height = params.get("img-height");

    if (screenshot) {
      const path = decodeURIComponent(screenshot);
      setScreenshotPath(path);
      setScreenshotUrl(convertFileSrc(path));
    }

    if (id) {
      setPanelId(id);
    }

    if (width) {
      setImgWidth(parseInt(width, 10));
    }
    if (height) {
      setImgHeight(parseInt(height, 10));
    }
  }, []);

  // Load workbooks
  useEffect(() => {
    async function loadWorkbooks() {
      try {
        const list = await invoke<Workbook[]>("list_workbooks");
        setWorkbooks(list);
        if (list.length > 0) {
          setSelectedWorkbook(list[0].id);
        }
      } catch (err) {
        console.error("Failed to load workbooks:", err);
      }
    }
    loadWorkbooks();
  }, []);

  // Analyze screenshot with React Query - retries until workbook server is ready
  const { data: analysis, isLoading: isAnalyzing, error } = useQuery({
    queryKey: ["analyzeScreenshot", screenshotPath],
    queryFn: async () => {
      if (!screenshotPath) throw new Error("No screenshot");

      console.log("[CapturePanel] Getting active runtime...");
      // Get runtime - will retry if not ready
      const runtime = await invoke<RuntimeStatus | null>("get_active_runtime");
      console.log("[CapturePanel] Runtime:", runtime);
      if (!runtime?.running) {
        throw new Error("Workbook server not ready");
      }

      console.log("[CapturePanel] Calling AI endpoint on port", runtime.runtime_port);
      const result = await analyzeScreenshotAPI(screenshotPath, runtime.runtime_port);
      console.log("[CapturePanel] AI result:", result);
      console.log("[CapturePanel] Actions:", result?.actions);
      console.log("[CapturePanel] Actions length:", result?.actions?.length);
      return result;
    },
    enabled: !!screenshotPath,
    retry: 10,
    retryDelay: 500,
    staleTime: Infinity,
  });

  // Log errors
  useEffect(() => {
    if (error) {
      console.error("[CapturePanel] Query error:", error);
    }
  }, [error]);


  // Handle escape to close
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        await handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [panelId]);

  const handleClose = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      await win.close();
    } catch (err) {
      console.error("Failed to close panel:", err);
    }
  }, []);

  const handleDragStart = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const win = getCurrentWindow();
      await win.startDragging();
    } catch (err) {
      console.error("Failed to start dragging:", err);
    }
  };

  const handleAction = useCallback(async (action: ActionType) => {
    console.log("[CapturePanel] Action selected:", action);

    if (!selectedWorkbook) {
      console.error("[CapturePanel] No workbook selected");
      return;
    }

    try {
      // Emit event with the action prompt for the workbook window to pick up
      await emit("capture-action-prompt", {
        workbookId: selectedWorkbook,
        prompt: action.prompt,
        actionType: action.type,
        label: action.label,
      });

      // Open workbook window - Rust handles focus vs create
      console.log("[CapturePanel] Opening workbook window:", selectedWorkbook);
      await invoke("open_workbook_window", { workbookId: selectedWorkbook });

      // Close the capture panel
      await handleClose();
    } catch (err) {
      console.error("[CapturePanel] Failed to execute action:", err);
    }
  }, [selectedWorkbook, handleClose]);

  const selectedWorkbookName = workbooks.find(w => w.id === selectedWorkbook)?.name || "Select workbook...";

  // Handle click on transparent background to close
  const handleBackgroundClick = useCallback((e: React.MouseEvent) => {
    // Only close if clicking directly on the background, not on content
    if (e.target === e.currentTarget) {
      handleClose();
    }
  }, [handleClose]);

  return (
    <div
      className="h-screen w-screen flex flex-col bg-transparent cursor-default"
      onClick={handleBackgroundClick}
    >
      {/* Content wrapper */}
      <div
        ref={contentRef}
        className="flex flex-col gap-2"
        onClick={(e) => e.stopPropagation()}
      >
      {/* Screenshot with pulsing glow - padding creates space for glow effect */}
      {screenshotPath && imgWidth > 0 && imgHeight > 0 && (
        <div className="p-5" onMouseDown={handleDragStart}>
          <div
            className="relative"
            style={{ width: imgWidth, height: imgHeight }}
          >
            {/* Close button - top right of image */}
            <button
              onClick={handleClose}
              onMouseDown={(e) => e.stopPropagation()}
              className="absolute -top-2 -right-2 z-20 p-1 rounded-full bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shadow-lg"
              title="Close (Esc)"
            >
              <X className="h-4 w-4" />
            </button>
            {/* Glow layer - tight blur to avoid cutoff, only this pulses */}
            <div
              className="absolute inset-0 rounded-md bg-gradient-to-r from-blue-500/50 via-purple-500/50 to-blue-500/50 blur-sm animate-glow-pulse"
            />
            {/* Image - z-10 ensures it's above the glow */}
            <img
              src={`asset://localhost/${encodeURIComponent(screenshotPath)}`}
              alt="Captured screenshot"
              width={imgWidth}
              height={imgHeight}
              className="relative z-10 block rounded-md shadow-lg"
              style={{ width: imgWidth, height: imgHeight, imageRendering: "auto" }}
              onError={(e) => {
                // Fallback to convertFileSrc if asset protocol fails
                const target = e.target as HTMLImageElement;
                if (screenshotUrl && target.src !== screenshotUrl) {
                  target.src = screenshotUrl;
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Workbook selector - below image */}
      <div className="px-5" onMouseDown={handleDragStart}>
        <div className="relative inline-block">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            onMouseDown={(e) => e.stopPropagation()}
            disabled={workbooks.length === 0}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-secondary/50 hover:bg-accent text-muted-foreground hover:text-foreground text-xs rounded-full transition-colors"
          >
            <span className="truncate max-w-[150px]">{selectedWorkbookName}</span>
            <ChevronDown className="h-3 w-3 shrink-0" />
          </button>

          {showDropdown && workbooks.length > 0 && (
            <div
              className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-lg shadow-lg overflow-hidden z-20 min-w-[120px]"
              onMouseDown={(e) => e.stopPropagation()}
            >
              {workbooks.map((wb) => (
                <button
                  key={wb.id}
                  onClick={() => {
                    setSelectedWorkbook(wb.id);
                    setShowDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors ${
                    wb.id === selectedWorkbook ? "bg-accent text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {wb.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Agent message bubble */}
      <div className="px-5" onMouseDown={handleDragStart}>
        <motion.div
          className="inline-flex items-start gap-2 px-3 py-2 bg-card rounded-lg max-w-full"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: 0.1 }}
        >
          <Hand className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
          {isAnalyzing ? (
            <span className="text-sm text-muted-foreground italic animate-text-shimmer">Thinking...</span>
          ) : analysis?.summary ? (
            <p className="text-sm text-foreground leading-relaxed">
              {analysis.summary}
            </p>
          ) : (
            <span className="text-sm text-muted-foreground">Ready</span>
          )}
        </motion.div>
      </div>

      {/* Action pills row - only show when done analyzing */}
      {!isAnalyzing && (
        <div className="px-5 pb-3 flex flex-wrap items-center gap-2" onMouseDown={handleDragStart}>
          {/* AI suggested actions */}
          {console.log("[CapturePanel] Rendering actions:", analysis?.actions)}
          {analysis?.actions && analysis.actions.length > 0 && analysis.actions.map((action, i) => {
          let Icon = Wand2;

          if (action.type === "get_data") {
            Icon = Database;
          } else if (action.type === "set_up_sync") {
            Icon = RefreshCw;
          }

          return (
            <motion.button
              key={i}
              onClick={() => handleAction(action)}
              onMouseDown={(e) => e.stopPropagation()}
              title={action.prompt}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-secondary/50 hover:bg-accent text-muted-foreground hover:text-foreground text-xs rounded-full transition-colors"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: 0.15 + i * 0.05 }}
            >
              <Icon className="h-3 w-3" />
              {action.label}
            </motion.button>
          );
        })}
        </div>
      )}
      </div>
    </div>
  );
}

export default CaptureActionPanel;
