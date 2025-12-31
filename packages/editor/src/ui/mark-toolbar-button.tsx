"use client";

import { RangeApi } from "platejs";
import {
  useEditorRef,
  useEditorSelection,
  useMarkToolbarButton,
  useMarkToolbarButtonState,
} from "platejs/react";
import type * as React from "react";

import { ToolbarButton } from "./toolbar";

export function MarkToolbarButton({
  clear,
  nodeType,
  ...props
}: React.ComponentProps<typeof ToolbarButton> & {
  nodeType: string;
  clear?: string[] | string;
}) {
  const editor = useEditorRef();
  const selection = useEditorSelection();
  const state = useMarkToolbarButtonState({ clear, nodeType });
  const { props: buttonProps } = useMarkToolbarButton(state);

  // Disable when no selection or selection is collapsed (just a cursor)
  const isDisabled = !selection || RangeApi.isCollapsed(selection);

  return (
    <ToolbarButton
      {...buttonProps}
      {...props}
      disabled={isDisabled}
      onClick={() => {
        buttonProps.onClick?.();
        editor.tf.focus();
      }}
    />
  );
}
