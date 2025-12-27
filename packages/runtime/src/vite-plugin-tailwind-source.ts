/**
 * Vite plugin to inject @source directives for Tailwind v4
 *
 * Tailwind v4 uses @source in CSS to define content sources.
 * Since CSS doesn't support env vars, this plugin injects the
 * workbook path at build/dev time.
 *
 * NOTE: @source directive in Tailwind v4:
 * - Does NOT support glob patterns
 * - Uses directory paths only
 * - Paths must be relative to the CSS file
 */

import path from "node:path";
import type { Plugin } from "vite";

interface TailwindSourcePluginOptions {
  workbookPath: string;
}

export function tailwindSourcePlugin({ workbookPath }: TailwindSourcePluginOptions): Plugin {
  return {
    name: "tailwind-source",
    enforce: "pre",

    transform(code, id) {
      // Only transform our styles.css (strip query string for matching)
      const cleanId = id.split("?")[0];
      if (!cleanId.endsWith("pages/styles.css")) return null;

      // Skip ?url imports (they return JS, not CSS)
      if (id.includes("?url")) return null;

      // Skip if already contains our injection
      if (code.includes("/* Workbook content sources")) return null;

      // Calculate relative paths from CSS file to workbook directories
      const cssDir = path.dirname(cleanId);
      const blocksRelative = path.relative(cssDir, path.join(workbookPath, "blocks"));
      const uiRelative = path.relative(cssDir, path.join(workbookPath, "ui"));
      const pagesRelative = path.relative(cssDir, path.join(workbookPath, "pages"));

      // Core package UI components (DataGrid, charts, shadcn)
      const coreUiRelative = path.relative(cssDir, path.resolve(__dirname, "../../core/src/ui"));
      // Runtime components
      const runtimeRelative = path.relative(cssDir, path.resolve(__dirname, "../src"));
      // Editor UI components only (not workers which have problematic imports)
      const editorUiRelative = path.relative(cssDir, path.resolve(__dirname, "../../editor/src/ui"));

      console.log("[tailwind-source] Injecting @source for workbook:", blocksRelative, uiRelative, pagesRelative);
      console.log("[tailwind-source] Injecting @source for packages:", coreUiRelative, editorUiRelative, runtimeRelative);

      // Inject @source directives after @import/@plugin lines
      const sourceDirectives = `
/* Workbook content sources (injected by vite-plugin-tailwind-source) */
@source "${blocksRelative}";
@source "${uiRelative}";
@source "${pagesRelative}";
/* Package content sources */
@source "${coreUiRelative}";
@source "${editorUiRelative}";
@source "${runtimeRelative}";
`;

      const importRegex = /(@import\s+['"][^'"]+['"];?\s*\n|@plugin\s+['"][^'"]+['"];?\s*\n)+/;
      const match = code.match(importRegex);

      if (match) {
        const insertPos = match.index! + match[0].length;
        return {
          code: code.slice(0, insertPos) + sourceDirectives + code.slice(insertPos),
          map: null,
        };
      }

      // Fallback: prepend after first line
      const firstNewline = code.indexOf("\n");
      return {
        code: code.slice(0, firstNewline + 1) + sourceDirectives + code.slice(firstNewline + 1),
        map: null,
      };
    },
  };
}
