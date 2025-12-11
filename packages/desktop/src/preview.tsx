import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { X, Minus, Maximize2, Minimize2, ExternalLink, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";

// Preview window - wraps external URLs with custom window controls
export function PreviewWindow() {
  const [url, setUrl] = useState<string | null>(null);
  const [title, setTitle] = useState("Preview");
  const [isMaximized, setIsMaximized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Get URL from query params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const targetUrl = params.get("url");
    const windowTitle = params.get("title");

    if (targetUrl) {
      setUrl(decodeURIComponent(targetUrl));
    }
    if (windowTitle) {
      setTitle(decodeURIComponent(windowTitle));
    }
  }, []);

  // Track maximized state
  useEffect(() => {
    const win = getCurrentWindow();
    const checkMaximized = async () => {
      setIsMaximized(await win.isMaximized());
    };
    checkMaximized();

    // Listen for resize events
    const unlisten = win.onResized(() => {
      checkMaximized();
    });

    return () => {
      unlisten.then(fn => fn());
    };
  }, []);

  const handleDragStart = async (e: React.MouseEvent) => {
    // Prevent default to avoid text selection
    e.preventDefault();
    try {
      const win = getCurrentWindow();
      await win.startDragging();
    } catch (err) {
      console.error("Failed to start dragging:", err);
    }
  };

  const handleClose = async () => {
    try {
      const win = getCurrentWindow();
      await win.close();
    } catch (err) {
      console.error("Failed to close:", err);
    }
  };

  const handleMinimize = async () => {
    try {
      const win = getCurrentWindow();
      await win.minimize();
    } catch (err) {
      console.error("Failed to minimize:", err);
    }
  };

  const handleMaximize = async () => {
    try {
      const win = getCurrentWindow();
      if (isMaximized) {
        await win.unmaximize();
      } else {
        await win.maximize();
      }
    } catch (err) {
      console.error("Failed to maximize:", err);
    }
  };

  const handleOpenExternal = async () => {
    if (url) {
      try {
        const { open } = await import("@tauri-apps/plugin-shell");
        await open(url);
      } catch (err) {
        console.error("Failed to open external:", err);
      }
    }
  };

  const handleRefresh = () => {
    setIsLoading(true);
    setError(null);
    // Force iframe reload by toggling the key
    const iframe = document.getElementById("preview-iframe") as HTMLIFrameElement;
    if (iframe) {
      iframe.src = iframe.src;
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background rounded-xl overflow-hidden border border-border">
      {/* Custom titlebar - entire bar is draggable */}
      <div className="h-10 flex items-center justify-between bg-card/80 backdrop-blur-sm border-b border-border shrink-0">
        {/* Drag region - takes up all space not used by buttons */}
        <div
          onMouseDown={handleDragStart}
          className="flex-1 h-full flex items-center px-3 cursor-grab active:cursor-grabbing select-none"
        >
          <span className="text-sm text-foreground truncate pointer-events-none">
            {title}
          </span>
        </div>

        {/* Right side - controls (not draggable) */}
        <div className="flex items-center gap-0.5 px-1 shrink-0">
          {/* Refresh */}
          <button
            onClick={handleRefresh}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors"
            title="Refresh"
          >
            <RotateCw className={cn("h-3.5 w-3.5", isLoading && "animate-spin")} />
          </button>

          {/* Open in browser */}
          <button
            onClick={handleOpenExternal}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors"
            title="Open in browser"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>

          {/* Window controls */}
          <div className="flex items-center ml-1">
            <button
              onClick={handleMinimize}
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors"
              title="Minimize"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleMaximize}
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors"
              title={isMaximized ? "Restore" : "Maximize"}
            >
              {isMaximized ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              onClick={handleClose}
              className="p-1.5 rounded-md hover:bg-destructive text-muted-foreground hover:text-destructive-foreground transition-colors"
              title="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Content area with iframe */}
      <div className="flex-1 relative bg-background">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="h-8 w-8 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
              <span className="text-sm text-muted-foreground">Loading preview...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-background z-10">
            <div className="flex flex-col items-center gap-3 max-w-md px-4 text-center">
              <div className="text-destructive text-lg">Failed to load</div>
              <p className="text-sm text-muted-foreground">{error}</p>
              <button
                onClick={handleRefresh}
                className="px-4 py-2 text-sm bg-secondary hover:bg-secondary/80 rounded-lg text-secondary-foreground transition-colors"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {url && (
          <iframe
            id="preview-iframe"
            src={url}
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setError("Could not load the preview. The page may be blocking iframe embedding.");
            }}
          />
        )}

        {!url && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background">
            <span className="text-muted-foreground">No URL provided</span>
          </div>
        )}
      </div>

      {/* Resize handles - visual indicators at corners */}
      <div className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize" />
    </div>
  );
}

export default PreviewWindow;
