/**
 * Block Selection Plugin Kit
 * Enables multi-block selection
 */

import { BlockSelectionPlugin } from "@platejs/selection/react";

import { BlockSelection } from "../ui/block-selection";

export const BlockSelectionKit = [
  BlockSelectionPlugin.configure(({ editor }) => ({
    options: {
      areaOptions: {
        boundaries: "#plate-editor-container",
        container: "#plate-editor-container",
        selectables: "#plate-editor-container .slate-selectable",
      },
      enableContextMenu: true,
    },
    render: {
      belowRootNodes: (props) => {
        if (!props.attributes.className?.includes("slate-selectable")) return null;

        return <BlockSelection {...(props as any)} />;
      },
    },
  })),
];
