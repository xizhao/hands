"use client";

/**
 * Fixed toolbar buttons for the editor.
 *
 * This toolbar contains block-level and insert controls only.
 * Text formatting (bold, italic, colors, etc.) is in the floating selection toolbar.
 */

import {
  Code,
  CursorClick,
  DotsThree,
  Lightbulb,
  Lightning,
  List,
  ListNumbers,
  Quotes,
  Square,
  Table,
} from "@phosphor-icons/react";
import { insertCallout } from "@platejs/callout";
import { insertTable } from "@platejs/table";
import { KEYS } from "platejs";
import { useEditorReadOnly, useEditorRef, useSelectionFragmentProp } from "platejs/react";
import { useCallback } from "react";

import {
  createLiveValueElement,
  createLiveActionElement,
  createButtonElement,
} from "@hands/core/stdlib";

import { cn } from "../lib/utils";
import { getBlockType, setBlockType } from "../transforms";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "./dropdown-menu";
import { PageSyncStatus } from "./page-sync-status";
import { ToolbarButton, ToolbarGroup } from "./toolbar";
import { TurnIntoToolbarButton } from "./turn-into-toolbar-button";

// ============================================================================
// Block Type Button (for lists, quotes, etc.)
// ============================================================================

interface BlockTypeButtonProps {
  type: string;
  icon: React.ReactNode;
  tooltip: string;
}

function BlockTypeButton({ type, icon, tooltip }: BlockTypeButtonProps) {
  const editor = useEditorRef();

  const currentType = useSelectionFragmentProp({
    defaultValue: KEYS.p,
    getProp: (node) => getBlockType(node as any),
  });

  const isActive = currentType === type;

  const handleClick = useCallback(() => {
    setBlockType(editor, isActive ? KEYS.p : type);
    editor.tf.focus();
  }, [editor, type, isActive]);

  return (
    <button
      type="button"
      onClick={handleClick}
      title={tooltip}
      data-state={isActive ? "on" : "off"}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded text-foreground/80 transition-all duration-100",
        "hover:bg-accent hover:text-accent-foreground",
        isActive && "bg-accent text-accent-foreground",
      )}
    >
      {icon}
    </button>
  );
}

// ============================================================================
// Insert Buttons
// ============================================================================

function InsertTableButton() {
  const editor = useEditorRef();

  const handleClick = useCallback(() => {
    insertTable(editor, { rowCount: 3, colCount: 3 }, { select: true });
    editor.tf.focus();
  }, [editor]);

  return (
    <ToolbarButton onClick={handleClick} tooltip="Insert table">
      <Table size={16} />
    </ToolbarButton>
  );
}

function InsertCalloutButton() {
  const editor = useEditorRef();

  const handleClick = useCallback(() => {
    insertCallout(editor, { select: true });
    editor.tf.focus();
  }, [editor]);

  return (
    <ToolbarButton onClick={handleClick} tooltip="Insert callout">
      <Lightbulb size={16} />
    </ToolbarButton>
  );
}

function InsertLiveValueButton() {
  const editor = useEditorRef();

  const handleClick = useCallback(() => {
    const element = createLiveValueElement("SELECT 'Hello' AS message");
    editor.tf.insertNodes(element);
    editor.tf.focus();
  }, [editor]);

  return (
    <ToolbarButton onClick={handleClick} tooltip="Insert LiveValue query">
      <Lightning size={16} weight="fill" className="text-violet-500" />
    </ToolbarButton>
  );
}

function InsertLiveActionButton() {
  const editor = useEditorRef();

  const handleClick = useCallback(() => {
    // Create a LiveAction with a Button child
    const button = createButtonElement("Click me");
    const element = createLiveActionElement(
      "-- UPDATE table SET column = value WHERE id = 1"
    );
    // Add the button as a child
    (element as any).children = [{ type: "p", children: [button] }];
    editor.tf.insertNodes(element);
    editor.tf.focus();
  }, [editor]);

  return (
    <ToolbarButton onClick={handleClick} tooltip="Insert LiveAction (interactive button)">
      <CursorClick size={16} className="text-amber-500" />
    </ToolbarButton>
  );
}

