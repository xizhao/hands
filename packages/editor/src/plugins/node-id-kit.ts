'use client';

import { NodeIdPlugin } from 'platejs';

/**
 * NodeIdKit - Generates unique IDs for block elements
 *
 * Required for ToC sidebar to work - headings need IDs for scroll navigation.
 */
export const NodeIdKit = [
  NodeIdPlugin.configure({
    options: {
      // Generate IDs for all block elements (filter out inline elements)
      filterInline: true,
      // Normalize existing content to add IDs on load
      normalizeInitialValue: true,
      // ID creator function
      idCreator: () => crypto.randomUUID().slice(0, 8),
    },
  }),
];
