"use client";

/**
 * PageContextPlugin - Stores page metadata for use by other plugins
 *
 * Allows CopilotPlugin and other plugins to access page title, description,
 * and other metadata without needing React context.
 *
 * @example
 * ```tsx
 * // Set context
 * editor.setOption(PageContextPlugin, 'title', 'My Page');
 * editor.setOption(PageContextPlugin, 'pageId', 'page-123');
 *
 * // Read context in a plugin
 * const title = editor.getOption(PageContextPlugin, 'title');
 * ```
 */

import { createPlatePlugin } from "platejs/react";

export interface PageContext {
  title?: string;
  description?: string;
  pageId?: string;
}

export const PageContextPlugin = createPlatePlugin({
  key: "pageContext",
  options: {
    title: undefined as string | undefined,
    description: undefined as string | undefined,
    pageId: undefined as string | undefined,
  },
});
