/**
 * Shared PlateStatic Renderer
 *
 * Single source of truth for static page rendering.
 * Used by runtime, workbook-server, and production builds.
 *
 * NOTE: This file is split into RSC-safe and Node-only parts.
 * - StaticPlugins, createStaticEditor: RSC-safe (no react-dom/server)
 * - renderPlateToHtml: Node.js only (uses react-dom/server)
 */

import { createSlateEditor, type Value } from "platejs";
import { PlateStatic } from "platejs/static";
import * as React from "react";

import { BaseBasicBlocksKit } from "../plugins/basic-blocks-base-kit";
import { BaseBasicMarksKit } from "../plugins/basic-marks-base-kit";
import { BaseLinkKit } from "../plugins/link-base-kit";
import { BaseTableKit } from "../plugins/table-base-kit";
import { BaseListKit } from "../plugins/list-base-kit";
import { BaseCodeBlockKit } from "../plugins/code-block-base-kit";
import { BaseCalloutKit } from "../plugins/callout-base-kit";
import { BaseToggleKit } from "../plugins/toggle-base-kit";
import { BaseColumnKit } from "../plugins/column-base-kit";
import { BaseMediaKit } from "../plugins/media-base-kit";
import { BaseMentionKit } from "../plugins/mention-base-kit";
import { BaseTocKit } from "../plugins/toc-base-kit";
import { BaseStdlibKit } from "../plugins/stdlib-base-kit";

/**
 * All base-kit plugins for static rendering
 */
export const StaticPlugins = [
  ...BaseBasicBlocksKit,
  ...BaseBasicMarksKit,
  ...BaseLinkKit,
  ...BaseTableKit,
  ...BaseListKit,
  ...BaseCodeBlockKit,
  ...BaseCalloutKit,
  ...BaseToggleKit,
  ...BaseColumnKit,
  ...BaseMediaKit,
  ...BaseMentionKit,
  ...BaseTocKit,
  ...BaseStdlibKit,
];

/**
 * Create a Plate editor configured for static rendering
 */
export function createStaticEditor(value: Value, additionalPlugins: any[] = []) {
  return createSlateEditor({
    value,
    plugins: [...StaticPlugins, ...additionalPlugins],
  });
}

/**
 * Render Plate value to React element (RSC-safe)
 */
export function renderPlateToElement(value: Value, additionalPlugins: any[] = []): React.ReactElement {
  const editor = createStaticEditor(value, additionalPlugins);
  return React.createElement(PlateStatic, { editor });
}
