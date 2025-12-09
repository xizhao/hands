/**
 * EmptyWorkbookState - Getting started page when no data and no connectors
 *
 * Three CTAs:
 * 1. Drag in some data (files)
 * 2. Add sources (from stdlib registry)
 * 3. Ask Hands to get you data (points to chat bar)
 */

import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import {
  FileArrowDown,
  ChatCircle,
  Newspaper,
  GithubLogo,
  Database,
  Plus,
} from "@phosphor-icons/react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useAvailableSources,
  useAddSource,
  useRuntimeStatus,
  type AvailableSource,
} from "@/hooks/useWorkbook";
import { useUIStore } from "@/stores/ui";

interface EmptyWorkbookStateProps {
  onImportFile: () => void;
}

// Icon mapping for known sources
const sourceIcons: Record<string, typeof Database> = {
  hackernews: Newspaper,
  github: GithubLogo,
};

function getSourceIcon(name: string) {
  return sourceIcons[name] || Database;
}

// Hand-drawn chalk arrow - dusty but cohesive
function HandDrawnArrow({ startX, startY, endX, endY }: { startX: number; startY: number; endX: number; endY: number }) {
  const x = startX;
  const arrowLen = 10;
  const length = endY - startY;

  // Seeded random for consistent render
  const seededRandom = (seed: number) => {
    const s = Math.sin(seed * 9999) * 10000;
    return s - Math.floor(s);
  };

  // Generate chalk dust particles along the line - tighter spacing
  const particles: Array<{ cx: number; cy: number; r: number; opacity: number }> = [];
  const particleCount = Math.floor(length / 1.2); // More particles, closer together

  for (let i = 0; i < particleCount; i++) {
    const t = i / particleCount;
    const y = startY + length * t;

    // Tighter cluster around center line
    const clusterCount = Math.floor(seededRandom(i * 7) * 2) + 2;
    for (let j = 0; j < clusterCount; j++) {
      const offsetX = (seededRandom(i * 13 + j * 17) - 0.5) * 3; // Tighter spread
      const offsetY = (seededRandom(i * 19 + j * 23) - 0.5) * 1.5;
      const size = seededRandom(i * 29 + j * 31) * 0.8 + 0.4;
      const opacity = seededRandom(i * 37 + j * 41) * 0.3 + 0.25;

      particles.push({
        cx: x + offsetX,
        cy: y + offsetY,
        r: size,
        opacity,
      });
    }
  }

  // Arrow head particles - tighter
  const arrowParticles: Array<{ cx: number; cy: number; r: number; opacity: number }> = [];

  // Left arm of arrow
  for (let i = 0; i < 12; i++) {
    const t = i / 12;
    const ax = x - arrowLen * (1 - t);
    const ay = endY - arrowLen * (1 - t);
    for (let j = 0; j < 2; j++) {
      arrowParticles.push({
        cx: ax + (seededRandom(i * 43 + j * 47) - 0.5) * 2.5,
        cy: ay + (seededRandom(i * 53 + j * 59) - 0.5) * 1.5,
        r: seededRandom(i * 61 + j * 67) * 0.7 + 0.4,
        opacity: seededRandom(i * 71 + j * 73) * 0.3 + 0.25,
      });
    }
  }

  // Right arm of arrow
  for (let i = 0; i < 12; i++) {
    const t = i / 12;
    const ax = x + arrowLen * (1 - t);
    const ay = endY - arrowLen * (1 - t);
    for (let j = 0; j < 2; j++) {
      arrowParticles.push({
        cx: ax + (seededRandom(i * 79 + j * 83) - 0.5) * 2.5,
        cy: ay + (seededRandom(i * 89 + j * 97) - 0.5) * 1.5,
        r: seededRandom(i * 101 + j * 103) * 0.7 + 0.4,
        opacity: seededRandom(i * 107 + j * 109) * 0.3 + 0.25,
      });
    }
  }

  return (
    <svg
      className="fixed pointer-events-none z-40"
      style={{
        left: 0,
        top: 0,
        width: '100%',
        height: '100%',
        overflow: 'visible',
      }}
    >
      {/* Main line - chalk dust particles */}
      <g>
        {particles.map((p, i) => (
          <circle
            key={`line-${i}`}
            cx={p.cx}
            cy={p.cy}
            r={p.r}
            fill="white"
            opacity={p.opacity}
          />
        ))}
      </g>

      {/* Arrow head particles */}
      <g>
        {arrowParticles.map((p, i) => (
          <circle
            key={`arrow-${i}`}
            cx={p.cx}
            cy={p.cy}
            r={p.r}
            fill="white"
            opacity={p.opacity}
          />
        ))}
      </g>
    </svg>
  );
}

