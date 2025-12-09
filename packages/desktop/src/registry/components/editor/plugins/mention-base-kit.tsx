import { BaseMentionPlugin } from '@platejs/mention';

import { MentionElementStatic } from '@hands/stdlib/static';

export const BaseMentionKit = [
  BaseMentionPlugin.withComponent(MentionElementStatic),
];
