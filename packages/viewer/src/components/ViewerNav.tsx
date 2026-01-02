"use client";

import { useRef, useState } from "react";

interface NavPage {
  id: string;
  path: string;
  title: string;
}

interface ViewerNavProps {
  pages: NavPage[];
  workbookId: string;
  currentPath: string;
}

/** Hands Logo - hand outline */
function HandsLogo({ size = 20 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
      <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  );
}

export function ViewerNav({ pages, workbookId, currentPath }: ViewerNavProps) {
  const workbookRoot = `/${workbookId}`;
  const pageCount = pages.length;
  const [isOpen, setIsOpen] = useState(false);
  const closeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = () => {
    if (closeTimeout.current) {
      clearTimeout(closeTimeout.current);
      closeTimeout.current = null;
    }
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    // Small delay to prevent flicker when moving between elements
    closeTimeout.current = setTimeout(() => setIsOpen(false), 75);
  };

  return (
    <div
      className="fixed top-5 left-3 z-50"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Logo + ToC bars - always visible */}
      <div
        className="flex flex-col items-center gap-3"
        style={{
          opacity: isOpen ? 0 : 1,
          transition: "opacity 150ms cubic-bezier(0.4, 0, 0.2, 1)",
          pointerEvents: isOpen ? "none" : "auto",
        }}
      >
        {/* Logo - links to workbook root */}
        <a
          href={workbookRoot}
          className="
            flex items-center justify-center
            w-10 h-10
            bg-neutral-900 text-white border border-neutral-800/50
            rounded-xl
            shadow-lg shadow-black/25
            hover:bg-neutral-800
            transition-colors
          "
        >
          <HandsLogo size={20} />
        </a>

        {/* ToC-style depth bars */}
        <div className="flex flex-col items-center gap-1.5 pt-1">
          {pages.slice(0, 12).map((page, i) => {
            const pageRoute = `/${workbookId}${page.path}`;
            const isActive = page.path === currentPath || pageRoute === currentPath;
            return (
              <a
                key={page.id}
                href={pageRoute}
                className={`
                  h-[3px] rounded-full transition-all cursor-pointer
                  ${isActive
                    ? "bg-blue-400 w-6"
                    : "bg-neutral-600 hover:bg-neutral-400"
                  }
                `}
                style={{
                  width: isActive ? undefined : `${16 - Math.min(i, 4) * 2}px`,
                }}
              />
            );
          })}
          {pageCount > 12 && (
            <span className="text-[8px] text-neutral-500 mt-0.5">+{pageCount - 12}</span>
          )}
        </div>
      </div>

      {/* Slide-in nav panel - offset to extend toward screen edge */}
      <div
        className="
          absolute -top-3 -left-3
          w-56
          bg-neutral-900 border border-neutral-800/50
          rounded-xl
          shadow-xl shadow-black/30
        "
        style={{
          transform: isOpen ? "translateX(0)" : "translateX(-100%)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "transform 200ms cubic-bezier(0.32, 0.72, 0, 1), opacity 150ms cubic-bezier(0.4, 0, 0.2, 1)",
          willChange: "transform, opacity",
        }}
      >
        {/* Header with logo - pt-3 pl-3 compensates for panel's negative offset */}
        <div className="flex items-center gap-2.5 pt-3 pl-3 pb-2 border-b border-neutral-800/50">
          <a
            href={workbookRoot}
            className="
              flex items-center justify-center
              w-10 h-10
              bg-neutral-800 text-white
              rounded-xl
              hover:bg-neutral-700
              transition-colors
              shrink-0
            "
          >
            <HandsLogo size={20} />
          </a>
          <span className="text-xs font-medium text-white truncate pr-2">
            {workbookId}
          </span>
        </div>

        {/* Nav items */}
        <nav className="px-3 py-1.5 max-h-72 overflow-auto">
          {pages.map((page) => {
            const pageRoute = `/${workbookId}${page.path}`;
            const isActive = page.path === currentPath || pageRoute === currentPath;

            return (
              <a
                key={page.id}
                href={pageRoute}
                className={`
                  block px-2.5 py-1.5 rounded-lg text-xs truncate transition-colors
                  ${isActive
                    ? "bg-blue-500/20 text-blue-400 font-medium"
                    : "text-neutral-400 hover:text-white hover:bg-white/5"
                  }
                `}
              >
                {page.title}
              </a>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="px-3 py-2 border-t border-neutral-800/50">
          <a
            href="https://hands.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1 text-[9px] text-neutral-500 hover:text-neutral-300 transition-colors"
          >
            Built with Hands
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M7 17L17 7M17 7H7M17 7v10" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}

/** Mount the viewer nav - called from client.tsx */
export function mountViewerNav(config: { pages: NavPage[]; workbookId: string; currentPath: string }) {
  const container = document.createElement("div");
  container.id = "viewer-nav";
  document.body.appendChild(container);

  // Dynamic import React to avoid SSR issues
  import("react-dom/client").then(({ createRoot }) => {
    const root = createRoot(container);
    root.render(
      <ViewerNav
        pages={config.pages}
        workbookId={config.workbookId}
        currentPath={config.currentPath}
      />
    );
  });
}
