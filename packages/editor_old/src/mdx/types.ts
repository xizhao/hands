/**
 * MDX Editor Types
 *
 * Type definitions for the MDX → Plate → MDX conversion system.
 */

import type { TElement, Value } from "platejs";
import type { SourceLocation } from "../ast/oxc-parser";

// ============================================================================
// Frontmatter
// ============================================================================

/** MDX frontmatter metadata */
export interface MdxFrontmatter {
  title?: string;
  description?: string;
  layout?: string;
  [key: string]: unknown;
}

// ============================================================================
// Parse Result
// ============================================================================

/** Source map tracking node locations in the original MDX */
export interface MdxSourceMap {
  /** Frontmatter location (if present) */
  frontmatter?: SourceLocation;
  /** Content start (after frontmatter) */
  contentStart: number;
  /** Node ID → source location */
  nodes: Map<string, SourceLocation>;
}

/** Result of parsing an MDX file */
export interface MdxParseResult {
  /** Parsed frontmatter metadata */
  frontmatter: MdxFrontmatter;
  /** Plate editor value */
  value: Value;
  /** Source map for surgical edits */
  sourceMap: MdxSourceMap;
  /** RSC blocks found in the document */
  rscBlocks: RscBlockInfo[];
  /** Any parse errors */
  errors: string[];
}

// ============================================================================
// RSC Block
// ============================================================================

/** Information about an RSC block in the document */
export interface RscBlockInfo {
  /** Stable node ID */
  id: string;
  /** Block source identifier (from src prop) */
  src: string;
  /** Additional props passed to the block */
  props: Record<string, unknown>;
  /** Source location of the block */
  loc: SourceLocation;
  /** Raw JSX source for the block */
  rawSource: string;
}

/** RSC Block element in the Plate tree */
export interface RscBlockElement extends TElement {
  type: "rsc-block";
  /** Block source identifier (from src prop) - empty string for new blocks */
  blockId: string;
  /** TSX source code for the block content */
  source: string;
  /** Additional props passed to the block */
  blockProps: Record<string, unknown>;
  /** Stable ID for surgical mutations */
  id: string;
  /** Whether this block is being created/edited (shows shimmer placeholder) */
  editing?: boolean;
  /** User prompt for AI to build this block (only set when editing) */
  prompt?: string;
  /** Plate requires children, even for void elements */
  children: [{ text: "" }];
}

/** Type guard for RSC block elements */
export function isRscBlockElement(element: TElement): element is RscBlockElement {
  return element.type === "rsc-block";
}

// ============================================================================
// Code Block (for fenced code in MDX)
// ============================================================================

/** Code block element in the Plate tree */
export interface CodeBlockElement extends TElement {
  type: "code-block";
  /** Programming language */
  language?: string;
  /** Code content */
  code: string;
  /** Stable ID */
  id: string;
  children: [{ text: "" }];
}

/** Type guard for code block elements */
export function isCodeBlockElement(element: TElement): element is CodeBlockElement {
  return element.type === "code-block";
}

// ============================================================================
// Page Title & Subtitle (from frontmatter)
// ============================================================================

/** Page title element - rendered as H1, cannot be deleted */
export interface PageTitleElement extends TElement {
  type: "page-title";
  id: string;
  children: Array<{ text: string }>;
}

/** Page subtitle element - rendered below title, cannot be deleted */
export interface PageSubtitleElement extends TElement {
  type: "page-subtitle";
  id: string;
  children: Array<{ text: string }>;
}

/** Type guard for page title elements */
export function isPageTitleElement(element: TElement): element is PageTitleElement {
  return element.type === "page-title";
}

/** Type guard for page subtitle elements */
export function isPageSubtitleElement(element: TElement): element is PageSubtitleElement {
  return element.type === "page-subtitle";
}

// ============================================================================
// Conversion Options
// ============================================================================

/** Options for MDX → Plate conversion */
export interface MdxToPlateOptions {
  /** Whether to include source locations for surgical edits */
  includeSourceLocations?: boolean;
  /** Custom JSX component handlers */
  components?: Record<string, (props: Record<string, unknown>) => TElement>;
}

/** Options for Plate → MDX conversion */
export interface PlateToMdxOptions {
  /** Indentation string (default: 2 spaces) */
  indent?: string;
  /** Whether to preserve original formatting hints */
  preserveFormatting?: boolean;
}
