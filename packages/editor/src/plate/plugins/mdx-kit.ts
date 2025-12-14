/**
 * MDX Editor Kit
 *
 * Plugin bundle for MDX editing in Plate.
 * Extends the base EditorKit with RSC Block plugin.
 */

import { EditorKit } from "../editor-kit";
import { RscBlockPlugin } from "./rsc-block-plugin";

/**
 * MDX Editor Kit
 *
 * Full plugin bundle for MDX editing:
 * - All standard EditorKit plugins (headings, paragraphs, marks, DnD, etc.)
 * - RSC Block plugin for embedded JSX components
 */
export const MdxEditorKit = [
  // RSC Block Plugin - Must be before ElementPlugin to take precedence
  RscBlockPlugin,

  // All standard EditorKit plugins
  ...EditorKit,
];
