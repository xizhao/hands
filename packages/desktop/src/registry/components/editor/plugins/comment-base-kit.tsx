import { BaseCommentPlugin } from '@platejs/comment';

import { CommentLeafStatic } from '@hands/stdlib/static';

export const BaseCommentKit = [
  BaseCommentPlugin.withComponent(CommentLeafStatic),
];
