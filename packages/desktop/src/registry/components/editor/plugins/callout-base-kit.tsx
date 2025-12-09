import { BaseCalloutPlugin } from '@platejs/callout';

import { CalloutElementStatic } from '@hands/stdlib/static';

export const BaseCalloutKit = [
  BaseCalloutPlugin.withComponent(CalloutElementStatic),
];
