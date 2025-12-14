/**
 * Block Menu - Dropdown menu for block operations
 * Appears when clicking the drag handle
 */

import { BlockSelectionPlugin } from "@platejs/selection/react";
import { Copy, GripVertical, Trash2 } from "lucide-react";
import type { TElement } from "platejs";
import { type PlateEditor, useEditorRef } from "platejs/react";
import * as React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "../../lib/utils";

// ============================================================================
// Types
// ============================================================================

interface BlockMenuProps {
  element: TElement;
  onDelete?: () => void;
  onDuplicate?: () => void;
  className?: string;
  /** Optional custom trigger - if provided, replaces the default grip button */
  children?: React.ReactNode;
}

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "destructive";
}

// ============================================================================
// Menu Item
// ============================================================================

function MenuItem({ icon, label, onClick, variant = "default" }: MenuItemProps) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-sm",
        "hover:bg-muted transition-colors rounded-sm",
        variant === "destructive" && "text-red-500 hover:bg-red-500/10",
      )}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ============================================================================
// Block Menu
// ============================================================================

export function BlockMenu({ element, onDelete, onDuplicate, className, children }: BlockMenuProps) {
  const editor = useEditorRef();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  const handleDelete = useCallback(() => {
    if (onDelete) {
      onDelete();
    } else {
      const path = editor.api.findPath(element);
      if (path) {
        editor.tf.removeNodes({ at: path });
      }
    }
    setIsOpen(false);
  }, [editor, element, onDelete]);

  const handleDuplicate = useCallback(() => {
    if (onDuplicate) {
      onDuplicate();
    } else {
      const path = editor.api.findPath(element);
      if (path) {
        // Clone the element and insert after
        const clone = JSON.parse(JSON.stringify(element));
        delete clone.id; // Remove id so Plate generates a new one
        editor.tf.insertNodes(clone, { at: [...path.slice(0, -1), path[path.length - 1] + 1] });
      }
    }
    setIsOpen(false);
  }, [editor, element, onDuplicate]);

  const handleTriggerClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen);
  }, [isOpen]);

  return (
    <div className={cn("relative", className)}>
      {/* Trigger - either custom children or default button */}
      <div ref={triggerRef} onClick={handleTriggerClick}>
        {children ?? (
          <button
            type="button"
            className={cn(
              "p-1 rounded hover:bg-muted cursor-grab active:cursor-grabbing",
              "text-muted-foreground hover:text-foreground transition-colors",
              isOpen && "bg-muted text-foreground",
            )}
            onMouseDown={(e) => {
              // Prevent text selection during drag
              e.preventDefault();
            }}
          >
            <GripVertical className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div
          ref={menuRef}
          className={cn(
            "absolute left-0 top-full mt-1 z-50",
            "min-w-[140px] py-1",
            "bg-popover border border-border rounded-md shadow-md",
            "animate-in fade-in-0 zoom-in-95",
          )}
        >
          <MenuItem
            icon={<Copy className="w-4 h-4" />}
            label="Duplicate"
            onClick={handleDuplicate}
          />
          <MenuItem
            icon={<Trash2 className="w-4 h-4" />}
            label="Delete"
            onClick={handleDelete}
            variant="destructive"
          />
        </div>
      )}
    </div>
  );
}
