/**
 * At-Kit Plugin
 * Enables @ command menu for data queries
 *
 * Type "@" to trigger, enter natural language query,
 * get SQL + appropriate data visualization elements.
 *
 * Uses MentionPlugin which has built-in @ trigger support.
 * Uses extendPlugin pattern (like emoji-kit) to configure input component.
 */

import { MentionInputPlugin, MentionPlugin } from "@platejs/mention/react";

import { AtInputElement } from "../ui/at-menu";

export const AtKit = [
  MentionPlugin.configure({
    options: {
      trigger: "@",
      triggerPreviousCharPattern: /^$|^[\s"']$/,
    },
  }).extendPlugin(MentionInputPlugin, {
    render: { node: AtInputElement },
  }),
];
