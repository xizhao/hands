/**
 * DnD Plugin Kit
 * Enables drag and drop for blocks
 */

import { DndPlugin } from "@platejs/dnd";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

import { BlockDraggable } from "../ui/block-draggable";

/**
 * DndKit with provider - use when DndProvider is NOT provided by parent
 */
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

/**
 * DndKit without provider - use when DndProvider is already provided by parent
 * (e.g., sandbox provides a shared DndProvider for all editors)
 */
export const DndKitWithoutProvider = [
  DndPlugin.configure({
    options: {
      enableScroller: true,
    },
    render: {
      aboveNodes: BlockDraggable,
      // No aboveSlate - uses parent's DndProvider
    },
  }),
];
