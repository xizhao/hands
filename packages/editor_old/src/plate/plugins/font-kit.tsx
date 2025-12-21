'use client';

import {
  FontBackgroundColorPlugin,
  FontColorPlugin,
  FontFamilyPlugin,
  FontSizePlugin,
} from '@platejs/basic-styles/react';
import { KEYS } from 'platejs';

// Target all text-containing elements
const targetPlugins = [
  KEYS.p,
  KEYS.h1,
  KEYS.h2,
  KEYS.h3,
  KEYS.h4,
  KEYS.h5,
  KEYS.h6,
  KEYS.blockquote,
  KEYS.li,
  KEYS.td,
  KEYS.th,
];

export const FontKit = [
  // Font color - must preserve nodeProps for style injection
  FontColorPlugin.configure({
    inject: {
      targetPlugins,
      nodeProps: {
        defaultNodeValue: 'black',
        nodeKey: 'color',
      },
    },
  }),
  // Background color - must preserve nodeProps for style injection
  FontBackgroundColorPlugin.configure({
    inject: {
      targetPlugins,
      nodeProps: {
        defaultNodeValue: 'transparent',
        nodeKey: 'backgroundColor',
      },
    },
  }),
  // Font size
  FontSizePlugin.configure({
    inject: {
      targetPlugins,
      nodeProps: {
        nodeKey: 'fontSize',
      },
    },
  }),
  // Font family
  FontFamilyPlugin.configure({
    inject: {
      targetPlugins,
      nodeProps: {
        nodeKey: 'fontFamily',
      },
    },
  }),
];
