/**
 * Node.js-only PlateStatic Renderer
 *
 * Uses react-dom/server which is NOT available in RSC context.
 * Only import this from Node.js server code (workbook-server, build scripts).
 */

import { renderToString } from "react-dom/server";
import * as React from "react";
import { PlateStatic } from "platejs/static";
import type { Value } from "platejs";

import { createStaticEditor } from "./plate-static-render";

/**
 * Render Plate value to HTML string (Node.js only)
 *
 * @param value - Plate document value
 * @param additionalPlugins - Extra plugins to include
 * @returns HTML string
 */
export function renderPlateToHtml(value: Value, additionalPlugins: any[] = []): string {
  const editor = createStaticEditor(value, additionalPlugins);
  return renderToString(React.createElement(PlateStatic, { editor }));
}
