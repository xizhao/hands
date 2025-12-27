"use client";

import type { UserPresence } from "../types";

interface CursorsOverlayProps {
  users: UserPresence[];
}

export function CursorsOverlay({ users }: CursorsOverlayProps) {
  if (users.length === 0) return null;

  // Cursors use pageX/pageY (document-relative coordinates)
  // Position overlay at document origin with absolute positioning
  return (
    <div
      className="pointer-events-none z-[9999]"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '1px', // Minimal height, cursors position absolutely
        overflow: 'visible',
      }}
    >
      {users.map((presence) => (
        <Cursor key={presence.user.id} presence={presence} />
      ))}
    </div>
  );
}

function Cursor({ presence }: { presence: UserPresence }) {
  if (!presence.cursor) return null;

  // x, y are absolute pixel positions on the document
  const { x, y } = presence.cursor;
  const { name, color } = presence.user;
  const initials = name.split(" ").map(n => n[0]).join("");

  return (
    <div
      className="absolute transition-all duration-75 ease-out"
      style={{
        left: x,
        top: y,
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
