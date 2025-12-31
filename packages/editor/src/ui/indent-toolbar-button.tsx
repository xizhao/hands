"use client";

import { TextIndent, TextOutdent } from "@phosphor-icons/react";

import { useIndentButton, useOutdentButton } from "@platejs/indent/react";
import type * as React from "react";

import { ToolbarButton } from "./toolbar";

export function IndentToolbarButton(props: React.ComponentProps<typeof ToolbarButton>) {
  const { props: buttonProps } = useIndentButton();

  return (
    <ToolbarButton {...props} {...buttonProps} tooltip="Indent">
      <TextIndent />
    </ToolbarButton>
  );
}

export function OutdentToolbarButton(props: React.ComponentProps<typeof ToolbarButton>) {
  const { props: buttonProps } = useOutdentButton();

  return (
    <ToolbarButton {...props} {...buttonProps} tooltip="Outdent">
      <TextOutdent />
    </ToolbarButton>
  );
}
