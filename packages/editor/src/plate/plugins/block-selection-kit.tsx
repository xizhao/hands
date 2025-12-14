/**
 * Block Selection Plugin Kit
 * Enables multi-block selection with filtering
 */

import { BlockSelectionPlugin } from "@platejs/selection/react";
import { getPluginTypes, KEYS } from "platejs";

import { BlockSelection } from "../ui/block-selection";

// Generic selector that works for both PlateVisualEditor and MdxVisualEditor
const EDITOR_CONTAINER_SELECTOR = "[data-slate-editor]";

export const BlockSelectionKit = [
  BlockSelectionPlugin.configure(({ editor }) => ({
    options: {
      areaOptions: {
        boundaries: EDITOR_CONTAINER_SELECTOR,
        container: EDITOR_CONTAINER_SELECTOR,
        selectables: `${EDITOR_CONTAINER_SELECTOR} .slate-selectable`,
      },
      enableContextMenu: true,
      isSelectable: (element) =>
        !getPluginTypes(editor, [KEYS.column, KEYS.codeLine, KEYS.td]).includes(
          element.type,
        ),
    },
    render: {
      belowRootNodes: (props) => {
        if (!props.attributes.className?.includes("slate-selectable"))
          return null;

        return <BlockSelection {...(props as any)} />;
      },
    },
  })),
];
