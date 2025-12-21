/**
 * MDX Editor Module
 *
 * Public exports for the MDX → Plate → MDX editing system.
 */

// Types
export type {
  CodeBlockElement,
  MdxFrontmatter,
  MdxParseResult,
  MdxSourceMap,
  MdxToPlateOptions,
  PlateToMdxOptions,
  RscBlockElement,
  RscBlockInfo,
} from "./types";

export { isCodeBlockElement, isRscBlockElement } from "./types";

// Parsing
export { parseMdx } from "./parser";

// Serialization
export { serializeMdx } from "./serializer";

// Frontmatter
export {
  parseFrontmatter,
  serializeFrontmatter,
  stripFrontmatter,
  updateFrontmatterField,
} from "./frontmatter";

export type { FrontmatterParseResult } from "./frontmatter";

// Editor Component
export { MdxVisualEditor } from "./MdxVisualEditor";
export type { MdxVisualEditorProps } from "./MdxVisualEditor";

// Plugin Kits (re-export from plate)
export { MdxEditorKit } from "../plate/plugins/mdx-kit";

// RSC Block Plugin (re-export from plate)
export { RscBlockPlugin, isRscBlockElement as isRscBlock } from "../plate/plugins/rsc-block-plugin";
