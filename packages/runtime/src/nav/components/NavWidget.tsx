"use client";

import type { NavConfig } from "../types";

interface NavWidgetProps {
  config: NavConfig;
}

/** Hands Logo - hand outline */
function HandsLogo({ size = 16, className }: { size?: number; className?: string }) {
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
      className={className}
    >
      <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2" />
      <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  );
}

export function NavWidget({ config }: NavWidgetProps) {
  const pageCount = config.pages.length;

  return (
    <div
      className="fixed top-0 left-0 z-40"
      style={{ pointerEvents: "auto" }}
    >
      {/* Gutter with logo + TOC bars - popover appears on hover */}
      <div
        className="
          group absolute top-6 left-2
          flex flex-col items-center gap-3
        "
      >
        {/* Logo - links to home */}
        <a
          href="/"
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

        {/* TOC-style depth bars - like toc-sidebar.tsx */}
        <div className="flex flex-col items-center gap-1.5 pt-1">
          {config.pages.slice(0, 12).map((page, i) => {
            const isActive = page.route === config.currentRoute;
            return (
              <a
                key={page.route}
                href={page.route}
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

        {/* Expanded popover on hover - like toc-sidebar.tsx */}
        <nav
          className="
            absolute top-12 left-0 z-50
            transition-all duration-200
            pointer-events-none opacity-0
            group-hover:pointer-events-auto group-hover:opacity-100
          "
        >
          <div className="
            w-48 max-h-80 overflow-auto
            bg-neutral-900 border border-neutral-800/50
            rounded-xl shadow-xl shadow-black/30
            p-2
          ">
            {config.pages.map((page) => {
              const isActive = page.route === config.currentRoute;
              return (
                <a
                  key={page.route}
                  href={page.route}
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

            {/* Footer */}
            <div className="mt-2 pt-2 border-t border-neutral-800/50">
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
        </nav>
      </div>
    </div>
  );
}
