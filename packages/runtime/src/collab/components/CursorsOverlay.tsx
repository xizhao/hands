"use client";

import { useEffect, useState } from "react";
import type { UserPresence } from "../types";

interface CursorsOverlayProps {
  users: UserPresence[];
}

export function CursorsOverlay({ users }: CursorsOverlayProps) {
  const [scroll, setScroll] = useState({ x: 0, y: 0 });
  const [docSize, setDocSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateScroll = () => {
      setScroll({ x: window.scrollX, y: window.scrollY });
    };

    const updateSize = () => {
      setDocSize({
        width: Math.max(document.documentElement.scrollWidth, window.innerWidth),
        height: Math.max(document.documentElement.scrollHeight, window.innerHeight),
      });
    };

    updateScroll();
    updateSize();

    window.addEventListener("scroll", updateScroll);
    window.addEventListener("resize", updateSize);

    const observer = new ResizeObserver(updateSize);
    observer.observe(document.body);

    return () => {
      window.removeEventListener("scroll", updateScroll);
      window.removeEventListener("resize", updateSize);
      observer.disconnect();
    };
  }, []);

  if (users.length === 0 || docSize.width === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-visible">
      {users.map((presence) => (
        <Cursor key={presence.user.id} presence={presence} scroll={scroll} docSize={docSize} />
      ))}
    </div>
  );
}

function Cursor({
  presence,
  scroll,
  docSize
}: {
  presence: UserPresence;
  scroll: { x: number; y: number };
  docSize: { width: number; height: number };
}) {
  if (!presence.cursor) return null;

  const { x, y } = presence.cursor;
  const { name, color } = presence.user;
  const initials = name.split(" ").map(n => n[0]).join("");

  // Convert percentage to pixels, then subtract scroll to get viewport position
  const pixelX = (x / 100) * docSize.width - scroll.x;
  const pixelY = (y / 100) * docSize.height - scroll.y;

  return (
    <div
      className="absolute transition-all duration-75 ease-out"
      style={{
        left: pixelX,
        top: pixelY,
        transform: "translate(-1px, -1px)",
      }}
    >
      {/* Cursor pointer */}
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        className="drop-shadow-md"
      >
        <path
          d="M1 1v14l4.5-4.5H14L1 1z"
          fill={color}
          stroke="white"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>

      {/* Name tag */}
      <div
        className="absolute left-3 top-3 flex items-center gap-1 pl-1 pr-1.5 py-0.5 rounded-full shadow-md"
        style={{ backgroundColor: color }}
      >
        <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[8px] font-bold text-white">
          {initials}
        </span>
        <span className="text-[10px] font-medium text-white whitespace-nowrap">
          {name}
        </span>
      </div>
    </div>
  );
}
