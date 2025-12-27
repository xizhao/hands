import { SlateElement, type SlateElementProps } from 'platejs/static';
import * as React from 'react';

export function ParagraphElementStatic(props: SlateElementProps) {
  return (
    <SlateElement
      {...props}
      className="my-px px-0.5 py-px"
      data-block-id={props.element.id as string}
      style={{
        backgroundColor: props.element.backgroundColor as any,
      }}
    >
      {props.children}
    </SlateElement>
  );
}
