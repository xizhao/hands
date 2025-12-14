'use client';

import { DndPlugin } from '@platejs/dnd';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

import { BlockDraggable } from '../ui/block-draggable';

/**
 * Handle file drops - only works if MediaKit (PlaceholderPlugin) is installed
 */
const handleDropFiles = ({ dragItem, editor, target }: { dragItem: { files: File[] }; editor: any; target: any }) => {
  console.log('[DndKit] handleDropFiles called:', { files: dragItem.files, target });

  // PlaceholderPlugin adds insert.media transform to editor.tf
  const insertMedia = editor.tf?.insert?.media;
  if (insertMedia) {
    console.log('[DndKit] Calling insertMedia');
    insertMedia(dragItem.files, { at: target, nextBlock: false });
  } else {
    console.warn('[DndKit] File drop ignored - MediaKit/PlaceholderPlugin not installed');
  }
};

/**
 * Intercept native file drops to prevent Slate's findEventRange error.
 * Returns true when files are being dropped to prevent default handling.
 * react-dnd's HTML5Backend handles the actual drop via onDropFiles.
 */
const handleNativeDrop = ({ event }: { event: React.DragEvent }) => {
  // If files are being dropped, return true to prevent Slate's default handler
  // which would try to call findEventRange and fail
  if (event.dataTransfer?.types.includes('Files')) {
    return true;
  }
  return false;
};

/**
 * DndKit with full DndProvider wrapper
 * Use this when Plate is the only DnD context in your app
 */
export const DndKit = [
  DndPlugin.configure({
    handlers: {
      onDrop: handleNativeDrop,
    },
    options: {
      enableScroller: true,
      onDropFiles: handleDropFiles,
    },
    render: {
      aboveNodes: BlockDraggable,
      aboveSlate: ({ children }) => (
        <DndProvider backend={HTML5Backend}>{children}</DndProvider>
      ),
    },
  }),
];

/**
 * DndKit WITHOUT DndProvider wrapper
 * Use this when a parent component provides the DndProvider
 * (e.g., sandbox with shared DnD context for both Plate and overlay editor)
 */
export const DndKitWithoutProvider = [
  DndPlugin.configure({
    handlers: {
      onDrop: handleNativeDrop,
    },
    options: {
      enableScroller: true,
      onDropFiles: handleDropFiles,
    },
    render: {
      aboveNodes: BlockDraggable,
    },
  }),
];
