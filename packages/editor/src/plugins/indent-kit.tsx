"use client";

import { IndentPlugin } from "@platejs/indent/react";
import { KEYS } from "platejs";

// Claim key for CKG support
const CLAIM_KEY = "Claim";

export const IndentKit = [
  IndentPlugin.configure({
    inject: {
      targetPlugins: [
        ...KEYS.heading,
        KEYS.p,
        KEYS.blockquote,
        KEYS.codeBlock,
        KEYS.toggle,
        KEYS.img,
        CLAIM_KEY,
      ],
    },
    options: {
      offset: 24,
    },
  }),
];
