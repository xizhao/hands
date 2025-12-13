"use client";

import { PlateElement, type PlateElementProps } from "platejs/react";

export function ParagraphElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} className="px-0.5 py-[3px]">
      {props.children}
    </PlateElement>
  );
}
