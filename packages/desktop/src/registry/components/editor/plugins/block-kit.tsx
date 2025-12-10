'use client';

/**
 * Block Plugin for Plate
 *
 * Renders RSC blocks from the worker. In MDX, blocks look like:
 * <Block id="my-block" />
 * <Block id="my-block" title="Custom Title" limit={10} />
 */

import { createPlatePlugin } from 'platejs/react';
import { BlockElement } from '@/registry/ui/block-node';

export const BLOCK_KEY = 'block';

export const BlockPlugin = createPlatePlugin({
  key: BLOCK_KEY,
  node: {
    isElement: true,
    isVoid: true,
  },
  render: {
    node: BlockElement,
  },
});

export const BlockKit = [BlockPlugin];
