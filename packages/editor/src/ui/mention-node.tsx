"use client";

/**
 * Mention Node Components
 *
 * Renders mention elements in the editor.
 * The @ input is handled by at-kit/AtGhostInputElement.
 */

import { IS_APPLE } from "platejs";
import { PlateElement, type PlateElementProps, useReadOnly } from "platejs/react";
import { useMounted } from "../hooks/use-mounted";
import { cn } from "../lib/utils";
import type { EditorMentionElement } from "../types";

/**
 * User Mention Element - renders @username style mentions
 */
export function MentionElement(
  props: PlateElementProps<EditorMentionElement> & {
    prefix?: string;
  },
) {
  const { children } = props;
  const element = props.element;
  const readOnly = useReadOnly();
  const mounted = useMounted();

  return (
    <PlateElement
      {...props}
      attributes={{
        ...props.attributes,
        contentEditable: false,
        "data-slate-value": element.value,
        draggable: true,
      }}
      className={cn(
        "inline-block cursor-pointer align-baseline font-medium text-primary/65",
        !readOnly && "cursor-pointer",
        (element.children[0] as any).bold === true && "font-bold",
        (element.children[0] as any).italic === true && "italic",
        (element.children[0] as any).underline === true && "underline",
      )}
    >
      <span className="font-semibold text-primary/45">@</span>
      {mounted && IS_APPLE ? (
        // Mac OS IME https://github.com/ianstormtaylor/slate/issues/3490
        <>
          {children}
          {props.prefix}
          {element.value}
        </>
      ) : (
        // Others like Android https://github.com/ianstormtaylor/slate/pull/5360
        <>
          {props.prefix}
          {element.value}
          {children}
        </>
      )}
    </PlateElement>
  );
}

/**
 * Mention Input Element - placeholder, actual input handled by at-kit
 *
 * @deprecated Use AtGhostInputElement from at-kit instead
 */
export function MentionInputElement(props: PlateElementProps) {
  const { children } = props;

  // Fallback for legacy usage - just show the @ with children
  return (
    <PlateElement {...props} as="span">
      <span className="rounded-md bg-muted px-1.5 py-0.5 align-baseline text-sm">
        <span className="font-bold">@</span>
        <span className="text-muted-foreground">...</span>
      </span>
      {children}
    </PlateElement>
  );
}
