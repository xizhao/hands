"use client";

import type {
  EmptyText,
  KEYS,
  PlainText,
  TBasicMarks,
  TCaptionProps,
  TComboboxInputElement,
  TCommentText,
  TElement,
  TFontMarks,
  TImageElement,
  TLineHeightProps,
  TLinkElement,
  TListProps,
  TMediaEmbedElement,
  TMentionElement,
  TResizableProps,
  TTableElement,
  TText,
  TTextAlignProps,
} from "platejs";

export interface EditorBlockElement extends TElement, TListProps {
  id?: string;
}

/** Inline Elements */

export interface EditorBlockquoteElement extends EditorTextBlockElement {
  type: typeof KEYS.blockquote;
}

export interface EditorCodeBlockElement extends EditorBlockElement {
  children: EditorCodeLineElement[];
  type: typeof KEYS.codeBlock;
}

export interface EditorCodeLineElement extends TElement {
  children: PlainText[];
  type: typeof KEYS.codeLine;
}

export interface EditorH1Element extends EditorTextBlockElement {
  type: typeof KEYS.h1;
}

export interface EditorH2Element extends EditorTextBlockElement {
  type: typeof KEYS.h2;
}

export interface EditorH3Element extends EditorTextBlockElement {
  type: typeof KEYS.h3;
}

export interface EditorHrElement extends EditorBlockElement {
  children: [EmptyText];
  type: typeof KEYS.hr;
}

/** Block props */

export interface EditorImageElement
  extends EditorBlockElement,
    TCaptionProps,
    TImageElement,
    TResizableProps {
  children: [EmptyText];
  type: typeof KEYS.img;
}

export interface EditorLinkElement extends TLinkElement {
  id: string;
  children: RichText[];
  type: typeof KEYS.link;
  icon?: string;
  title?: string;
}

export interface EditorMediaEmbedElement
  extends EditorBlockElement,
    TCaptionProps,
    TMediaEmbedElement,
    TResizableProps {
  children: [EmptyText];
  type: typeof KEYS.mediaEmbed;
}

/**
 * @deprecated Use TBlockElement from @hands/core/types instead.
 * This is kept for backward compatibility with existing code.
 */
export interface EditorSandboxedBlockElement extends EditorBlockElement {
  children: [EmptyText];
  type: "sandboxed_block";
  /** Block source ID - used to fetch from /preview/{src} */
  src?: string;
  /** Whether this block is being created */
  editing?: boolean;
  /** User prompt for AI to build this block */
  prompt?: string;
  /** Height of the iframe */
  height?: number;
}

/**
 * Block element - embeds MDX blocks inline or creates with AI.
 * Uses TBlockElement from @hands/core/types for the actual implementation.
 */
export interface EditorEmbedBlockElement extends TElement {
  children: [EmptyText];
  type: "block";
  /** Path to block MDX (e.g., "blocks/header") */
  src?: string;
  /** Parameters to pass to the embedded block */
  params?: Record<string, unknown>;
  /** Whether in editing/creation mode */
  editing?: boolean;
  /** AI prompt for generation */
  prompt?: string;
  /** Container height */
  height?: number;
  /** CSS class */
  className?: string;
}

export interface EditorLiveActionElement extends EditorBlockElement {
  type: "live_action";
  /** SQL statement to execute (UPDATE, INSERT, DELETE) */
  sql?: string;
  /** Alternative: action ID reference */
  src?: string;
  /** Named parameters for SQL */
  params?: Record<string, unknown>;
  /** Children are the interactive content */
  children: (TElement | TText)[];
}

export interface EditorMentionElement extends TMentionElement {
  children: [EmptyText];
  type: typeof KEYS.mention;
  key?: string;
  coverImage?: string;
  icon?: string;
}

export interface EditorMentionInputElement extends TComboboxInputElement {
  children: [PlainText];
  type: typeof KEYS.mentionInput;
}

export type EditorNestableBlock = EditorParagraphElement;

export interface EditorParagraphElement extends EditorTextBlockElement {
  type: typeof KEYS.p;
}

export interface EditorTableCellElement extends TElement {
  children: EditorNestableBlock[];
  type: typeof KEYS.td;
}

export interface EditorTableElement extends EditorBlockElement, TTableElement {
  children: EditorTableRowElement[];
  type: typeof KEYS.table;
}

export interface EditorTableRowElement extends TElement {
  children: EditorTableCellElement[];
  type: typeof KEYS.tr;
}

export interface EditorTextBlockElement extends TElement, TLineHeightProps, TTextAlignProps {
  children: (EditorLinkElement | EditorMentionElement | EditorMentionInputElement | RichText)[];
}

export interface EditorToggleElement extends EditorTextBlockElement {
  type: typeof KEYS.toggle;
}

export type EditorValue = (
  | EditorBlockquoteElement
  | EditorCodeBlockElement
  | EditorH1Element
  | EditorH2Element
  | EditorH3Element
  | EditorHrElement
  | EditorImageElement
  | EditorLiveActionElement
  | EditorMediaEmbedElement
  | EditorParagraphElement
  | EditorSandboxedBlockElement
  | EditorEmbedBlockElement
  | EditorTableElement
  | EditorToggleElement
)[];

export interface RichText extends TBasicMarks, TCommentText, TFontMarks, TText {
  kbd?: boolean;
}
