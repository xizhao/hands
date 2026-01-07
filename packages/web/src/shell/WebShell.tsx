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

import { Topbar, cn, useResizable } from "@hands/app";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { HandsLogo } from "../components/icons";
import { useNavigate } from "@tanstack/react-router";

interface WebShellProps {
  /** Docked sidebar content (always visible, resizable) */
  sidebar: ReactNode;
  /** Floating sidebar content (slides in on hover, overlays) */
  floatingSidebar?: ReactNode;
  /** Left-aligned content for topbar (after logo) */
  topbarLeft?: ReactNode;
  /** Center content for topbar */
  topbarCenter?: ReactNode;
  /** Right side actions for topbar */
  topbarActions?: ReactNode;
  /** Main content */
  children: ReactNode;
  /** Initial docked sidebar width */
  sidebarWidth?: number;
  /** Whether we're in a workbook (hides logo text) */
  inWorkbook?: boolean;
}

export function WebShell({
  sidebar,
  floatingSidebar,
  topbarLeft,
  topbarCenter,
  topbarActions,
  children,
  sidebarWidth: initialWidth = 340,
  inWorkbook = false,
}: WebShellProps) {
  const navigate = useNavigate();

  // Docked sidebar resize
  const { width, isResizing, handleResizeStart } = useResizable({
    initialWidth,
  });

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

  const logo = (
    <button
      onClick={() => navigate({ to: "/" })}
      onMouseEnter={floatingSidebar ? () => setIsFloatingHovered(true) : undefined}
      className="flex items-center gap-2 text-foreground hover:text-foreground/80 transition-colors"
    >
      <HandsLogo className="w-5 h-5" />
      {!inWorkbook && <span className="font-semibold text-sm">Hands</span>}
    </button>
  );

  return (
    <div className="h-screen flex flex-col bg-surface overflow-hidden">
      {/* Global topbar */}
      <Topbar logo={logo} left={topbarLeft} center={topbarCenter} actions={topbarActions} />

      {/* Sidebar(s) + Content */}
      <div className="flex-1 min-h-0 overflow-hidden flex relative">
        {/* Floating sidebar (workbook switcher) - overlay */}
        {floatingSidebar && (
          <>
            {/* Hover trigger zone */}
            <div
              className="absolute top-0 left-0 bottom-0 w-2 z-50"
              onMouseEnter={() => setIsFloatingHovered(true)}
            />

            {/* Floating panel */}
            <div
              ref={floatingSidebarRef}
              className={cn(
                "absolute top-2 bottom-2 left-2 z-40 w-[300px]",
                "flex flex-col",
                "rounded-xl border border-border/60 bg-surface",
                "shadow-xl shadow-black/10 dark:shadow-black/30",
                "transition-transform duration-200 ease-out",
                !floatingVisible && "-translate-x-[calc(100%+16px)]"
              )}
              onMouseEnter={() => setIsFloatingHovered(true)}
              onMouseLeave={() => setIsFloatingHovered(false)}
            >
              {floatingSidebar}
            </div>
          </>
        )}

        {/* Docked sidebar - only render if sidebar content provided */}
        {sidebar && (
          <div
            style={{ width }}
            className="shrink-0 flex flex-col h-full relative"
          >
            {sidebar}

            {/* Resize handle */}
            <div
              onMouseDown={handleResizeStart}
              className={cn(
                "absolute top-0 bottom-0 right-0 w-1 cursor-col-resize z-10",
                "hover:bg-primary/20 active:bg-primary/30",
                isResizing && "bg-primary/30"
              )}
            />
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 min-w-0 h-full overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
