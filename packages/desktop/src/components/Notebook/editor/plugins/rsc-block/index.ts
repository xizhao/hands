/**
 * RSC Block Plugin for Plate
 *
 * Defines a void element that renders server-rendered content from the worker.
 */

import { createPlatePlugin } from "platejs/react";
import { RscBlockElement } from "./RscBlockElement";

export const RscBlockPlugin = createPlatePlugin({
  key: "rsc_block",
  node: {
    isElement: true,
    isVoid: true,
  },
  render: {
    node: RscBlockElement,
  },
});

export { RscBlockElement };
