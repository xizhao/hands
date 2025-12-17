/**
 * Slash Command Plugin Kit
 * Enables / command menu for inserting blocks
 */

import { SlashInputPlugin, SlashPlugin } from "@platejs/slash-command/react";
import { KEYS } from "platejs";

import { SlashInputElement } from "../ui/slash-menu";

// Element types where slash menu should be disabled
const CODE_TYPES = new Set(["code_block", "code", KEYS.codeBlock, KEYS.code]);

export const SlashKit = [
  SlashPlugin.configure({
    options: {
      triggerQuery: (editor) => {
        // Disable slash menu inside code blocks and inline code
        const isInCodeBlock = editor.api.some({
          match: (node: any) => CODE_TYPES.has(node.type),
        });
        return !isInCodeBlock;
      },
    },
  }),
  SlashInputPlugin.withComponent(SlashInputElement),
];
