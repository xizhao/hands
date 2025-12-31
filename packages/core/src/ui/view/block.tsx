"use client";

/**
 * @component Block
 * @category view
 * @description Embeds reusable MDX blocks inline, or creates new ones with AI assistance.
 * Supports embedding from pages/blocks/, inline editing, and AI generation.
 * @keywords block, embed, include, component, reuse, template, ai
 * @example
 * <Block src="blocks/header" />
 * <Block src="blocks/user-card" params={{userId: 123}} />
 * <Block editing prompt="create a metrics card" />
 */

import {
  createPlatePlugin,
  PlateElement,
  type PlateElementProps,
  useElement,
  useReadOnly,
  useSelected,
} from "platejs/react";
import { createContext, memo, type ReactNode, useContext } from "react";

import { BLOCK_KEY, type TBlockElement } from "../../types";

// ============================================================================
// Block Context
// ============================================================================

const MAX_EMBED_DEPTH = 3;

interface BlockContextValue {
  /** Current embed depth (starts at 0) */
  depth: number;
  /** Parameters passed from parent blocks */
  params: Record<string, unknown>;
  /** Function to fetch and render block content */
  fetchBlockContent?: (src: string) => ReactNode;
}

const BlockContext = createContext<BlockContextValue>({
  depth: 0,
  params: {},
});

/**
 * Provider for block embedding context.
 * Wrap your editor with this to enable block embedding.
 */
export function BlockProvider({
  children,
  fetchBlockContent,
  params = {},
}: {
  children: ReactNode;
  fetchBlockContent?: (src: string) => ReactNode;
  params?: Record<string, unknown>;
}) {
  return (
    <BlockContext.Provider value={{ depth: 0, params, fetchBlockContent }}>
      {children}
    </BlockContext.Provider>
  );
}

/**
 * Hook to access current block params.
 * Use in embedded blocks to access params passed via `<Block params={{...}} />`
 */
export function useBlockParams(): Record<string, unknown> {
  return useContext(BlockContext).params;
}

// ============================================================================
// Display Components
// ============================================================================

interface BlockDisplayProps {
  src?: string;
  params?: Record<string, unknown>;
  editing?: boolean;
  prompt?: string;
  height?: number;
  className?: string;
}

function BlockDisplay({ src, params, editing, prompt, height, className }: BlockDisplayProps) {
  const ctx = useContext(BlockContext);

  // AI generation mode - show prompt UI
  if (prompt && !src) {
    return (
      <div
        className={`border border-dashed border-primary/50 rounded-lg p-4 bg-primary/5 ${className ?? ""}`}
        style={{ minHeight: height }}
      >
        <div className="flex items-center gap-2 text-sm text-primary">
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <span className="font-medium">Building with AI...</span>
        </div>
        <div className="mt-2 text-xs text-muted-foreground">{prompt}</div>
      </div>
    );
  }

  // Edit mode - show editing UI
  if (editing && !src) {
    return (
      <div
        className={`border-2 border-dashed border-muted-foreground/30 rounded-lg p-6 text-center ${className ?? ""}`}
        style={{ minHeight: height }}
      >
        <div className="text-muted-foreground text-sm">
          <div className="font-medium mb-1">New Block</div>
          <div className="text-xs">Click to edit or type a prompt</div>
        </div>
      </div>
    );
  }

  // Embed mode - need src
  if (!src) {
    return (
      <div className={`text-muted-foreground text-sm italic ${className ?? ""}`}>
        Block requires src, editing, or prompt
      </div>
    );
  }

  // Check embed depth
  if (ctx.depth >= MAX_EMBED_DEPTH) {
    return (
      <div className={`text-muted-foreground text-sm italic ${className ?? ""}`}>
        Embed depth exceeded (max {MAX_EMBED_DEPTH})
      </div>
    );
  }

  // Merge parent params with current params (current takes precedence)
  const mergedParams = { ...ctx.params, ...params };

  // If no fetch function is provided, show a placeholder
  if (!ctx.fetchBlockContent) {
    return (
      <div
        className={`border border-dashed border-border rounded p-4 text-center text-muted-foreground ${className ?? ""}`}
        style={{ minHeight: height }}
      >
        <div className="text-sm font-medium">{src}</div>
        <div className="text-xs mt-1">Block embed (configure fetchBlockContent)</div>
      </div>
    );
  }

  // Wrap content in a new context with incremented depth
  return (
    <BlockContext.Provider
      value={{
        depth: ctx.depth + 1,
        params: mergedParams,
        fetchBlockContent: ctx.fetchBlockContent,
      }}
    >
      <div className={className} style={{ minHeight: height }}>
        {ctx.fetchBlockContent(src)}
      </div>
    </BlockContext.Provider>
  );
}

// ============================================================================
// Plate Plugin
// ============================================================================

/**
 * Block Plate element component.
 */
function BlockElement(props: PlateElementProps) {
  const element = useElement<TBlockElement>();
  const _selected = useSelected();
  const _readOnly = useReadOnly();

  const { src, params, editing, prompt, height, className } = element;

  return (
    <PlateElement {...props}>
      <div contentEditable={false} style={{ userSelect: "none" }}>
        <BlockDisplay
          src={src}
          params={params}
          editing={editing}
          prompt={prompt}
          height={height}
          className={className}
        />
      </div>
      {/* Void elements still need children for Slate */}
      <span className="hidden">{props.children}</span>
    </PlateElement>
  );
}

/**
 * Block Plugin - for embedding blocks/pages inline.
 */
export const BlockPlugin = createPlatePlugin({
  key: BLOCK_KEY,
  node: {
    isElement: true,
    isInline: false,
    isVoid: true,
    component: memo(BlockElement),
  },
});

// ============================================================================
// Element Factory
// ============================================================================

export interface CreateBlockOptions {
  params?: Record<string, unknown>;
  editing?: boolean;
  prompt?: string;
  height?: number;
  className?: string;
}

/**
 * Create a Block element for insertion into editor.
 */
export function createBlockElement(src?: string, options?: CreateBlockOptions): TBlockElement {
  return {
    type: BLOCK_KEY,
    src,
    params: options?.params,
    editing: options?.editing,
    prompt: options?.prompt,
    height: options?.height,
    className: options?.className,
    children: [{ text: "" }],
  };
}

// ============================================================================
// Standalone Component
// ============================================================================

export interface BlockProps {
  /** Path to the block MDX file relative to pages/ */
  src?: string;
  /** Optional parameters to pass to the embedded block */
  params?: Record<string, unknown>;
  /** Whether the block is in editing/creation mode */
  editing?: boolean;
  /** AI prompt for block generation */
  prompt?: string;
  /** Height of the block container */
  height?: number;
  /** CSS class for the container */
  className?: string;
}

/**
 * Block component for direct use (outside Plate editor).
 * Requires a BlockProvider ancestor with fetchBlockContent configured.
 */
export function Block({ src, params, editing, prompt, height, className }: BlockProps) {
  return (
    <BlockDisplay
      src={src}
      params={params}
      editing={editing}
      prompt={prompt}
      height={height}
      className={className}
    />
  );
}

export { BLOCK_KEY };
