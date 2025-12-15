'use client';

import emojiMartData from '@emoji-mart/data';
import { EmojiInputPlugin, EmojiPlugin } from '@platejs/emoji/react';

import { EmojiInputElement } from '../ui/emoji-node';

export const EmojiKit = [
  EmojiPlugin.configure({
    options: { data: emojiMartData as any },
    render: {
      afterEditable: () => null, // Prevent default floating picker
    },
  }).extendPlugin(EmojiInputPlugin, {
    render: { node: EmojiInputElement },
  }),
];
