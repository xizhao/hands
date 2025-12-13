"use client";

import { isOrderedList } from "@platejs/list";
import type { TListElement } from "platejs";
import type { PlateElementProps, RenderNodeWrapper } from "platejs/react";

export const BlockList: RenderNodeWrapper = (props) => {
  if (!props.element.listStyleType) return;

  return (props) => <List {...props} />;
};

function List(props: PlateElementProps) {
  const { listStart, listStyleType } = props.element as TListElement;
  const ListTag = isOrderedList(props.element) ? "ol" : "ul";

  return (
    <ListTag className="relative m-0 p-0" start={listStart} style={{ listStyleType }}>
      <li>{props.children}</li>
    </ListTag>
  );
}
