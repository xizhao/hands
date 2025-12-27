import { SlateElement, type SlateElementProps } from 'platejs/static';
import * as React from 'react';

export function BlockquoteElementStatic(props: SlateElementProps) {
  return (
    <SlateElement
      as="blockquote"
      className="my-1 px-0.5 py-px"
      data-block-id={props.element.id as string}
      {...props}
    >
      <div className="border-primary border-l-[3px] px-4">{props.children}</div>
    </SlateElement>
  );
}
