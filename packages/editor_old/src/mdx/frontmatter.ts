/**
 * MDX Frontmatter Handling
 *
 * Parses and serializes YAML frontmatter from MDX files.
 */

import YAML from "yaml";
import type { MdxFrontmatter } from "./types";
import type { SourceLocation } from "../ast/oxc-parser";

// ============================================================================
// Parsing
// ============================================================================

/** Result of parsing frontmatter from MDX source */
export interface FrontmatterParseResult {
  /** Parsed frontmatter object */
  frontmatter: MdxFrontmatter;
  /** Location of the frontmatter block (including delimiters) */
  loc: SourceLocation | null;
  /** Content start position (after frontmatter) */
  contentStart: number;
  /** Parse error if any */
  error?: string;
}

/** Frontmatter delimiter pattern */
const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

/**
 * Parse YAML frontmatter from MDX source
 *
 * @param source - The full MDX source string
 * @returns Parsed frontmatter and location info
 */
export function parseFrontmatter(source: string): FrontmatterParseResult {
  const match = source.match(FRONTMATTER_REGEX);

  if (!match) {
    return {
      frontmatter: {},
      loc: null,
      contentStart: 0,
    };
  }

  const yamlContent = match[1];
  const fullMatch = match[0];

  try {
    const parsed = YAML.parse(yamlContent);
    const frontmatter: MdxFrontmatter = typeof parsed === "object" && parsed !== null ? parsed : {};

    return {
      frontmatter,
      loc: {
        start: 0,
        end: fullMatch.length,
      },
      contentStart: fullMatch.length,
    };
  } catch (err) {
    return {
      frontmatter: {},
      loc: {
        start: 0,
        end: fullMatch.length,
      },
      contentStart: fullMatch.length,
      error: err instanceof Error ? err.message : "Failed to parse frontmatter",
    };
  }
}

// ============================================================================
// Serialization
// ============================================================================

/**
 * Serialize frontmatter object to YAML string with delimiters
 *
 * @param frontmatter - Frontmatter object to serialize
 * @returns YAML string with --- delimiters, or empty string if no frontmatter
 */
export function serializeFrontmatter(frontmatter: MdxFrontmatter): string {
  // Filter out undefined values
  const cleaned = Object.fromEntries(
    Object.entries(frontmatter).filter(([, v]) => v !== undefined),
  );

  // Empty frontmatter → no output
  if (Object.keys(cleaned).length === 0) {
    return "";
  }

  const yaml = YAML.stringify(cleaned, {
    indent: 2,
    lineWidth: 0, // Don't wrap lines
  }).trim();

  return `---\n${yaml}\n---\n\n`;
}

/**
 * Update a single frontmatter field
 *
 * @param source - The full MDX source
 * @param key - Field key to update
 * @param value - New value (undefined to remove)
 * @returns Updated source string
 */
export function updateFrontmatterField(
  source: string,
  key: string,
  value: unknown,
): string {
  const { frontmatter, contentStart } = parseFrontmatter(source);
  const content = source.slice(contentStart);

  if (value === undefined) {
    delete frontmatter[key];
  } else {
    frontmatter[key] = value;
  }

  return serializeFrontmatter(frontmatter) + content;
}

/**
 * Extract content without frontmatter
 *
 * @param source - The full MDX source
 * @returns Content string without frontmatter
 */
export function stripFrontmatter(source: string): string {
  const { contentStart } = parseFrontmatter(source);
  return source.slice(contentStart);
}
