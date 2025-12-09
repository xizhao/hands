'use client';

import { SlashInputPlugin, SlashPlugin } from '@platejs/slash-command/react';
import { KEYS } from 'platejs';
import { SlashInputElement } from '@/components/ui/slash-node';

/**
 * SlashKit - Slash command menu for inserting blocks
 *
 * Type "/" to trigger the slash command menu.
 */
export const SlashKit = [
  SlashPlugin.configure({
    options: {
      trigger: '/',
      triggerPreviousCharPattern: /^\s?$/,
      triggerQuery: (editor) =>
        !editor.api.some({
          match: { type: editor.getType(KEYS.codeBlock) },
        }),
    },
  }),
  SlashInputPlugin.withComponent(SlashInputElement),
];
