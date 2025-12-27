"use client";

import { useState, useRef, useEffect } from "react";
import type { CollabUser, UserPresence } from "../types";

interface LogoWidgetProps {
  user: CollabUser | null;
  otherUsers: UserPresence[];
  pageMetadata?: {
    title?: string;
    description?: string;
    author?: string;
    date?: string;
    [key: string]: string | undefined;
  };
}

/** Hands Logo - hand outline, uses currentColor */
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

export function LogoWidget({ user, otherUsers, pageMetadata }: LogoWidgetProps) {
  const [showMetadata, setShowMetadata] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const metadataTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const allUsers = user ? [{ user, cursor: null }, ...otherUsers] : otherUsers;
  const displayUsers = allUsers.slice(0, 4);
  const extraCount = allUsers.length - 4;

  const handleLogoEnter = () => {
    if (metadataTimeoutRef.current) clearTimeout(metadataTimeoutRef.current);
    setShowMetadata(true);
  };

  const handleLogoLeave = () => {
    metadataTimeoutRef.current = setTimeout(() => setShowMetadata(false), 150);
  };

  useEffect(() => {
    return () => {
      if (metadataTimeoutRef.current) clearTimeout(metadataTimeoutRef.current);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="fixed top-4 right-4 z-40"
      style={{ pointerEvents: 'auto' }}
    >
      {/* Premium dark toolbar */}
      <div
        className="relative flex items-center bg-neutral-900 border border-neutral-800/50 rounded-xl shadow-lg shadow-black/25"
      >
        {/* Left: Overlapping avatars with tooltips */}
        {allUsers.length > 0 && (
          <div className="flex items-center h-12 px-2">
            <div className="flex -space-x-1.5">
              {displayUsers.map((p, i) => (
                <div
                  key={p.user.id}
                  className="group relative w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-semibold text-white ring-[1.5px] ring-neutral-900"
                  style={{
                    backgroundColor: p.user.color,
                    zIndex: displayUsers.length - i,
                  }}
                >
                  {p.user.name.split(" ").map(n => n[0]).join("")}
                  {/* Centered tooltip above */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-neutral-800 text-[10px] text-white rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    {p.user.name}{p.user.id === user?.id ? " (you)" : ""}
                  </div>
                </div>
              ))}
              {extraCount > 0 && (
                <div
                  className="group relative w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-semibold text-neutral-300 bg-neutral-700 ring-[1.5px] ring-neutral-900"
                  style={{ zIndex: 0 }}
                >
                  +{extraCount}
                  {/* Tooltip for extra count */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-neutral-800 text-[10px] text-white rounded shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                    {extraCount} more viewer{extraCount !== 1 ? "s" : ""}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Separator */}
        {allUsers.length > 0 && (
          <div className="w-px h-6 bg-neutral-700/40" />
        )}

        {/* Right: Hands logo - hover shows metadata */}
        <div
          className="relative"
          onMouseEnter={handleLogoEnter}
          onMouseLeave={handleLogoLeave}
        >
          <a
            href="https://hands.app"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-12 h-12 text-white hover:text-neutral-200 transition-colors"
          >
            <HandsLogo size={24} />
          </a>

          {/* Metadata dropdown - opens to the left */}
          <div
            className={`
              absolute top-full right-0 mt-1.5 w-52 bg-neutral-900 border border-neutral-800/50 rounded-lg shadow-xl shadow-black/30 overflow-hidden
              transition-all duration-150 ease-out origin-top-right
              ${showMetadata ? "opacity-100 scale-100" : "opacity-0 scale-95 pointer-events-none"}
            `}
          >
            <div className="px-3 py-2 space-y-1.5">
              {pageMetadata?.title && (
                <div className="flex items-baseline gap-2">
                  <span className="text-[9px] uppercase tracking-wider text-neutral-500 w-12 flex-shrink-0">Title</span>
                  <span className="text-[11px] text-white font-medium truncate">{pageMetadata.title}</span>
                </div>
              )}
              {pageMetadata?.description && (
                <div className="flex items-baseline gap-2">
                  <span className="text-[9px] uppercase tracking-wider text-neutral-500 w-12 flex-shrink-0">Desc</span>
                  <span className="text-[11px] text-neutral-300 line-clamp-2">{pageMetadata.description}</span>
                </div>
              )}
              {pageMetadata?.author && (
                <div className="flex items-baseline gap-2">
                  <span className="text-[9px] uppercase tracking-wider text-neutral-500 w-12 flex-shrink-0">Author</span>
                  <span className="text-[11px] text-neutral-300">{pageMetadata.author}</span>
                </div>
              )}
              {pageMetadata?.date && (
                <div className="flex items-baseline gap-2">
                  <span className="text-[9px] uppercase tracking-wider text-neutral-500 w-12 flex-shrink-0">Date</span>
                  <span className="text-[11px] text-neutral-300">{pageMetadata.date}</span>
                </div>
              )}
              {!pageMetadata?.title && !pageMetadata?.description && (
                <div className="text-[11px] text-neutral-500 text-center py-1">
                  No page metadata
                </div>
              )}
              {/* Footer link */}
              <div className="pt-1.5 border-t border-neutral-800/50">
                <a
                  href="https://hands.app"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1 py-0.5 text-[9px] text-neutral-500 hover:text-neutral-300 transition-colors"
                >
                  Built with Hands
                  <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M7 17L17 7M17 7H7M17 7v10" />
                  </svg>
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
