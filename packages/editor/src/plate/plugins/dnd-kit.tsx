/**
 * DnD Plugin Kit
 * Enables drag and drop for blocks
 */

import { DndPlugin } from "@platejs/dnd";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { BlockDraggable } from "../ui/block-draggable";

export const DndKit = [
  DndPlugin.configure({
    options: {
      enableScroller: true,
    },
    render: {
      aboveNodes: BlockDraggable,
      aboveSlate: ({ children }) => <DndProvider backend={HTML5Backend}>{children}</DndProvider>,
    },
  }),
];