export function EmptyWorkbookState({
  onImportFile,
}: EmptyWorkbookStateProps) {
  const [showSources, setShowSources] = useState(false);
  const [arrowCoords, setArrowCoords] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const askHandsRef = useRef<HTMLDivElement>(null);
  const { activeWorkbookId } = useUIStore();
  const { data: runtimeStatus } = useRuntimeStatus(activeWorkbookId);
  const runtimePort = runtimeStatus?.runtime_port ?? null;

  const { data: availableSources = [] } = useAvailableSources(runtimePort);
  const addSource = useAddSource();

  // Calculate arrow position
  useEffect(() => {
    const updateArrow = () => {
      const askHandsEl = askHandsRef.current;
      // Find the chat bar input
      const chatBar = document.querySelector('[data-chat-bar]');

      if (askHandsEl && chatBar) {
        const askRect = askHandsEl.getBoundingClientRect();
        const chatRect = chatBar.getBoundingClientRect();

        setArrowCoords({
          startX: askRect.left + askRect.width / 2,
          startY: askRect.bottom + 8,
          endX: chatRect.left + chatRect.width / 2,
          endY: chatRect.top - 8,
        });
      }
    };

    updateArrow();
    window.addEventListener('resize', updateArrow);

    // Also update after a short delay to catch layout shifts
    const timeout = setTimeout(updateArrow, 100);

    return () => {
      window.removeEventListener('resize', updateArrow);
      clearTimeout(timeout);
    };
  }, []);

  const handleAddSource = async (source: AvailableSource) => {
    if (!runtimePort) return;

    try {
      await addSource.mutateAsync({
        runtimePort,
        sourceName: source.name,
      });
      setShowSources(false);
    } catch (err) {
      console.error("Failed to add source:", err);
    }
  };

  // Show first 2 sources in quick list
  const quickSources = availableSources.slice(0, 2);
  const hasMoreSources = availableSources.length > 2;

  return (
    <>
      <div className="flex flex-col items-center justify-center h-full py-16 px-8 max-w-2xl mx-auto">
        <h2 className="text-xl font-semibold text-foreground tracking-tight mb-2">
          Get started
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-10">
          Bring in some data to start exploring and building
        </p>

        {/* Three CTAs in a row - items-stretch for equal height */}
        <div className="grid grid-cols-3 gap-4 w-full items-stretch">
          {/* 1. Drag in data */}
          <button
            onClick={onImportFile}
            className={cn(
              "group flex flex-col items-center justify-center gap-3 p-6 rounded-xl",
              "bg-gradient-to-b from-primary/5 to-primary/10",
              "border-2 border-dashed border-primary/30 hover:border-primary/50",
              "hover:bg-primary/15",
              "transition-all duration-200"
            )}
          >
            <FileArrowDown
              weight="duotone"
              className="h-8 w-8 text-primary/70 group-hover:text-primary transition-colors"
            />
            <div className="text-center">
              <div className="text-sm font-medium text-foreground">
                Drop files
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                CSV, JSON, Parquet
              </div>
            </div>
          </button>

          {/* 2. Add sources */}
          <div
            className={cn(
              "flex flex-col items-center justify-center gap-3 p-6 rounded-xl",
              "bg-gradient-to-b from-muted/30 to-muted/10",
              "border border-border/50"
            )}
          >
            <div className="text-sm font-medium text-foreground mb-1">
              Add a source
            </div>

            {/* Quick source buttons */}
            <div className="flex flex-wrap justify-center gap-1.5">
              {quickSources.map((source) => {
                const Icon = getSourceIcon(source.name);
                return (
                  <button
                    key={source.name}
                    onClick={() => handleAddSource(source)}
                    disabled={addSource.isPending}
                    className={cn(
                      "flex items-center gap-1.5 px-2 py-1 rounded-md text-xs",
                      "border border-border/50",
                      "hover:bg-accent hover:border-border",
                      "transition-all duration-150",
                      addSource.isPending && "opacity-50 cursor-not-allowed"
                    )}
                  >
                    <Icon weight="duotone" className="h-3 w-3 text-orange-500" />
                    <span className="text-muted-foreground">{source.title}</span>
                  </button>
                );
              })}
              {availableSources.length === 0 && (
                <span className="text-xs text-muted-foreground">Loading...</span>
              )}
            </div>

            {hasMoreSources && (
              <button
                onClick={() => setShowSources(true)}
                className="text-xs text-primary hover:text-primary/80 hover:underline transition-colors"
              >
                more...
              </button>
            )}
          </div>

          {/* 3. Ask Hands */}
          <div
            ref={askHandsRef}
            className={cn(
              "flex flex-col items-center justify-center gap-3 p-6 rounded-xl",
              "bg-gradient-to-b from-muted/30 to-muted/10",
              "border border-border/50"
            )}
          >
            <ChatCircle
              weight="duotone"
              className="h-8 w-8 text-foreground/50"
            />
            <div className="text-center">
              <div className="text-sm font-medium text-foreground">
                Ask Hands
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                "Get me some sample data"
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Hand-drawn arrow pointing to chat bar - only show if there's enough vertical space */}
      {arrowCoords && (arrowCoords.endY - arrowCoords.startY) > 5 && (
        <HandDrawnArrow
          startX={arrowCoords.startX}
          startY={arrowCoords.startY}
          endX={arrowCoords.endX}
          endY={arrowCoords.endY}
        />
      )}

      {/* Sources Library Dialog */}
      <Dialog open={showSources} onOpenChange={setShowSources}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add a source</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2 py-4">
            {availableSources.map((source) => {
              const Icon = getSourceIcon(source.name);
              return (
                <button
                  key={source.name}
                  onClick={() => handleAddSource(source)}
                  disabled={addSource.isPending}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-lg text-left",
                    "border border-border/50",
                    "hover:bg-accent hover:border-border",
                    "transition-all duration-150",
                    addSource.isPending && "opacity-50 cursor-not-allowed"
                  )}
                >
                  <div className="p-2 rounded-md bg-muted/50">
                    <Icon weight="duotone" className="h-4 w-4 text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {source.title}
                    </div>
                    <div className="text-xs text-muted-foreground line-clamp-1">
                      {source.description}
                    </div>
                  </div>
                  <Plus weight="bold" className="h-4 w-4 text-muted-foreground" />
                </button>
              );
            })}
            {availableSources.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No sources available
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