// ============================================================================
// More Dropdown (for collapsed toolbar items)
// ============================================================================

function MoreDropdown() {
  const editor = useEditorRef();

  const currentType = useSelectionFragmentProp({
    defaultValue: KEYS.p,
    getProp: (node) => getBlockType(node as any),
  });

  const handleSetBlockType = useCallback((type: string) => {
    const isActive = currentType === type;
    setBlockType(editor, isActive ? KEYS.p : type);
    editor.tf.focus();
  }, [editor, currentType]);

  const handleInsertTable = useCallback(() => {
    insertTable(editor, { rowCount: 3, colCount: 3 }, { select: true });
    editor.tf.focus();
  }, [editor]);

  const handleInsertCallout = useCallback(() => {
    insertCallout(editor, { select: true });
    editor.tf.focus();
  }, [editor]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ToolbarButton tooltip="More options">
          <DotsThree size={16} weight="bold" />
        </ToolbarButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" portal>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Lists</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => handleSetBlockType(KEYS.ul)}>
            <List size={16} />
            <span>Bulleted List</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handleSetBlockType(KEYS.ol)}>
            <ListNumbers size={16} />
            <span>Numbered List</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handleSetBlockType(KEYS.listTodo)}>
            <Square size={16} />
            <span>To-do List</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuGroup>
          <DropdownMenuLabel>Blocks</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => handleSetBlockType(KEYS.blockquote)}>
            <Quotes size={16} />
            <span>Quote</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handleSetBlockType(KEYS.codeBlock)}>
            <Code size={16} weight="bold" />
            <span>Code Block</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuGroup>
          <DropdownMenuLabel>Insert</DropdownMenuLabel>
          <DropdownMenuItem onSelect={handleInsertTable}>
            <Table size={16} />
            <span>Table</span>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleInsertCallout}>
            <Lightbulb size={16} />
            <span>Callout</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ============================================================================
// Fixed Toolbar Buttons
// ============================================================================

export function FixedToolbarButtons() {
  const readOnly = useEditorReadOnly();

  if (readOnly) {
    return null;
  }

  return (
    <div className="flex items-center">
      {/* Block Type Switcher - always visible */}
      <ToolbarGroup>
        <TurnIntoToolbarButton />
      </ToolbarGroup>

      {/* Lists - hidden on small screens */}
      <div className="hidden sm:block">
        <ToolbarGroup>
          <BlockTypeButton
            type={KEYS.ul}
            icon={<List size={16} />}
            tooltip="Bulleted List"
          />
          <BlockTypeButton
            type={KEYS.ol}
            icon={<ListNumbers size={16} />}
            tooltip="Numbered List"
          />
          <BlockTypeButton
            type={KEYS.listTodo}
            icon={<Square size={16} />}
            tooltip="To-do List"
          />
        </ToolbarGroup>
      </div>

      {/* Block Formatting - hidden on small screens */}
      <div className="hidden md:block">
        <ToolbarGroup>
          <BlockTypeButton
            type={KEYS.blockquote}
            icon={<Quotes size={16} />}
            tooltip="Quote"
          />
          <BlockTypeButton
            type={KEYS.codeBlock}
            icon={<Code size={16} weight="bold" />}
            tooltip="Code Block"
          />
        </ToolbarGroup>
      </div>

      {/* Insert Elements - hidden on medium and below */}
      <div className="hidden lg:block">
        <ToolbarGroup>
          <InsertTableButton />
          <InsertCalloutButton />
        </ToolbarGroup>
      </div>

      {/* Live Data - always visible (app-specific) */}
      <ToolbarGroup>
        <InsertLiveValueButton />
        <InsertLiveActionButton />
      </ToolbarGroup>

      {/* More dropdown - visible on smaller screens */}
      <div className="lg:hidden">
        <ToolbarGroup>
          <MoreDropdown />
        </ToolbarGroup>
      </div>

      {/* Spacer to push sync status to the right */}
      <div className="flex-1" />

      {/* Page sync status - always visible on the right */}
      <PageSyncStatus />
    </div>
  );
}
