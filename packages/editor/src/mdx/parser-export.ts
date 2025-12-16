/**
 * MDX Parser Export (Node.js safe)
 *
 * This export is safe for use in build tools and Node.js environments.
 * It doesn't include any React components or browser-specific code.
 */

// Types
export type {
  CodeBlockElement,
  MdxFrontmatter,
  MdxParseResult,
  MdxSourceMap,
  MdxToPlateOptions,
  RscBlockElement,
  RscBlockInfo,
} from "./types";

export { isCodeBlockElement, isRscBlockElement } from "./types";

// Parsing
export { parseMdx } from "./parser";

// Frontmatter
export {
  parseFrontmatter,
  stripFrontmatter,
} from "./frontmatter";

export type { FrontmatterParseResult } from "./frontmatter";
