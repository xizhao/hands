/**
 * WebShell - Global shell with topbar + sidebars
 *
 * Landing layout:
 * ┌─────────────────────────────────────┐
 * │            Topbar                   │
 * ├──────────┬──────────────────────────┤
 * │ Docked   │                          │
 * │ sidebar  │      Content             │
 * │          │                          │
 * └──────────┴──────────────────────────┘
 *
 * Workbook layout (2 sidebars):
 * ┌─────────────────────────────────────────────┐
 * │                 Topbar                      │
 * ├─────────┬──────────┬────────────────────────┤
 * │ FLOAT   │ DOCKED   │                        │
 * │ workbook│ chat     │      Content           │
 * │ switcher│          │                        │
 * │ (hover) │   ↔      │                        │
 * └─────────┴──────────┴────────────────────────┘
 */

// Use lightweight imports to avoid pulling in heavy @hands/app deps
import { Topbar, cn, useResizable } from "@hands/app/light";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { HandsLogo } from "../components/icons";
import { useNavigate } from "@tanstack/react-router";
import { Sidebar, ChatCircle, FileText, List } from "@phosphor-icons/react";

/** Hook to detect mobile breakpoint */
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  return isMobile;
}

interface WebShellProps {
  /** Docked sidebar content (always visible, resizable) */
  sidebar?: ReactNode;
  /** Floating sidebar content (slides in on hover, overlays) */
  floatingSidebar?: ReactNode;
  /** Left-aligned content for topbar (after logo) */
  topbarLeft?: ReactNode;
  /** Center content for topbar */
  topbarCenter?: ReactNode;
  /** Right side actions for topbar */
  topbarActions?: ReactNode;
  /**
   * Header content shown above main content area (e.g., tabs).
   * This is separate from the global topbar - it appears below topbar,
   * inside the content area.
   */
  contentHeader?: ReactNode;
  /** Main content */
  children: ReactNode;
  /** Initial docked sidebar width */
  sidebarWidth?: number;
  /** Whether we're in a workbook (hides logo text) */
  inWorkbook?: boolean;
  /** Show collapse toggle for docked sidebar */
  sidebarCollapsible?: boolean;
  /** Mobile: auto-open content drawer (e.g., when agent writes page) */
  openContentDrawer?: boolean;
}

