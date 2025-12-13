/**
 * Block Draggable wrapper
 * Adds drag handle and drop line to blocks
 */

import { useDraggable, useDropLine } from "@platejs/dnd";
import { BlockSelectionPlugin } from "@platejs/selection/react";
import { GripVertical, PlusIcon } from "lucide-react";
import { type Path, PathApi } from "platejs";
import {
  MemoizedChildren,
  type PlateEditor,
  type PlateElementProps,
  type RenderNodeWrapper,
} from "platejs/react";
import * as React from "react";
import { cn } from "../../lib/utils";
import { Button } from "./button";

export const BlockDraggable: RenderNodeWrapper = (props) => {
  const { editor, element, path } = props;

  const enabled = React.useMemo(() => {
    if (editor.dom.readOnly) return false;
    // Only enable for top-level blocks
    if (path.length === 1) {
      return true;
    }
    return false;
  }, [editor, path]);

  if (!enabled) return;

  return (props) => <Draggable {...props} />;
};

function Draggable(props: PlateElementProps) {
  const { children, editor, element } = props;
  const blockSelectionApi = editor.getApi(BlockSelectionPlugin).blockSelection;

  const { isDragging, nodeRef, handleRef } = useDraggable({
    element,
    onDropHandler: (_, { dragItem }) => {
      const id = (dragItem as { id: string[] | string }).id;
      if (blockSelectionApi) {
        blockSelectionApi.add(id);
      }
    },
  });

  return (
    <div className={cn("group relative", isDragging && "opacity-50")}>
      {/* Gutter with drag handle - positioned to the left */}
      <div
        className={cn(
          "absolute -left-12 top-0 z-50 flex h-full items-start pt-0.5",
          "opacity-0 transition-opacity duration-150",
          "group-hover:opacity-100",
        )}
        contentEditable={false}
      >
        <div className="flex items-center gap-0.5">
          {/* Plus button to insert */}
          <Button
            className="size-6 p-0 opacity-0 group-hover:opacity-100"
            onClick={(event) => {
              event.stopPropagation();
              event.preventDefault();
              const at = editor.api.findPath(element);
              triggerSlashNextBlock(editor, "/", at, event.altKey);
            }}
            onMouseDown={() => {
              editor.tf.focus();
              editor.getApi(BlockSelectionPlugin).blockSelection.clear();
            }}
            tabIndex={-1}
            variant="ghost"
          >
            <PlusIcon className="size-4 text-gray-500" />
          </Button>

          {/* Drag handle */}
          <Button
            className="size-6 p-0 cursor-grab active:cursor-grabbing"
            data-plate-prevent-deselect
            ref={handleRef}
            variant="ghost"
          >
            <GripVertical className="size-4 text-gray-500" />
          </Button>
        </div>
      </div>

      {/* Block content wrapper */}
      <div
        className="slate-blockWrapper relative"
        onContextMenu={(event) =>
          editor.getApi(BlockSelectionPlugin).blockSelection.addOnContextMenu({ element, event })
        }
        ref={nodeRef}
      >
        <MemoizedChildren>{children}</MemoizedChildren>
        <DropLine />
      </div>
    </div>
  );
}

const DropLine = React.memo(function DropLine({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const { dropLine } = useDropLine();

  if (!dropLine) return null;

  return (
    <div
      {...props}
      className={cn(
        "slate-dropLine",
        "absolute inset-x-0 h-0.5 opacity-100 transition-opacity",
        "bg-blue-500",
        dropLine === "top" && "-top-px",
        dropLine === "bottom" && "-bottom-px",
        className,
      )}
    />
  );
});

const triggerSlashNextBlock = (
  editor: PlateEditor,
  triggerText: string,
  at?: Path,
  insertAbove = false,
) => {
  let _at: Path | undefined;

  if (at) {
    const slicedPath = at.slice(0, 1);
    _at = insertAbove ? slicedPath : PathApi.next(slicedPath);
  }

  editor.tf.insertNodes(editor.api.create.block(), {
    at: _at,
    select: true,
  });
  editor.tf.insertText(triggerText);
};
