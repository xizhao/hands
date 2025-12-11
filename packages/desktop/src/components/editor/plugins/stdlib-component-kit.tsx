'use client';

/**
 * Stdlib Component Plugin for Plate
 *
 * Renders React components from @hands/stdlib in the editor.
 * Components are rendered as void elements (non-editable content).
 */

import { createPlatePlugin } from 'platejs/react';
import { StdlibComponentNode } from '@/components/ui/stdlib-component-node';

export const STDLIB_COMPONENT_KEY = 'stdlib-component';

export const StdlibComponentPlugin = createPlatePlugin({
  key: STDLIB_COMPONENT_KEY,
  node: {
    isElement: true,
    isVoid: true,
  },
  render: {
    node: StdlibComponentNode,
  },
});

export const StdlibComponentKit = [StdlibComponentPlugin];
