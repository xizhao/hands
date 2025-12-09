import { BaseEquationPlugin, BaseInlineEquationPlugin } from '@platejs/math';

import {
  EquationElementStatic,
  InlineEquationElementStatic,
} from '@hands/stdlib/static';

export const BaseMathKit = [
  BaseInlineEquationPlugin.withComponent(InlineEquationElementStatic),
  BaseEquationPlugin.withComponent(EquationElementStatic),
];