export function WebShell({
  sidebar,
  floatingSidebar,
  topbarLeft,
  topbarCenter,
  topbarActions,
  contentHeader,
  children,
  sidebarWidth: initialWidth = 200,  // Start at min width
  inWorkbook = false,
  sidebarCollapsible = false,
  openContentDrawer = false,
}: WebShellProps) {
  const navigate = useNavigate();
  const isMobile = useIsMobile();

  // Mobile: drawer state for content (chat is default view)
  const [contentDrawerOpen, setContentDrawerOpen] = useState(false);

  // Auto-open drawer when requested (e.g., page written)
  useEffect(() => {
    if (isMobile && openContentDrawer) {
      setContentDrawerOpen(true);
    }
  }, [isMobile, openContentDrawer]);

  // Mobile: drawer drag state
  const [drawerDragStart, setDrawerDragStart] = useState<number | null>(null);
  const [drawerDragOffset, setDrawerDragOffset] = useState(0);

  // Mobile: drawer state for workbook switcher
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Drawer touch handlers
  const handleDrawerTouchStart = (e: React.TouchEvent) => {
    setDrawerDragStart(e.touches[0].clientY);
  };

  const handleDrawerTouchMove = (e: React.TouchEvent) => {
    if (drawerDragStart === null) return;
    const currentY = e.touches[0].clientY;
    const offset = currentY - drawerDragStart;

    // Allow natural dragging in both directions with resistance at limits
    if (contentDrawerOpen) {
      // When open, allow dragging down (positive offset) or slight pull up with resistance
      setDrawerDragOffset(offset > 0 ? offset : offset * 0.3);
    } else {
      // When closed, allow dragging up (negative offset) or slight pull down with resistance
      setDrawerDragOffset(offset < 0 ? offset : offset * 0.3);
    }
  };

  const handleDrawerTouchEnd = () => {
    if (drawerDragStart === null) return;

    // Threshold: 50px to trigger toggle
    const threshold = 50;
    if (Math.abs(drawerDragOffset) > threshold) {
      if (drawerDragOffset > 0) {
        // Dragged down - close
        setContentDrawerOpen(false);
      } else {
        // Dragged up - open
        setContentDrawerOpen(true);
      }
    }

    setDrawerDragStart(null);
    setDrawerDragOffset(0);
  };

  // Docked sidebar resize
  const { width, isResizing, handleResizeStart } = useResizable({
    initialWidth,
  });

  // Docked sidebar collapsed state (always start collapsed on mobile)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  // Update collapsed state when switching between mobile/desktop
  useEffect(() => {
    if (isMobile) {
      // Mobile: always collapsed (drawer pattern)
      setSidebarCollapsed(true);
    } else {
      // Desktop: always expanded
      setSidebarCollapsed(false);
    }
  }, [isMobile]);

  // Floating sidebar state
  const [isFloatingHovered, setIsFloatingHovered] = useState(false);
  const [hasFocusWithin, setHasFocusWithin] = useState(false);
  const floatingSidebarRef = useRef<HTMLDivElement>(null);

  // Focus tracking for floating sidebar (keep visible while interacting)
  useEffect(() => {
    if (!floatingSidebar) return;

    const checkFocus = () => {
      const hasFocus =
        floatingSidebarRef.current?.contains(document.activeElement) &&
        document.activeElement !== document.body;
      setHasFocusWithin(!!hasFocus);
    };

    document.addEventListener("focusin", checkFocus);
    document.addEventListener("focusout", checkFocus);

    return () => {
      document.removeEventListener("focusin", checkFocus);
      document.removeEventListener("focusout", checkFocus);
    };
  }, [floatingSidebar]);

  const floatingVisible = isFloatingHovered || hasFocusWithin;

  // On mobile, show hamburger menu for any sidebar (workbook switcher or landing sidebar)
  const logo = (
    <div className="flex items-center gap-2">
      {isMobile && (floatingSidebar || sidebar) && (
        <button
          onClick={() => {
            if (floatingSidebar) {
              setDrawerOpen(!drawerOpen);
            } else {
              setSidebarCollapsed(!sidebarCollapsed);
            }
          }}
          className="p-1 text-foreground hover:text-foreground/80 transition-colors md:hidden"
          aria-label="Open menu"
        >
          <List className="w-5 h-5" />
        </button>
      )}
      <button
        onClick={() => navigate({ to: "/" })}
        onMouseEnter={floatingSidebar && !isMobile ? () => setIsFloatingHovered(true) : undefined}
        className="flex items-center gap-2 text-foreground hover:text-foreground/80 transition-colors"
      >
        <HandsLogo className="w-5 h-5" />
        {!inWorkbook && <span className="font-semibold text-sm">Hands</span>}
      </button>
    </div>
  );

  return (
    <div className="h-screen flex flex-col bg-surface overflow-hidden">
      {/* Global topbar */}
      <Topbar logo={logo} left={topbarLeft} center={topbarCenter} actions={topbarActions} />

      {/* Sidebar(s) + Content */}
      <div className="flex-1 min-h-0 overflow-hidden flex relative">
        {/* Floating sidebar (workbook switcher) - overlay or drawer on mobile */}
        {floatingSidebar && (
          <>
            {!isMobile && (
              /* Desktop: Hover trigger zone */
              <div
                className="absolute top-0 left-0 bottom-0 w-2 z-50"
                onMouseEnter={() => setIsFloatingHovered(true)}
              />
            )}

            {/* Floating panel (desktop hover / mobile drawer) */}
            <div
              ref={floatingSidebarRef}
              className={cn(
                "absolute z-40 flex flex-col bg-surface",
                "shadow-xl shadow-black/10 dark:shadow-black/30",
                "transition-transform duration-200 ease-out",
                // Desktop: rounded panel at left edge
                "md:top-2 md:bottom-2 md:left-2 md:w-[240px] md:rounded-xl md:border md:border-border/60",
                // Mobile: full-height drawer from left
                "top-0 bottom-0 left-0 w-[280px] max-md:border-r max-md:border-border",
                // Show/hide based on state
                !isMobile && !floatingVisible && "-translate-x-[calc(100%+16px)]",
                isMobile && !drawerOpen && "-translate-x-full"
              )}
              onMouseEnter={!isMobile ? () => setIsFloatingHovered(true) : undefined}
              onMouseLeave={!isMobile ? () => setIsFloatingHovered(false) : undefined}
            >
              {floatingSidebar}
            </div>

            {/* Mobile: backdrop overlay */}
            {isMobile && drawerOpen && (
              <div
                className="absolute inset-0 bg-black/40 z-30 md:hidden"
                onClick={() => setDrawerOpen(false)}
              />
            )}
          </>
        )}

        {/* Docked sidebar - desktop only OR mobile landing with drawer */}
        {sidebar && (
          <>
            {!isMobile ? (
              /* Desktop: always docked */
              <div
                style={{ width: sidebarCollapsed ? 0 : width }}
                className={cn(
                  "shrink-0 flex flex-col h-full relative overflow-hidden",
                  "transition-[width] duration-200 ease-out"
                )}
              >
                <div style={{ width }} className="h-full flex flex-col">
                  {sidebar}
                </div>

                {/* Resize handle - only when not collapsed */}
                {!sidebarCollapsed && (
                  <div
                    onMouseDown={handleResizeStart}
                    className={cn(
                      "absolute top-0 bottom-0 right-0 w-1 cursor-col-resize z-10",
                      "hover:bg-primary/20 active:bg-primary/30",
                      isResizing && "bg-primary/30"
                    )}
                  />
                )}
              </div>
            ) : (
              /* Mobile: drawer overlay (landing page) */
              !inWorkbook && (
                <>
                  {/* Backdrop */}
                  {!sidebarCollapsed && (
                    <div
                      className="absolute inset-0 bg-black/40 z-30"
                      onClick={() => setSidebarCollapsed(true)}
                    />
                  )}

                  {/* Drawer */}
                  <div
                    className={cn(
                      "absolute top-0 bottom-0 left-0 z-40 w-[280px]",
                      "flex flex-col bg-surface border-r border-border",
                      "shadow-xl shadow-black/20",
                      "transition-transform duration-200 ease-out",
                      sidebarCollapsed && "-translate-x-full"
                    )}
                  >
                    {sidebar}
                  </div>
                </>
              )
            )}
          </>
        )}

        {/* Main content area */}
        <div className="flex-1 min-w-0 h-full overflow-hidden flex flex-col relative">
          {contentHeader ? (
            <>
              {/* Workbook layout */}
              {!isMobile ? (
                /* Desktop: styled content + bottom tabs */
                <>
                  <div className="flex-1 min-h-0 overflow-hidden pr-2 pl-1 pt-1">
                    <div className="h-full border border-border/40 border-b-0 bg-background overflow-hidden shadow-sm rounded-t-lg">
                      {children}
                    </div>
                  </div>
                  <div className="shrink-0 pr-2 pl-1 pb-1">
                    {contentHeader}
                  </div>
                </>
              ) : (
                /* Mobile: Chat default with swipeable content drawer */
                <>
                  {/* Chat (always visible on mobile) - reserve space for drawer peek */}
                  <div className="flex-1 min-h-0 overflow-hidden pb-16">
                    {sidebar}
                  </div>

                  {/* Content drawer - slides up from bottom */}
                  <div
                    className={cn(
                      "absolute inset-x-0 bottom-0 z-50",
                      "flex flex-col bg-background",
                      "border-t border-border rounded-t-3xl",
                      "shadow-2xl shadow-black/20",
                      "touch-none", // Prevent default touch behaviors during drag
                      drawerDragStart === null && "transition-transform duration-300 ease-out"
                    )}
                    style={{
                      height: contentDrawerOpen ? "85vh" : "64px",
                      transform: drawerDragStart !== null
                        ? `translateY(${drawerDragOffset}px)`
                        : contentDrawerOpen
                        ? "translateY(0)"
                        : "translateY(calc(100% - 64px))"
                    }}
                    onTouchStart={handleDrawerTouchStart}
                    onTouchMove={handleDrawerTouchMove}
                    onTouchEnd={handleDrawerTouchEnd}
                  >
                    {/* Drawer handle - only draggable here, not content */}
                    <div
                      className="flex flex-col items-center py-3 cursor-pointer active:bg-muted/50 shrink-0"
                      onClick={() => setContentDrawerOpen(!contentDrawerOpen)}
                    >
                      <div className="w-10 h-1 rounded-full bg-border/60 mb-2" />
                      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                        <FileText className="w-4 h-4" />
                        <span>{contentDrawerOpen ? "Hide" : "View"} Workbook</span>
                      </div>
                    </div>

                    {/* Content header (tabs) - show when drawer is open */}
                    {contentDrawerOpen && contentHeader && (
                      <div className="shrink-0 border-b border-border touch-auto">
                        {contentHeader}
                      </div>
                    )}

                    {/* Content area - prevent touch events from affecting drawer drag */}
                    <div
                      className="flex-1 min-h-0 overflow-hidden touch-auto"
                      onTouchStart={(e) => e.stopPropagation()}
                    >
                      {children}
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            /* Landing layout: pass-through content (no extra styling) */
            children
          )}

          {/* Sidebar collapse toggle - top left of content (desktop only) */}
          {sidebar && sidebarCollapsible && !isMobile && (
            <div
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className="absolute left-5 top-3 z-20 p-1 text-white/70 hover:text-white cursor-pointer transition-colors"
              title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
            >
              <Sidebar weight={sidebarCollapsed ? "fill" : "duotone"} className="w-4 h-4" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
